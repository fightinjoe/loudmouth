import type { ContextResponse, Lang, PhrasebookResponse } from "@catchphrase/card-schema";
import { openBottomSheet } from "./bottom-sheet";
import type { BottomSheetHandle } from "./bottom-sheet";
import { renderRadioList, renderChecklistItem } from "./creation-choices";
import { bindCreationTextArea, renderCreationTextArea } from "./creation-text-area";
import { getContext, generatePhrasebook, getPhrasebookTitle } from "../js/phrasebook-api";
import type { Ability } from "../js/phrasebook-api";
import { commitPhrasebook as persistPhrasebook, getDecks } from "../js/db";
import type { Deck, DeckIllustration, Generation } from "../js/library-types";
import { createIllustrationTask } from "../js/phrasebook-illustration";
import type { IllustrationTask } from "../js/phrasebook-illustration";
import { CONTENT_LANGUAGES, LANG_FLAGS, LANG_NAMES } from "../js/lang";
import { icon } from "./icon";
import { renderPaneHeader, headerIconButton, headerSpacer } from "./pane-header";
import { escapeHTML } from "../js/utils";
import { getLastAbility, setLastAbility, getLastCreationLanguage, setLastCreationLanguage } from "../js/preferences";
import { ABILITIES, ABILITY_LABELS, ABILITY_QUESTION } from "../js/ability";

const PHRASEBOOK_MIN_LOADING_MS = 1000;

/** First-run language when neither a preference nor a saved phrasebook exists. */
const DEFAULT_LANGUAGE: Lang = "ja";

const PICKER_LANGUAGES: readonly Lang[] = [...CONTENT_LANGUAGES]
  .sort((a, b) => LANG_NAMES[a].localeCompare(LANG_NAMES[b]));

export const CREATION_SUGGESTIONS = [
  "Vegan dining in Tokyo",
  "Salsa dancing in Austin",
  "Help with medical issue",
  "Arguing with fascist uncle",
  "Surf vacation in Costa Rica",
] as const;

export const CHECKLIST_QUESTION = "Which topics should be included?";

type CreationStep = "initializing" | "topic" | "questions" | "checklist" | "generating" | "error";
type ResumeStep = "initializing" | "topic" | "checklist";
type PhrasebookRequestOutcome =
  | { status: "pending" }
  | { status: "ready"; result: PhrasebookResponse }
  | { status: "error"; error: unknown };

type ContextQuestion = ContextResponse["questions"][number];
type ChecklistItem = ContextResponse["checklist"][number];

interface ContextRequest {
  controller: AbortController;
}

interface TitleRequest {
  seed: string;
  controller: AbortController;
  title: string | null;
}

interface PhrasebookRequest {
  controller: AbortController;
  language: Lang;
  generation: Generation;
  outcome: PhrasebookRequestOutcome;
  promise: Promise<void>;
}

interface CommitRequest {
  controller: AbortController;
  promise: Promise<void>;
}

interface CreationState {
  step: CreationStep;
  /** The language dropdown is expanded; only meaningful on the topic step. */
  languageOpen: boolean;
  topic: string;
  contextSeed: string | null;
  questions: ContextQuestion[];
  questionIndex: number;
  otherQuestions: Set<number>;
  checklist: ChecklistItem[];
  answers: Record<string, string>;
  error: string | null;
  resumeStep: ResumeStep;
  contextRequest: ContextRequest | null;
  titleRequest: TitleRequest | null;
  frozenTitle: string | null;
  phrasebookRequest: PhrasebookRequest | null;
  commitRequest: CommitRequest | null;
  illustrationTask: IllustrationTask | null;
}

export interface CreationPanelParams {
  lang?: Lang;
  ability?: Ability;
  seed?: string;
}

export type PhrasebookCreatedCallback = (deck: Deck) => void;

/**
 * Opens the guided phrasebook creation flow. Generation is speculative, but
 * the selected generated groups become durable only through one atomic
 * commitPhrasebook transaction after the learner confirms the checklist.
 */
