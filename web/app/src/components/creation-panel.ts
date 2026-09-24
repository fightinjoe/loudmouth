import type { Lang, PhrasebookResponse } from "@catchphrase/card-schema";
import { openBottomSheet } from "./bottom-sheet";
import type { BottomSheetHandle } from "./bottom-sheet";
import { getContext, generatePhrasebook, getPhrasebookTitle } from "../js/phrasebook-api";
import type { Ability, ContextResponse } from "../js/phrasebook-api";
import { commitPhrasebook as persistPhrasebook } from "../js/db";
import type { Deck, Generation } from "../js/library-types";
import { LANG_FLAGS, LANG_NAMES } from "../js/lang";
import { icon } from "./icon";
import { renderPaneHeader, headerIconButton, headerTitle } from "./pane-header";
import { escapeHTML } from "../js/utils";
import { getLastAbility, setLastAbility } from "../js/preferences";
import { ABILITIES, ABILITY_LABELS, ABILITY_QUESTION } from "../js/ability";

const PHRASEBOOK_MIN_LOADING_MS = 1000;

type CreationStep = "topic" | "questions" | "checklist" | "generating" | "error";
type ResumeStep = "topic" | "checklist";
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
  topic: string;
  contextSeed: string | null;
  questions: ContextQuestion[];
  checklist: ChecklistItem[];
  answers: Record<string, string>;
  error: string | null;
  resumeStep: ResumeStep;
  contextRequest: ContextRequest | null;
  titleRequest: TitleRequest | null;
  frozenTitle: string | null;
  phrasebookRequest: PhrasebookRequest | null;
  commitRequest: CommitRequest | null;
}

