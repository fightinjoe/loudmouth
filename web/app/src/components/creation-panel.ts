import type { ContextResponse, Lang, PhrasebookResponse } from "@catchphrase/card-schema";
import { openBottomSheet } from "./bottom-sheet";
import type { BottomSheetHandle } from "./bottom-sheet";
import { getContext, generatePhrasebook, getPhrasebookTitle } from "../js/phrasebook-api";
import type { Ability } from "../js/phrasebook-api";
import { commitPhrasebook as persistPhrasebook, getDecks } from "../js/db";
import type { Deck, DeckIllustration, Generation } from "../js/library-types";
import { createIllustrationTask } from "../js/phrasebook-illustration";
import type { IllustrationTask } from "../js/phrasebook-illustration";
import { CONTENT_LANGUAGES, LANG_FLAGS, LANG_NAMES } from "../js/lang";
import { icon } from "./icon";
import { renderPaneHeader, headerIconButton, headerTitle } from "./pane-header";
import { escapeHTML } from "../js/utils";
import { getLastAbility, setLastAbility, getLastCreationLanguage, setLastCreationLanguage } from "../js/preferences";
import { ABILITIES, ABILITY_LABELS, ABILITY_QUESTION } from "../js/ability";

const PHRASEBOOK_MIN_LOADING_MS = 1000;

type CreationStep = "initializing" | "language" | "topic" | "questions" | "checklist" | "generating" | "error";
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
  pendingLanguage: Lang | undefined;
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
}

export type PhrasebookCreatedCallback = (deck: Deck) => void;

/**
 * Opens the guided phrasebook creation flow. Generation is speculative, but
 * the selected generated groups become durable only through one atomic
 * commitPhrasebook transaction after the learner confirms the checklist.
 */