export function openCreationPanel(
  appElement: HTMLElement,
  { lang: initialLanguage, ability: initialAbility, seed: initialSeed = "" }: CreationPanelParams,
  onCreated: PhrasebookCreatedCallback,
  onDismiss?: () => void,
  onIllustrationUpdated: (deckId: string, illustration: DeckIllustration) => void = () => {},
): BottomSheetHandle {
  let lang = initialLanguage ?? getLastCreationLanguage();
  let rememberedAbility = lang ? initialAbility ?? getLastAbility(lang) : undefined;
  const state: CreationState = {
    step: lang ? "topic" : "initializing",
    languageOpen: false,
    topic: initialSeed,
    contextSeed: null,
    questions: [],
    questionIndex: 0,
    otherQuestions: new Set(),
    checklist: [],
    answers: Object.create(null),
    error: null,
    resumeStep: "topic",
    contextRequest: null,
    titleRequest: null,
    frozenTitle: null,
    phrasebookRequest: null,
    commitRequest: null,
    illustrationTask: null,
  };
  let dismissed = false;
  let completed = false;
  let committingText = false;
  let ownerDisposed = false;
  let disposeTextArea: (() => void) | undefined;
  let disposePanelListeners: (() => void) | undefined;
  // Assigned in onMount, which runs before openBottomSheet returns `sheet`.
  let inner!: HTMLElement;
  let stepElement!: HTMLElement;
  let focusObserver: ResizeObserver | undefined;

  const sheet = openBottomSheet(appElement, {
    kind: "creation",
    size: "full",
    bodyHTML: `<div class="creation-panel-inner" data-language-open="false" data-step="${state.step}">
      <div class="creation-focus-backdrop" aria-hidden="true"></div>
      <div class="creation-step flex-col">${renderStep(state, lang)}</div>
    </div>`,
    onDispose: dispose,
    onClose: onDismiss,
    onMount: (panel) => {
      inner = panel.querySelector<HTMLElement>(".creation-panel-inner")!;
      stepElement = inner.querySelector<HTMLElement>(".creation-step")!;
      disposePanelListeners = bindPanel(panel);
      if (typeof ResizeObserver !== "undefined") focusObserver = new ResizeObserver(syncFocusBackdrop);
      afterRender({ focusInput: true });
      // Place the backdrop without animation, then let later moves transition.
      requestAnimationFrame(() => { inner.dataset.focusReady = ""; });
    },
  });

  if (!lang) void initializeLanguage();

  return {
    panel: sheet.panel,
    scrim: sheet.scrim,
    close: sheet.close,
    dispose: () => {
      ownerDisposed = true;
      sheet.dispose();
    },
  };

  async function initializeLanguage(): Promise<void> {
    state.step = "initializing";
    state.resumeStep = "initializing";
    state.error = null;
    rerender();
    try {
      const decks = await getDecks(null);
      if (dismissed) return;
      const newest = decks.reduce<Deck | undefined>((latest, deck) =>
        !latest || deck.createdAt > latest.createdAt ? deck : latest, undefined);
      lang = newest?.lang ?? DEFAULT_LANGUAGE;
      rememberedAbility = initialAbility ?? getLastAbility(lang);
      // First run: no remembered language and no library to infer one from.
      state.languageOpen = !newest;
      state.step = "topic";
      state.resumeStep = "topic";
    } catch (error) {
      if (dismissed) return;
      state.error = errorMessage(error);
      state.step = "error";
    }
    rerender({ focusInput: state.step === "topic" });
  }

  function selectLanguage(selected: Lang): void {
    if (dismissed) return;
    if (selected !== lang) {
      resetContext();
      abortTitleRequest();
      state.frozenTitle = null;
      lang = selected;
      rememberedAbility = selected === initialLanguage
        ? initialAbility ?? getLastAbility(selected)
        : getLastAbility(selected);
    }
    setLastCreationLanguage(selected);
    const label = languageLabel(selected);
    const toggle = stepElement.querySelector<HTMLElement>('[data-action="creation/toggle-language"]');
    toggle?.setAttribute("aria-label", `Language: ${LANG_NAMES[selected]}`);
    const toggleLabel = toggle?.querySelector(".creation-language-label");
    if (toggleLabel) toggleLabel.textContent = label;
    stepElement.querySelectorAll<HTMLElement>('[data-action="creation/language"]').forEach((option) => {
      option.setAttribute("aria-pressed", String(option.getAttribute("value") === selected));
    });
    closeLanguagePicker({ focusToggle: true });
  }

  function openLanguagePicker(): void {
    const picker = stepElement.querySelector<HTMLElement>(".creation-language-popover");
    const toggle = stepElement.querySelector<HTMLElement>('[data-action="creation/toggle-language"]');
    if (!picker || !toggle || dismissed) return;
    state.languageOpen = true;
    // The picker reveals itself from the dropdown's own footprint.
    picker.style.setProperty("--creation-pill-width", `${toggle.offsetWidth}px`);
    void picker.offsetWidth;
    inner.dataset.languageOpen = "true";
    toggle.setAttribute("aria-expanded", "true");
    const selected = picker.querySelector<HTMLElement>('[aria-pressed="true"]')
      ?? picker.querySelector<HTMLElement>('[data-action="creation/language"]');
    selected?.focus();
  }

  function closeLanguagePicker({ focusToggle = false }: { focusToggle?: boolean } = {}): void {
    state.languageOpen = false;
    inner.dataset.languageOpen = "false";
    const toggle = stepElement.querySelector<HTMLElement>('[data-action="creation/toggle-language"]');
    toggle?.setAttribute("aria-expanded", "false");
    if (focusToggle) toggle?.focus();
  }

  function dispose(): void {
    disposeTextArea?.();
    disposeTextArea = undefined;
    disposePanelListeners?.();
    disposePanelListeners = undefined;
    focusObserver?.disconnect();
    if (dismissed || completed) return;
    dismissed = true;
    abortContextRequest();
    abortTitleRequest();
    invalidatePhrasebook();
    state.commitRequest?.controller.abort();
    // An in-flight transaction decides whether this task gains a durable owner.
    // Cancellation is deferred until that transaction has actually rolled back.
    if (!committingText) state.illustrationTask?.cancel();
  }

  function abortContextRequest(): void {
    const request = state.contextRequest;
    state.contextRequest = null;
    request?.controller.abort();
  }

  function abortTitleRequest(): void {
    const request = state.titleRequest;
    state.titleRequest = null;
    request?.controller.abort();
  }

  function ensureTitleRequest(seed: string): void {
    if (state.titleRequest?.seed === seed) return;
    abortTitleRequest();
    state.frozenTitle = null;
    const request: TitleRequest = {
      seed,
      controller: new AbortController(),
      title: null,
    };
    state.titleRequest = request;
    // Naming is opportunistic and deliberately never blocks creation.
    void getPhrasebookTitle({ seed, signal: request.controller.signal }).then(
      (result) => {
        if (dismissed || completed || state.titleRequest !== request || state.frozenTitle !== null) return;
        if (typeof result.title === "string" && result.title.trim()) {
          request.title = result.title.trim();
        }
      },
      () => { /* The sanitized seed remains the fallback name. */ },
    );
  }

  function invalidatePhrasebook(): void {
    const request = state.phrasebookRequest;
    state.phrasebookRequest = null;
    request?.controller.abort();
  }

  function resetContext(): void {
    abortContextRequest();
    invalidatePhrasebook();
    state.illustrationTask?.cancel();
    state.illustrationTask = null;
    state.contextSeed = null;
    state.questions = [];
    state.questionIndex = 0;
    state.otherQuestions.clear();
    state.checklist = [];
    state.answers = Object.create(null);
  }

  function rerender({ focusInput = false }: { focusInput?: boolean } = {}): void {
    if (dismissed || !stepElement) return;
    disposeTextArea?.();
    disposeTextArea = undefined;
    stepElement.innerHTML = renderStep(state, lang);
    afterRender({ focusInput });
  }

  function afterRender({ focusInput }: { focusInput: boolean }): void {
    inner.dataset.step = state.step;
    inner.dataset.languageOpen = "false";
    bind();
    syncFocusBackdrop();
    if (focusObserver) {
      focusObserver.disconnect();
      focusObserver.observe(stepElement);
      const region = stepElement.querySelector<HTMLElement>("[data-focus-region]");
      if (region) focusObserver.observe(region);
    }
    if (state.step === "topic" && state.languageOpen) {
      openLanguagePicker();
    } else if (state.step === "topic") {
      if (focusInput) stepElement.querySelector<HTMLTextAreaElement>(".creation-input-field")?.focus();
    } else if (state.step === "questions" || state.step === "checklist") {
      stepElement.querySelector<HTMLElement>(".creation-question-label")?.focus();
    } else {
      stepElement.querySelector<HTMLElement>("[data-creation-focus]")?.focus();
    }
  }

  /** Moves the shared white backdrop behind the current area of focus. */
  function syncFocusBackdrop(): void {
    const region = stepElement?.querySelector<HTMLElement>("[data-focus-region]");
    if (!region) return;
    const regionBox = region.getBoundingClientRect();
    const innerBox = inner.getBoundingClientRect();
    inner.style.setProperty("--creation-focus-top", `${regionBox.top - innerBox.top + inner.scrollTop}px`);
    inner.style.setProperty("--creation-focus-height", `${regionBox.height}px`);
  }

  /** Panel-lifetime listeners: dismissing the language picker from outside or with Escape. */
  function bindPanel(panel: HTMLElement): () => void {
    let suppressClickUntil = 0;
    const pointerDown = (event: PointerEvent): void => {
      suppressClickUntil = 0;
      if (state.step !== "topic" || !state.languageOpen) return;
      if (event.target instanceof Element && event.target.closest(".creation-language-picker")) return;
      closeLanguagePicker();
      // The tap that dismisses the picker does not also activate what it landed on.
      suppressClickUntil = event.timeStamp + 1000;
    };
    const clickCapture = (event: MouseEvent): void => {
      if (event.timeStamp > suppressClickUntil) return;
      suppressClickUntil = 0;
      event.preventDefault();
      event.stopPropagation();
    };
    const keydown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || state.step !== "topic" || !state.languageOpen) return;
      event.stopPropagation();
      closeLanguagePicker({ focusToggle: true });
    };
    panel.addEventListener("pointerdown", pointerDown, true);
    panel.addEventListener("click", clickCapture, true);
    panel.addEventListener("keydown", keydown);
    return () => {
      panel.removeEventListener("pointerdown", pointerDown, true);
      panel.removeEventListener("click", clickCapture, true);
      panel.removeEventListener("keydown", keydown);
    };
  }

  async function submitTopic(rawTopic: string): Promise<void> {
    const topic = rawTopic.trim();
    if (!topic || !lang || dismissed) return;

    setLastCreationLanguage(lang);
    state.languageOpen = false;
    state.topic = topic;
    ensureTitleRequest(topic);
    state.resumeStep = "topic";
    state.error = null;
    if (topic === state.contextSeed) {
      state.questionIndex = 0;
      showQuestionsOrChecklist();
      return;
    }

    resetContext();
    state.step = "generating";
    rerender();

    const controller = new AbortController();
    const request: ContextRequest = { controller };
    state.contextRequest = request;
    try {
      const { questions, checklist, imagePrompt } = await getContext({
        seed: topic,
        language: lang,
        ...(rememberedAbility ? { ability: rememberedAbility } : {}),
        signal: controller.signal,
      });
      if (dismissed || state.contextRequest !== request) return;
      state.illustrationTask = createIllustrationTask(imagePrompt, (deckId, illustration) => {
        if (!ownerDisposed) onIllustrationUpdated(deckId, illustration);
      });
      // This question is client-owned; model-provided options are never used.
      state.questions = questions.filter((question) => question.label !== ABILITY_QUESTION);
      if (!rememberedAbility) {
        state.questions.unshift({
          label: ABILITY_QUESTION,
          options: ABILITIES.map((ability) => ABILITY_LABELS[ability]),
        });
      }
      state.checklist = normalizeChecklist(checklist);
      state.contextSeed = topic;
      showQuestionsOrChecklist();
      state.contextRequest = null;
      return;
    } catch (error) {
      if (dismissed || state.contextRequest !== request) return;
      state.contextRequest = null;
      state.contextSeed = null;
      state.error = errorMessage(error);
      state.step = "error";
    }
    rerender();
  }

  function ensurePhrasebookRequest(): PhrasebookRequest {
    if (state.phrasebookRequest) return state.phrasebookRequest;
    if (!lang) throw new Error("Choose a language before continuing.");

    const answers = Object.fromEntries(
      Object.entries(state.answers).filter(([label]) => label !== ABILITY_QUESTION),
    );
    const chosenAbility = rememberedAbility
      ?? ABILITIES.find((ability) => ABILITY_LABELS[ability] === state.answers[ABILITY_QUESTION]);
    if (!chosenAbility) throw new Error("Choose your language ability before continuing.");

    const generation: Generation = {
      seed: state.topic,
      ability: chosenAbility,
      answers,
    };
    const checklist = state.checklist.map((item) => item.label);
    const controller = new AbortController();
    const request: PhrasebookRequest = {
      controller,
      language: lang,
      generation,
      outcome: { status: "pending" },
      promise: Promise.resolve(),
    };
    state.phrasebookRequest = request;
    request.promise = generatePhrasebook({
      ...generation,
      language: request.language,
      checklist,
      signal: controller.signal,
    }).then(
      (result) => {
        if (!dismissed && state.phrasebookRequest === request) {
          request.outcome = { status: "ready", result };
        }
      },
      (error: unknown) => {
        if (!dismissed && state.phrasebookRequest === request) {
          request.outcome = { status: "error", error };
        }
      },
    );
    return request;
  }

  async function submitContext(): Promise<void> {
    if (dismissed || state.commitRequest) return;
    const request = ensurePhrasebookRequest();
    if (request.outcome.status === "error") {
      showPhrasebookError(request.outcome.error);
      return;
    }

    const selectedIndexes = Object.freeze(
      state.checklist
        .map((item, index) => (item.checked ? index : -1))
        .filter((index) => index >= 0),
    );
    state.frozenTitle ??= state.titleRequest?.title ?? state.topic;
    const title = state.frozenTitle;
    abortTitleRequest();

    state.resumeStep = "checklist";
    state.step = "generating";
    state.error = null;
    rerender();

    const controller = new AbortController();
    const commitRequest: CommitRequest = {
      controller,
      promise: commitGeneratedPhrasebook(request, selectedIndexes, title, controller.signal),
    };
    state.commitRequest = commitRequest;
    try {
      await commitRequest.promise;
    } finally {
      if (state.commitRequest === commitRequest) state.commitRequest = null;
      if (dismissed && !completed) state.illustrationTask?.cancel();
    }
  }

  async function commitGeneratedPhrasebook(
    request: PhrasebookRequest,
    selectedIndexes: readonly number[],
    title: string,
    signal: AbortSignal,
  ): Promise<void> {
    await Promise.all([
      request.promise,
      new Promise<void>((resolve) => setTimeout(resolve, PHRASEBOOK_MIN_LOADING_MS)),
    ]);
    if (dismissed || state.phrasebookRequest !== request) return;
    if (request.outcome.status !== "ready") {
      const error = request.outcome.status === "error" ? request.outcome.error : null;
      showPhrasebookError(error);
      return;
    }

    let deck: Deck;
    committingText = true;
    try {
      deck = await persistPhrasebook({
        name: title,
        lang: request.language,
        generation: request.generation,
        groups: request.outcome.result.groups,
        selectedIndexes,
        ...(state.illustrationTask ? { illustration: state.illustrationTask.snapshot() } : {}),
      }, { signal });
    } catch (error) {
      if (!dismissed) showPhrasebookError(error);
      return;
    } finally {
      committingText = false;
    }
    await state.illustrationTask?.bind(deck.id);

    // Transaction completion is the success boundary. A dismissal that races
    // after it never deletes the committed phrasebook.
    setLastAbility(request.language, request.generation.ability);
    completed = true;
    if (dismissed || ownerDisposed) return;
    sheet.close();
    onCreated(deck);
  }

  function showPhrasebookError(error: unknown): void {
    state.resumeStep = "checklist";
    state.error = errorMessage(error);
    state.step = "error";
    rerender();
  }

  function showQuestionsOrChecklist(): void {
    state.step = state.questions.length > 0 ? "questions" : "checklist";
    if (state.step === "checklist") ensurePhrasebookRequest();
    rerender();
  }

  function nextQuestion(): void {
    const question = state.questions[state.questionIndex];
    if (!question || !state.answers[question.label]?.trim()) return;
    if (state.questionIndex < state.questions.length - 1) {
      state.questionIndex += 1;
    } else {
      state.step = "checklist";
      ensurePhrasebookRequest();
    }
    rerender();
  }

  // Back walks the checklist and each question in reverse before returning to
  // the topic; Back while context is pending returns to the topic.
  function goBack(): void {
    if (state.step === "checklist") {
      state.questionIndex = Math.max(0, state.questions.length - 1);
      state.step = state.questions.length > 0 ? "questions" : "topic";
      rerender({ focusInput: state.step === "topic" });
    } else if (state.step === "questions") {
      if (state.questionIndex > 0) {
        state.questionIndex -= 1;
        rerender();
      } else {
        state.step = "topic";
        rerender({ focusInput: true });
      }
    } else if (state.step === "generating" && state.resumeStep === "topic") {
      abortContextRequest();
      state.step = "topic";
      rerender({ focusInput: true });
    } else {
      sheet.close();
    }
  }

  function bind(): void {
    stepElement.querySelector<HTMLButtonElement>('[data-action="creation/back"]')
      ?.addEventListener("click", goBack);
    stepElement.querySelector<HTMLButtonElement>('[data-action="creation/previous-question"]')
      ?.addEventListener("click", goBack);
    stepElement.querySelector<HTMLButtonElement>('[data-action="creation/cancel"]')
      ?.addEventListener("click", () => sheet.close());

    if (state.step === "topic") bindTopicStep();
    if (state.step === "questions") bindQuestionsStep();
    if (state.step === "checklist") bindChecklistStep();
    if (state.step === "error") bindErrorStep();
  }

  function bindTopicStep(): void {
    stepElement.querySelector<HTMLButtonElement>('[data-action="creation/toggle-language"]')
      ?.addEventListener("click", openLanguagePicker);
    stepElement.querySelectorAll<HTMLButtonElement>('[data-action="creation/language"]')
      .forEach((option) => {
        option.addEventListener("click", () => {
          const selected = CONTENT_LANGUAGES.find((language) => language === option.value);
          if (selected) selectLanguage(selected);
        });
      });

    const lookup = stepElement.querySelector<HTMLElement>(".creation-lookup")!;
    disposeTextArea = bindCreationTextArea(lookup, {
      value: state.topic,
      onInput(nextTopic) {
        if (state.contextSeed !== null && nextTopic.trim() !== state.contextSeed) {
          invalidatePhrasebook();
        }
        state.topic = nextTopic;
      },
      onClear() {
        if (state.contextSeed !== null) invalidatePhrasebook();
        state.topic = "";
      },
      onSubmit(topic) {
        void submitTopic(topic);
      },
    });

    stepElement.querySelectorAll<HTMLButtonElement>('[data-action="creation/suggestion"]')
      .forEach((suggestion) => {
        suggestion.addEventListener("click", () => {
          const seed = suggestion.dataset.seed ?? "";
          const input = stepElement.querySelector<HTMLTextAreaElement>(".creation-input-field");
          if (input) input.value = seed;
          state.topic = seed;
          void submitTopic(seed);
        });
      });
  }

  function bindQuestionsStep(): void {
    const question = state.questions[state.questionIndex];
    if (!question) return;
    const setAnswer = (value: string): void => {
      if (state.answers[question.label] !== value) {
        state.answers[question.label] = value;
        invalidatePhrasebook();
      }
      const next = stepElement.querySelector<HTMLButtonElement>('[data-action="creation/next-question"]');
      if (next) next.disabled = !value.trim();
    };

    stepElement.querySelectorAll<HTMLInputElement>('[data-action="creation/answer"]')
      .forEach((radio) => {
        radio.addEventListener("change", () => {
          state.otherQuestions.delete(state.questionIndex);
          setAnswer(radio.value);
        });
      });

    const otherRadio = stepElement.querySelector<HTMLInputElement>('[data-action="creation/other"]');
    const otherInput = stepElement.querySelector<HTMLInputElement>(".creation-other-input");
    const selectOther = (): void => {
      if (!otherRadio || !otherInput) return;
      otherRadio.checked = true;
      state.otherQuestions.add(state.questionIndex);
      setAnswer(otherInput.value.trim());
    };
    otherRadio?.addEventListener("change", () => {
      selectOther();
      otherInput?.focus();
    });
    otherInput?.addEventListener("focus", selectOther);
    otherInput?.addEventListener("input", selectOther);
    otherInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        nextQuestion();
      }
    });

    stepElement.querySelector<HTMLButtonElement>('[data-action="creation/next-question"]')
      ?.addEventListener("click", nextQuestion);
  }

  function bindChecklistStep(): void {
    stepElement.querySelectorAll<HTMLButtonElement>('[data-action="creation/toggle-checklist-item"]')
      .forEach((row) => {
        row.addEventListener("click", () => {
          const index = Number(row.dataset.index);
          const item = state.checklist[index];
          if (!Number.isInteger(index) || !item) return;
          const checkedCount = state.checklist.filter((candidate) => candidate.checked).length;
          if ((item.checked && checkedCount === 1) || (!item.checked && checkedCount === 8)) return;
          item.checked = !item.checked;
          row.dataset.checked = String(item.checked);
          row.setAttribute("aria-pressed", String(item.checked));
        });
      });

    stepElement.querySelector<HTMLButtonElement>('[data-action="creation/submit-context"]')
      ?.addEventListener("click", () => { void submitContext(); });
  }

  function bindErrorStep(): void {
    stepElement.querySelector<HTMLButtonElement>('[data-action="creation/retry"]')
      ?.addEventListener("click", () => {
        if (state.resumeStep === "initializing") {
          void initializeLanguage();
          return;
        }
        state.step = state.questions.length > 0 ? state.resumeStep : "topic";
        state.error = null;
        if (state.step === "checklist") {
          invalidatePhrasebook();
          ensurePhrasebookRequest();
        }
        rerender({ focusInput: state.step === "topic" });
      });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Something went wrong. Please try again.";
}