export interface CreationPanelParams {
  lang: Lang;
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
  { lang, ability: initialAbility }: CreationPanelParams,
  onCreated: PhrasebookCreatedCallback,
  onDismiss?: () => void,
): BottomSheetHandle {
  const rememberedAbility = initialAbility ?? getLastAbility(lang);
  const state: CreationState = {
    step: "topic",
    topic: "",
    contextSeed: null,
    questions: [],
    checklist: [],
    answers: Object.fromEntries([]),
    error: null,
    resumeStep: "topic",
    contextRequest: null,
    titleRequest: null,
    frozenTitle: null,
    phrasebookRequest: null,
    commitRequest: null,
  };
  let dismissed = false;
  let completed = false;
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

  return sheet;

  function dispose(): void {
    if (dismissed || completed) return;
    dismissed = true;
    closeObserver?.disconnect();
    abortContextRequest();
    abortTitleRequest();
    invalidatePhrasebook();
    state.commitRequest?.controller.abort();
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

  function rerender({ focusInput = false }: { focusInput?: boolean } = {}): void {
    if (dismissed) return;
    const inner = sheet.panel.querySelector<HTMLElement>(".creation-panel-inner");
    if (!inner) return;
    inner.innerHTML = renderStep(state, lang);
    bind(sheet.panel);
    if (focusInput) focusInputIfPresent(sheet.panel);
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
    if (!topic || dismissed) return;

    state.topic = topic;
    ensureTitleRequest(topic);
    state.resumeStep = "topic";
    state.error = null;
    if (topic === state.contextSeed) {
      state.step = "questions";
      rerender();
      return;
    }

    abortContextRequest();
    invalidatePhrasebook();
    state.contextSeed = null;
    state.questions = [];
    state.checklist = [];
    state.answers = Object.fromEntries([]);
    state.step = "generating";
    rerender();

    const controller = new AbortController();
    const request: ContextRequest = { controller };
    state.contextRequest = request;
    try {
      const { questions, checklist } = await getContext({
        seed: topic,
        language: lang,
        ...(rememberedAbility ? { ability: rememberedAbility } : {}),
        signal: controller.signal,
      });
      if (dismissed || state.contextRequest !== request) return;
      state.contextRequest = null;
      state.contextSeed = topic;
      // This question is client-owned; model-provided options are never used.
      state.questions = questions.filter((question) => question.label !== ABILITY_QUESTION);
      if (!rememberedAbility) {
        state.questions.unshift({
          label: ABILITY_QUESTION,
          options: ABILITIES.map((ability) => ABILITY_LABELS[ability]),
        });
      }
      state.checklist = normalizeChecklist(checklist);
      state.answers = Object.fromEntries(
        state.questions.map((question) => [question.label, question.options[0] ?? ""]),
      );
      state.step = "questions";
    } catch (error) {
      if (dismissed || state.contextRequest !== request) return;
      state.contextRequest = null;
      state.error = errorMessage(error);
      state.step = "error";
    }
    rerender();
  }

  function ensurePhrasebookRequest(): PhrasebookRequest {
    if (state.phrasebookRequest) return state.phrasebookRequest;

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
      generation,
      outcome: { status: "pending" },
      promise: Promise.resolve(),
    };
    state.phrasebookRequest = request;
    request.promise = generatePhrasebook({
      ...generation,
      language: lang,
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
    try {
      deck = await persistPhrasebook({
        name: title,
        lang,
        generation: request.generation,
        groups: request.outcome.result.groups,
        selectedIndexes,
      }, { signal });
    } catch (error) {
      if (!dismissed) showPhrasebookError(error);
      return;
    }

    // Transaction completion is the success boundary. A dismissal that races
    // after it never deletes the committed phrasebook.
    setLastAbility(lang, request.generation.ability);
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

  // Header back walks checklist → questions → topic, then dismisses the pane.
  function goBack(): void {
    if (state.step === "checklist") {
      state.step = "questions";
      rerender();
    } else if (state.step === "questions") {
      state.step = "topic";
      rerender({ focusInput: true });
    } else {
      sheet.close();
    }
  }

  function bind(panel: HTMLElement): void {
    panel.querySelector<HTMLButtonElement>('[data-action="creation/back"]')
      ?.addEventListener("click", goBack);

    if (state.step === "topic") bindTopicStep(panel);
    if (state.step === "questions") bindQuestionsStep(panel);
    if (state.step === "checklist") bindChecklistStep(panel);
    if (state.step === "error") bindErrorStep(panel);
  }

  function bindTopicStep(panel: HTMLElement): void {
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
    panel.querySelectorAll<HTMLSelectElement>('[data-action="creation/answer"]')
      .forEach((select) => {
        select.addEventListener("change", () => {
          const label = select.dataset.label;
          if (label === undefined || state.answers[label] === select.value) return;
          state.answers[label] = select.value;
          invalidatePhrasebook();
        });
      });

    panel.querySelector<HTMLButtonElement>('[data-action="creation/to-checklist"]')
      ?.addEventListener("click", () => {
        state.step = "checklist";
        ensurePhrasebookRequest();
        rerender();
      });
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

function renderStep(state: Readonly<CreationState>, lang: Lang): string {
  switch (state.step) {
    case "topic": return renderTopicStep(state, lang);
    case "questions": return renderQuestionsStep(state, lang);
    case "checklist": return renderChecklistStep(state, lang);
    case "generating": return renderGeneratingStep(state, lang);
    case "error": return renderErrorStep(state, lang);
  }
}

function renderSurface(inner: string): string {
  return `<div class="creation-surface flex-col">${inner}</div>`;
}

function renderHeader(lang: Lang, { extra = "" }: { extra?: string } = {}): string {
  const flag = LANG_FLAGS[lang];
  const languageName = LANG_NAMES[lang];
  return renderPaneHeader({
    leading: headerIconButton("back", {
      action: "creation/back",
      label: "Back",
      className: "creation-back",
    }),
    title: headerTitle(`${flag} ${languageName}`.trim()),
    trailing: `<div class="creation-header-right flex items-center gap-sm">${extra}</div>`,
  });
}

function renderTermLine(topic: string): string {
  return `<div class="creation-term flex items-end"><p class="creation-term-text flex-1">${escapeHTML(topic)}</p></div>`;
}

function renderTopicStep(state: Readonly<CreationState>, lang: Lang): string {
  const hasValue = state.topic.length > 0;
  const clearButton = hasValue
    ? `<button class="icon-button creation-input-clear" data-action="creation/clear" aria-label="Clear">${icon("close", { size: "sm" })}</button>`
    : "";

  return renderSurface(`
    ${renderHeader(lang, { extra: clearButton })}
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
      <button class="icon-button creation-submit" data-action="creation/submit-topic" aria-label="Continue" ${hasValue ? "" : "disabled"}>${icon("next")}</button>
    </div>
  `);
}

function renderQuestionsStep(state: Readonly<CreationState>, lang: Lang): string {
  const questionsHTML = state.questions
    .map((question) => renderQuestionSelect(question, state.answers[question.label]))
    .join("");
  return renderSurface(`
    ${renderHeader(lang)}
    ${renderTermLine(state.topic)}
    <div class="creation-step-body flex-col">
      <div class="creation-questions flex-col">${questionsHTML}</div>
    </div>
    <div class="creation-context-footer flex items-center justify-end">
      <button class="icon-button creation-submit" data-action="creation/to-checklist" aria-label="Continue">${icon("next")}</button>
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

function renderQuestionSelect(question: ContextQuestion, value: string | undefined): string {
  return `
    <label class="creation-select-row flex-col">
      <span class="creation-select-label">${escapeHTML(question.label)}</span>
      <span class="creation-select-wrap flex items-center">
        <select class="creation-select" data-action="creation/answer" data-label="${escapeHTML(question.label)}">
          ${question.options.map((option) => `<option value="${escapeHTML(option)}" ${option === value ? "selected" : ""}>${escapeHTML(option)}</option>`).join("")}
        </select>
        ${icon("unfold-more", { className: "creation-select-chevron" })}
      </span>
    </label>
  `;
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

function renderErrorStep(state: Readonly<CreationState>, lang: Lang): string {
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