export function openCreationPanel(
  appElement: HTMLElement,
  { lang: initialLanguage, ability: initialAbility }: CreationPanelParams,
  onCreated: PhrasebookCreatedCallback,
  onDismiss?: () => void,
  onIllustrationUpdated: (deckId: string, illustration: DeckIllustration) => void = () => {},
): BottomSheetHandle {
  let lang = initialLanguage;
  let rememberedAbility = lang ? initialAbility ?? getLastAbility(lang) : undefined;
  const state: CreationState = {
    step: lang ? "topic" : "initializing",
    pendingLanguage: lang,
    topic: "",
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
  let closeObserver: MutationObserver | null = null;

  const sheet = openBottomSheet(appElement, {
    kind: "creation",
    size: "full",
    bodyHTML: `<div class="creation-panel-inner flex-col flex-1">${renderStep(state, lang)}</div>`,
    onClose: () => {
      dispose();
      onDismiss?.();
    },
    onMount: (panel) => {
      bind(panel);
      focusInputIfPresent(panel);
    },
  });
  const closeSheet = sheet.close;
  sheet.close = () => {
    dispose();
    closeSheet();
  };

  // Bottom-sheet scrim and swipe dismissal close through private callbacks,
  // so observe those surfaces rather than waiting for transition cleanup.
  sheet.scrim.addEventListener("click", dispose);
  let wasVisible = false;
  closeObserver = new MutationObserver(() => {
    if (sheet.panel.classList.contains("bottom-sheet--visible")) {
      wasVisible = true;
    } else if (wasVisible) {
      dispose();
    }
  });
  closeObserver.observe(sheet.panel, { attributes: true, attributeFilter: ["class"] });

  if (!lang) void initializeLanguage();

  return sheet;

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
      lang = newest ? getLastCreationLanguage() ?? newest.lang : undefined;
      rememberedAbility = lang ? initialAbility ?? getLastAbility(lang) : undefined;
      state.pendingLanguage = lang;
      state.step = lang ? "topic" : "language";
      state.resumeStep = "topic";
    } catch (error) {
      if (dismissed) return;
      state.error = errorMessage(error);
      state.step = "error";
    }
    rerender({ focusInput: state.step === "topic" });
  }

  function confirmLanguage(): void {
    const selected = state.pendingLanguage;
    if (!selected || dismissed) return;
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
    state.step = "topic";
    state.resumeStep = "topic";
    state.error = null;
    rerender({ focusInput: true });
  }

  function dispose(): void {
    if (dismissed || completed) return;
    dismissed = true;
    closeObserver?.disconnect();
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
    if (dismissed) return;
    const inner = sheet.panel.querySelector<HTMLElement>(".creation-panel-inner");
    if (!inner) return;
    inner.innerHTML = renderStep(state, lang);
    bind(sheet.panel);
    if (focusInput) focusInputIfPresent(sheet.panel);
    if (state.step === "questions" || state.step === "language") {
      sheet.panel.querySelector<HTMLElement>(".creation-question-label")?.focus();
    }
  }

  function focusInputIfPresent(panel: HTMLElement): void {
    panel.querySelector<HTMLTextAreaElement>(".creation-input-field")?.focus();
  }

  function autoGrowInput(element: HTMLTextAreaElement): void {
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }

  async function submitTopic(rawTopic: string): Promise<void> {
    const topic = rawTopic.trim();
    if (!topic || !lang || dismissed) return;

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
      state.illustrationTask = createIllustrationTask(imagePrompt, onIllustrationUpdated);
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
    closeObserver?.disconnect();
    if (dismissed) return;
    closeSheet();
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

  // Back walks each question in reverse before returning to the topic.
  function goBack(): void {
    if (state.step === "language" && lang) {
      state.pendingLanguage = lang;
      state.step = "topic";
      rerender({ focusInput: true });
    } else if (state.step === "checklist") {
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
    } else {
      sheet.close();
    }
  }

  function bind(panel: HTMLElement): void {
    panel.querySelector<HTMLButtonElement>('[data-action="creation/back"]')
      ?.addEventListener("click", goBack);

    if (state.step === "language") bindLanguageStep(panel);
    if (state.step === "topic") bindTopicStep(panel);
    if (state.step === "questions") bindQuestionsStep(panel);
    if (state.step === "checklist") bindChecklistStep(panel);
    if (state.step === "error") bindErrorStep(panel);
  }

  function bindLanguageStep(panel: HTMLElement): void {
    panel.querySelectorAll<HTMLInputElement>('[data-action="creation/language"]')
      .forEach((radio) => {
        radio.addEventListener("change", () => {
          state.pendingLanguage = CONTENT_LANGUAGES.find((language) => language === radio.value);
          const next = panel.querySelector<HTMLButtonElement>('[data-action="creation/next-language"]');
          if (next) next.disabled = !state.pendingLanguage;
        });
      });
    panel.querySelector<HTMLButtonElement>('[data-action="creation/next-language"]')
      ?.addEventListener("click", confirmLanguage);
  }

  function bindTopicStep(panel: HTMLElement): void {
    panel.querySelector<HTMLButtonElement>('[data-action="creation/edit-language"]')
      ?.addEventListener("click", () => {
        state.pendingLanguage = lang;
        state.step = "language";
        rerender();
      });

    const inputElement = panel.querySelector<HTMLTextAreaElement>(".creation-input-field");
    if (inputElement) {
      inputElement.value = state.topic;
      autoGrowInput(inputElement);
      inputElement.addEventListener("input", () => {
        const nextTopic = inputElement.value;
        if (state.contextSeed !== null && nextTopic.trim() !== state.contextSeed) {
          invalidatePhrasebook();
        }
        state.topic = nextTopic;
        const wrap = panel.querySelector<HTMLElement>(".creation-input-wrap");
        if (wrap) wrap.dataset.hasValue = state.topic.length > 0 ? "true" : "false";
        const submitButton = panel.querySelector<HTMLButtonElement>(
          '[data-action="creation/submit-topic"]',
        );
        if (submitButton) submitButton.disabled = state.topic.length === 0;
        autoGrowInput(inputElement);
      });
    }

    panel.querySelector<HTMLButtonElement>('[data-action="creation/clear"]')
      ?.addEventListener("click", () => {
        if (state.contextSeed !== null) invalidatePhrasebook();
        state.topic = "";
        rerender({ focusInput: true });
      });

    panel.querySelector<HTMLButtonElement>('[data-action="creation/submit-topic"]')
      ?.addEventListener("click", () => {
        const topic = panel.querySelector<HTMLTextAreaElement>(".creation-input-field")?.value ?? "";
        void submitTopic(topic);
      });
  }

  function bindQuestionsStep(panel: HTMLElement): void {
    const question = state.questions[state.questionIndex];
    if (!question) return;
    const setAnswer = (value: string): void => {
      if (state.answers[question.label] !== value) {
        state.answers[question.label] = value;
        invalidatePhrasebook();
      }
      const next = panel.querySelector<HTMLButtonElement>('[data-action="creation/next-question"]');
      if (next) next.disabled = !value.trim();
    };

    panel.querySelectorAll<HTMLInputElement>('[data-action="creation/answer"]')
      .forEach((radio) => {
        radio.addEventListener("change", () => {
          state.otherQuestions.delete(state.questionIndex);
          setAnswer(radio.value);
        });
      });

    const otherRadio = panel.querySelector<HTMLInputElement>('[data-action="creation/other"]');
    const otherInput = panel.querySelector<HTMLInputElement>(".creation-other-input");
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

    panel.querySelector<HTMLButtonElement>('[data-action="creation/next-question"]')
      ?.addEventListener("click", nextQuestion);
    panel.querySelector<HTMLButtonElement>('[data-action="creation/previous-question"]')
      ?.addEventListener("click", goBack);
  }

  function bindChecklistStep(panel: HTMLElement): void {
    panel.querySelectorAll<HTMLButtonElement>('[data-action="creation/toggle-checklist-item"]')
      .forEach((row) => {
        row.addEventListener("click", () => {
          const index = Number(row.dataset.index);
          const item = state.checklist[index];
          if (!Number.isInteger(index) || !item) return;
          const checkedCount = state.checklist.filter((candidate) => candidate.checked).length;
          if ((item.checked && checkedCount === 1) || (!item.checked && checkedCount === 8)) return;
          item.checked = !item.checked;
          rerender();
        });
      });

    panel.querySelector<HTMLButtonElement>('[data-action="creation/submit-context"]')
      ?.addEventListener("click", () => { void submitContext(); });
  }

  function bindErrorStep(panel: HTMLElement): void {
    panel.querySelector<HTMLButtonElement>('[data-action="creation/retry"]')
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
  if (state.step === "initializing") {
    return renderSurface(`
      ${renderHeader()}
      <div class="creation-step-body" role="status">Loading your phrasebooks…</div>
    `);
  }
  if (state.step === "language") return renderLanguageStep(state);
  if (state.step === "error") return renderErrorStep(state, lang);
  if (!lang) throw new Error("Choose a language before continuing.");
  switch (state.step) {
    case "topic": return renderTopicStep(state, lang);
    case "questions": return renderQuestionsStep(state, lang);
    case "checklist": return renderChecklistStep(state, lang);
    case "generating": return renderGeneratingStep(state, lang);
  }
}

function renderSurface(inner: string): string {
  return `<div class="creation-surface flex-col">${inner}</div>`;
}

function languageLabel(lang: Lang): string {
  return `${LANG_FLAGS[lang]} ${LANG_NAMES[lang]}`.trim();
}

function renderHeader(lang?: Lang, { extra = "" }: { extra?: string } = {}): string {
  return renderPaneHeader({
    leading: headerIconButton("back", {
      action: "creation/back",
      label: "Back",
      className: "creation-back",
    }),
    title: headerTitle(lang ? languageLabel(lang) : "New phrasebook"),
    trailing: `<div class="creation-header-right flex items-center gap-sm">${extra}</div>`,
  });
}

function renderTermLine(topic: string): string {
  return `<div class="creation-term flex items-end"><p class="creation-term-text flex-1">${escapeHTML(topic)}</p></div>`;
}

function renderRadioList<T extends string>(
  options: readonly T[],
  {
    name,
    action,
    selected,
    label = (value: T) => value,
    extra = "",
  }: {
    name: string;
    action: string;
    selected?: string;
    label?: (value: T) => string;
    extra?: string;
  },
): string {
  return `<div class="creation-radio-items flex-col">
    ${options.map((value, index) => `
      <label class="creation-radio-item flex items-center tappable">
        <input type="radio" name="${escapeHTML(name)}" data-action="${escapeHTML(action)}" data-option="${index}" value="${escapeHTML(value)}" ${selected === value ? "checked" : ""}>
        <span class="text-body1 fg-body">${escapeHTML(label(value))}</span>
      </label>
    `).join("")}
    ${extra}
  </div>`;
}

function renderLanguageStep(state: Readonly<CreationState>): string {
  return renderSurface(`
    ${renderHeader()}
    <div class="creation-step-body flex-col">
      <fieldset class="creation-question creation-language-question">
        <legend class="creation-question-label section-label" tabindex="-1">Which language would you like to learn?</legend>
        ${renderRadioList(CONTENT_LANGUAGES, {
          name: "creation-language",
          action: "creation/language",
          selected: state.pendingLanguage,
          label: languageLabel,
        })}
      </fieldset>
    </div>
    <div class="creation-context-footer flex items-center justify-end">
      <button class="creation-question-nav tappable" data-action="creation/next-language" ${state.pendingLanguage ? "" : "disabled"}><span>Next</span>${icon("next")}</button>
    </div>
  `);
}

function renderTopicStep(state: Readonly<CreationState>, lang: Lang): string {
  const hasValue = state.topic.length > 0;
  const clearButton = hasValue
    ? `<button class="icon-button creation-input-clear" data-action="creation/clear" aria-label="Clear">${icon("close", { size: "sm" })}</button>`
    : "";

  return renderSurface(`
    ${renderHeader(undefined, { extra: clearButton })}
    <div class="creation-input-form flex-col">
      <div class="creation-input-wrap" data-has-value="${hasValue}">
        <div class="creation-input-field-row flex items-center">
          <textarea
            class="creation-input-field flex-1 text-entry"
            rows="1"
            placeholder="Enter word, phrase, or topic"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          ></textarea>
        </div>
      </div>
      <button class="creation-language-choice tappable flex items-center text-body2" data-action="creation/edit-language" aria-label="Change language: ${escapeHTML(LANG_NAMES[lang])}">
        <span>${escapeHTML(languageLabel(lang))}</span>${icon("next", { size: "sm" })}
      </button>
      <button class="icon-button creation-submit" data-action="creation/submit-topic" aria-label="Continue" ${hasValue ? "" : "disabled"}>${icon("next")}</button>
    </div>
  `);
}

function renderQuestionsStep(state: Readonly<CreationState>, lang: Lang): string {
  const question = state.questions[state.questionIndex]!;
  const value = state.answers[question.label];
  const isOther = state.otherQuestions.has(state.questionIndex);
  return renderSurface(`
    ${renderHeader(lang)}
    ${renderTermLine(state.topic)}
    <div class="creation-step-body flex-col">
      <fieldset class="creation-question">
        <legend class="creation-question-label section-label" tabindex="-1">${escapeHTML(question.label)}</legend>
        <p class="creation-question-progress text-body2 fg-secondary">Question ${state.questionIndex + 1} of ${state.questions.length}</p>
        ${renderRadioList(question.options, {
          name: "creation-answer",
          action: "creation/answer",
          selected: isOther ? undefined : value,
          extra: question.label === ABILITY_QUESTION ? "" : `
            <div class="creation-radio-item flex items-center">
              <input type="radio" name="creation-answer" data-action="creation/other" aria-label="Other" ${isOther ? "checked" : ""}>
              <input class="creation-other-input text-body1" type="text" placeholder="other" aria-label="Other answer" value="${isOther ? escapeHTML(value ?? "") : ""}" autocomplete="off">
            </div>
          `,
        })}
      </fieldset>
    </div>
    <div class="creation-context-footer creation-question-footer flex items-center">
      <button class="creation-question-nav tappable" data-action="creation/previous-question">${icon("back")}<span>Previous</span></button>
      <button class="creation-question-nav tappable" data-action="creation/next-question" ${value?.trim() ? "" : "disabled"}><span>Next</span>${icon("next")}</button>
    </div>
  `);
}

function renderChecklistStep(state: Readonly<CreationState>, lang: Lang): string {
  const checklistHTML = state.checklist
    .map((item, index) => renderChecklistItem(item, index))
    .join("");
  return renderSurface(`
    ${renderHeader(lang)}
    ${renderTermLine(state.topic)}
    <div class="creation-step-body flex-col">
      <div class="creation-checklist flex-col">
        <div class="section-label">What do you most want to ask someone to do?</div>
        <div class="creation-checklist-items flex-col">${checklistHTML}</div>
      </div>
    </div>
    <div class="creation-context-footer flex items-center justify-end">
      <button class="icon-button creation-submit" data-action="creation/submit-context" aria-label="Generate phrasebook">${icon("next")}</button>
    </div>
  `);
}

function renderChecklistItem(item: ChecklistItem, index: number): string {
  return `
    <button class="creation-checklist-item flex items-center tappable" data-action="creation/toggle-checklist-item" data-index="${index}" data-checked="${item.checked}">
      <span class="creation-checklist-check flex items-center justify-center">${item.checked ? icon("check", { size: "sm" }) : ""}</span>
      <span class="text-body1 fg-body">${escapeHTML(item.label)}</span>
    </button>
  `;
}

function renderGeneratingStep(state: Readonly<CreationState>, lang: Lang): string {
  return renderSurface(`
    ${renderHeader(lang)}
    ${renderTermLine(state.topic)}
    <div class="creation-generating flex-col flex-1 items-center justify-center">
      ${renderSkeleton()}
      <p class="text-body2 fg-secondary">Building your phrasebook…</p>
    </div>
  `);
}

function renderSkeleton(): string {
  const card = `
    <div class="creation-skeleton-card bg-surface flex-col">
      <div class="creation-skeleton-line" style="width: 40%"></div>
      <div class="creation-skeleton-line" style="width: 70%; height: 20px;"></div>
    </div>
  `;
  return `<div class="creation-skeleton-list flex-col">${card}${card}${card}</div>`;
}

function renderErrorStep(state: Readonly<CreationState>, lang: Lang | undefined): string {
  return renderSurface(`
    ${renderHeader(lang)}
    ${state.topic ? renderTermLine(state.topic) : ""}
    <div class="creation-error text-center fg-secondary flex-1 flex-col items-center justify-center">
      <p>${escapeHTML(state.error)}</p>
      <button class="tappable creation-retry" data-action="creation/retry">Try again</button>
    </div>
  `);
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