// ── Render ───────────────────────────────────────────────────────────────

function renderStep(state: Readonly<CreationState>, lang: Lang | undefined): string {
  switch (state.step) {
    case "initializing":
      return renderLookup(state, lang) + renderStatusCard("Opening your library…");
    case "topic":
      if (!lang) throw new Error("Choose a language before continuing.");
      return renderLookup(state, lang) + renderSuggestions();
    case "questions":
      return renderLookup(state, lang) + renderQuestionCard(state);
    case "checklist":
      return renderLookup(state, lang) + renderChecklistCard(state);
    case "generating":
      return renderLookup(state, lang) + renderStatusCard(
        state.resumeStep === "checklist" ? "Building your phrasebook…" : "Thinking about the situation…",
        "creation-generating",
      );
    case "error":
      return renderLookup(state, lang) + renderErrorCard(state);
  }
}

function languageLabel(lang: Lang): string {
  return `${LANG_FLAGS[lang]} ${LANG_NAMES[lang]}`.trim();
}

/**
 * The header and situation. On the topic step it is the editable area of
 * focus with the language dropdown; afterwards the situation is fixed text.
 */
function renderLookup(state: Readonly<CreationState>, lang: Lang | undefined): string {
  const editable = state.step === "topic" && lang !== undefined;
  const language = !lang
    ? `<span class="creation-language-toggle"></span>`
    : editable
      ? `<button class="creation-language-toggle tappable flex items-center" data-action="creation/toggle-language" aria-label="Language: ${escapeHTML(LANG_NAMES[lang])}" aria-haspopup="true" aria-expanded="false" aria-controls="creation-language-picker">
          <span class="creation-language-label">${escapeHTML(languageLabel(lang))}</span>${icon("chevron-down", { className: "creation-language-chevron" })}
        </button>`
      : `<span class="creation-language-toggle flex items-center"><span class="creation-language-label">${escapeHTML(languageLabel(lang))}</span></span>`;
  return `<section class="creation-lookup flex-col" ${editable ? "data-focus-region" : ""} data-has-value="${state.topic.length > 0}">
    ${renderPaneHeader({
      leading: headerIconButton("back", { action: "creation/back", label: "Back", className: "creation-back" }),
      title: language,
      trailing: editable
        ? headerIconButton("close", { action: "creation/clear", label: "Clear situation", className: "creation-clear" })
        : headerSpacer(),
    })}
    ${editable ? renderLanguagePicker(lang) : ""}
    <div class="creation-term flex">
      ${editable ? renderCreationTextArea(state.topic) : `<p class="creation-term-text">${escapeHTML(state.topic)}</p>`}
    </div>
  </section>`;
}

function renderLanguagePicker(lang: Lang): string {
  return `<div class="creation-language-popover">
    <div class="creation-language-picker flex-col" id="creation-language-picker" role="group" aria-label="Choose a language">
      ${PICKER_LANGUAGES.map((option) => `
        <button type="button" class="creation-language-option tappable flex items-center" data-action="creation/language" value="${option}" aria-pressed="${option === lang}">
          ${icon("check", { className: "creation-language-check" })}<span>${escapeHTML(languageLabel(option))}</span>
        </button>`).join("")}
    </div>
  </div>`;
}

function renderSuggestions(): string {
  return `<section class="creation-suggestions flex-col" aria-labelledby="creation-suggestions-title">
    <h2 class="creation-suggestions-title" id="creation-suggestions-title">Suggestions</h2>
    <ul class="creation-suggestion-list flex-col">
      ${CREATION_SUGGESTIONS.map((seed) => `<li><button type="button" class="creation-suggestion tappable" data-action="creation/suggestion" data-seed="${escapeHTML(seed)}">${escapeHTML(seed)}</button></li>`).join("")}
    </ul>
  </section>`;
}

function renderCardFooter(previous: string, primary: string): string {
  return `<div class="creation-card-footer flex items-center">${previous}${primary}</div>`;
}

const BACK_BUTTON = `<button class="creation-secondary tappable" data-action="creation/previous-question">Back</button>`;

function renderQuestionCard(state: Readonly<CreationState>): string {
  const question = state.questions[state.questionIndex]!;
  const value = state.answers[question.label];
  const isOther = state.otherQuestions.has(state.questionIndex);
  return `<section class="creation-card flex-col" data-focus-region>
    <fieldset class="creation-question">
      <legend class="creation-question-label" tabindex="-1">${escapeHTML(question.label)}</legend>
      ${renderRadioList(question.options, {
        name: "creation-answer",
        action: "creation/answer",
        selected: isOther ? undefined : value,
        extra: question.label === ABILITY_QUESTION ? "" : `
          <div class="creation-radio-item creation-other-item flex items-center">
            <input type="radio" name="creation-answer" data-action="creation/other" aria-label="Other" ${isOther ? "checked" : ""}>
            <input id="creation-other-answer" class="creation-other-input" type="text" placeholder="Other" aria-label="Other answer" value="${isOther ? escapeHTML(value ?? "") : ""}" autocomplete="off">
          </div>
        `,
      })}
    </fieldset>
    ${renderCardFooter(BACK_BUTTON, `<button class="creation-primary tappable" data-action="creation/next-question" ${value?.trim() ? "" : "disabled"}>Next</button>`)}
  </section>`;
}

function renderChecklistCard(state: Readonly<CreationState>): string {
  const checklistHTML = state.checklist
    .map((item, index) => renderChecklistItem(item, index))
    .join("");
  return `<section class="creation-card creation-checklist flex-col" data-focus-region aria-labelledby="creation-checklist-title">
    <h2 id="creation-checklist-title" class="creation-question-label" tabindex="-1">${CHECKLIST_QUESTION}</h2>
    <div class="creation-checklist-items flex-col">${checklistHTML}</div>
    ${renderCardFooter(BACK_BUTTON, `<button class="creation-primary tappable" data-action="creation/submit-context">Create</button>`)}
  </section>`;
}

function renderStatusCard(message: string, className = ""): string {
  return `<section class="creation-card creation-status ${className}" data-focus-region role="status" aria-live="polite">
    <p class="creation-status-copy" tabindex="-1" data-creation-focus>${escapeHTML(message)}</p>
  </section>`;
}

function renderErrorCard(state: Readonly<CreationState>): string {
  return `<section class="creation-card creation-error flex-col" data-focus-region>
    <div class="creation-error-message" role="alert">
      <p class="creation-question-label" tabindex="-1" data-creation-focus>We couldn’t finish this step.</p>
      <p class="creation-error-detail">${escapeHTML(state.error)}</p>
    </div>
    ${renderCardFooter(
      `<button class="creation-secondary tappable" data-action="creation/cancel">Cancel</button>`,
      `<button class="creation-primary tappable" data-action="creation/retry">Try again</button>`,
    )}
  </section>`;
}

function normalizeChecklist(checklist: ContextResponse["checklist"]): ChecklistItem[] {
  let checkedCount = 0;
  const normalized = checklist.map((item) => {
    const checked = item.checked && checkedCount < 8;
    if (checked) checkedCount += 1;
    return { ...item, checked };
  });
  const first = normalized[0];
  if (first && checkedCount === 0) first.checked = true;
  return normalized;
}
