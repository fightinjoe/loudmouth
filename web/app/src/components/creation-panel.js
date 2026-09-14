import { openBottomSheet } from "./bottom-sheet.js";
import { getContext, generatePhrasebook, getPhrasebookTitle } from "../js/phrasebook-api.js";
import { createDeck, deleteDeck, importCards } from "../js/db.js";
import { LANG_FLAGS, LANG_NAMES } from "../js/lang.js";
import { icon } from "./icon.js";
import { renderPaneHeader, headerIconButton, headerTitle } from "./pane-header.js";
import { escapeHTML } from "../js/utils.js";

const PHRASEBOOK_MIN_LOADING_MS = 1000;
/**
 * Opens the `creation` action-pane: a linear flow from topic entry through
 * context questions and a checklist. Generation starts speculatively behind
 * the checklist; nothing is persisted until the user explicitly continues,
 * when the selected phrase and vocabulary cards are committed together.
 *
 * @param {HTMLElement} appEl
 * @param {{ lang: string, ability: string }} params - the phrasebook's fixed
 *   language + ability, chosen in New-phrasebook mode (no deck exists yet).
 * @param {Function} onCreated - called with the created deck once generation
 *   and import both succeed.
 * @param {Function} onDismiss - called once the pane is dismissed, at any step.
 */
export function openCreationPanel(appEl, { lang, ability }, onCreated, onDismiss) {
  const state = {
    step: "topic", // 'topic' | 'questions' | 'checklist' | 'generating' | 'error'
    topic: "",
    contextSeed: null,
    questions: [],
    checklist: [],
    answers: {},
    error: null,
    // Which step a transient 'generating'/'error' resolves back to: a failed
    // topic-submit lands on 'topic'; a failed context-submit on 'checklist'.
    resumeStep: "topic",
    contextRequest: null,
    titleRequest: null,
    frozenTitle: null,
    phrasebookRequest: null,
    commitPromise: null,
  };
  let dismissed = false;
  let completed = false;
  let closeObserver = null;

  const sheet = openBottomSheet(appEl, {
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
  // so observe those surfaces too rather than waiting for transition cleanup.
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

  function dispose() {
    if (dismissed || completed) return;
    dismissed = true;
    closeObserver?.disconnect();
    abortContextRequest();
    abortTitleRequest();
    invalidatePhrasebook();
  }

  function abortContextRequest() {
    const request = state.contextRequest;
    state.contextRequest = null;
    request?.controller.abort();
  }

  function abortTitleRequest() {
    const request = state.titleRequest;
    state.titleRequest = null;
    request?.controller.abort();
  }

  function ensureTitleRequest(seed) {
    if (state.titleRequest?.seed === seed) return;
    abortTitleRequest();
    state.frozenTitle = null;
    const request = { seed, controller: new AbortController(), title: null };
    state.titleRequest = request;
    // This promise is deliberately never awaited by the creation flow.
    getPhrasebookTitle({ seed, signal: request.controller.signal }).then(
      (result) => {
        if (dismissed || completed || state.titleRequest !== request || state.frozenTitle !== null) return;
        if (typeof result?.title === "string" && result.title.trim()) {
          request.title = result.title.trim();
        }
      },
      () => { /* Naming is optional; the seed is the fallback. */ },
    );
  }

  function invalidatePhrasebook() {
    const request = state.phrasebookRequest;
    state.phrasebookRequest = null;
    request?.controller.abort();
  }

  function rerender({ focusInput = false } = {}) {
    if (dismissed) return;
    const inner = sheet.panel.querySelector(".creation-panel-inner");
    if (!inner) return;
    inner.innerHTML = renderStep(state, lang);
    bind(sheet.panel);
    if (focusInput) focusInputIfPresent(sheet.panel);
  }

  function focusInputIfPresent(panel) {
    panel.querySelector(".creation-input-field")?.focus();
  }

  function autoGrowInput(el) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  async function submitTopic(rawTopic) {
    const topic = (rawTopic || "").trim();
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
    state.answers = {};
    state.step = "generating";
    rerender();

    const controller = new AbortController();
    const request = { controller };
    state.contextRequest = request;
    try {
      const { questions, checklist } = await getContext({
        seed: topic,
        language: lang,
        signal: controller.signal,
      });
      if (dismissed || state.contextRequest !== request) return;
      state.contextRequest = null;
      state.contextSeed = topic;
      state.questions = questions;
      state.checklist = normalizeChecklist(checklist);
      state.answers = Object.fromEntries(questions.map((q) => [q.label, q.options[0]]));
      state.step = "questions";
    } catch (err) {
      if (dismissed || state.contextRequest !== request) return;
      state.contextRequest = null;
      state.error = err?.message || "Something went wrong. Please try again.";
      state.step = "error";
    }
    rerender();
  }

  function ensurePhrasebookRequest() {
    if (state.phrasebookRequest) return state.phrasebookRequest;

    const controller = new AbortController();
    const request = {
      controller,
      status: "pending",
      result: null,
      error: null,
      promise: null,
    };
    const answers = { ...state.answers };
    const checklist = state.checklist.map((item) => item.label);
    state.phrasebookRequest = request;
    request.promise = generatePhrasebook({
      seed: state.topic,
      language: lang,
      answers,
      checklist,
      signal: controller.signal,
    }).then(
      (result) => {
        if (!dismissed && state.phrasebookRequest === request) {
          request.status = "ready";
          request.result = result;
        }
      },
      (err) => {
        if (!dismissed && state.phrasebookRequest === request) {
          request.status = "error";
          request.error = err;
        }
      },
    );
    return request;
  }

  async function submitContext() {
    if (dismissed || state.commitPromise) return;
    const request = ensurePhrasebookRequest();
    if (request.status === "error") {
      showPhrasebookError(request.error);
      return;
    }

    const selectedIndexes = state.checklist
      .map((item, index) => (item.checked ? index : -1))
      .filter((index) => index >= 0);
    state.resumeStep = "checklist";
    state.step = "generating";
    state.error = null;
    rerender();

    const commitPromise = commitPhrasebook(request, selectedIndexes);
    state.commitPromise = commitPromise;
    await commitPromise;
    if (state.commitPromise === commitPromise) state.commitPromise = null;
  }

  async function commitPhrasebook(request, selectedIndexes) {
    await Promise.all([
      request.promise,
      new Promise((resolve) => setTimeout(resolve, PHRASEBOOK_MIN_LOADING_MS)),
    ]);
    if (dismissed || state.phrasebookRequest !== request) return;
    if (request.status === "error") {
      showPhrasebookError(request.error);
      return;
    }

    let deck = null;
    try {
      const { groups } = request.result;
      const cards = selectCards(groups, selectedIndexes);
      state.frozenTitle ??= state.titleRequest?.title || state.topic;
      const deckName = state.frozenTitle;
      abortTitleRequest();
      deck = await createDeck(deckName, lang, { ability });
      if (dismissed) {
        await deleteDeck(deck.id);
        return;
      }
      await importCards(cards, deck.id);
      if (dismissed) {
        await deleteDeck(deck.id);
        return;
      }
      completed = true;
      closeObserver?.disconnect();
      closeSheet();
      onCreated(deck);
    } catch (err) {
      if (deck) {
        try {
          await deleteDeck(deck.id);
        } catch (cleanupError) {
          err = cleanupError;
        }
      }
      if (!dismissed) showPhrasebookError(err);
    }
  }

  function showPhrasebookError(err) {
    state.resumeStep = "checklist";
    state.error = err?.message || "Something went wrong. Please try again.";
    state.step = "error";
    rerender();
  }

  // Header back walks the two-page context stack (checklist → questions →
  // topic) and dismisses the pane from the first page (topic entry).
  function goBack() {
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

  function bind(panel) {
    panel.querySelector('[data-action="creation/back"]')?.addEventListener("click", goBack);

    if (state.step === "topic") bindTopicStep(panel);
    if (state.step === "questions") bindQuestionsStep(panel);
    if (state.step === "checklist") bindChecklistStep(panel);
    if (state.step === "error") bindErrorStep(panel);
  }

  function bindTopicStep(panel) {
    const inputEl = panel.querySelector(".creation-input-field");
    if (inputEl) {
      inputEl.value = state.topic;
      autoGrowInput(inputEl);
      inputEl.addEventListener("input", (e) => {
        const nextTopic = e.target.value;
        if (state.contextSeed !== null && nextTopic.trim() !== state.contextSeed) {
          invalidatePhrasebook();
        }
        state.topic = nextTopic;
        const wrap = panel.querySelector(".creation-input-wrap");
        if (wrap) wrap.dataset.hasValue = state.topic.length > 0 ? "true" : "false";
        const submitBtn = panel.querySelector('[data-action="creation/submit-topic"]');
        if (submitBtn) submitBtn.disabled = state.topic.length === 0;
        autoGrowInput(inputEl);
      });
    }

    panel.querySelector('[data-action="creation/clear"]')?.addEventListener("click", () => {
      if (state.contextSeed !== null) invalidatePhrasebook();
      state.topic = "";
      rerender({ focusInput: true });
    });

    panel.querySelector('[data-action="creation/submit-topic"]')?.addEventListener("click", () => {
      submitTopic(panel.querySelector(".creation-input-field")?.value);
    });
  }

  function bindQuestionsStep(panel) {
    panel.querySelectorAll('[data-action="creation/answer"]').forEach((select) => {
      select.addEventListener("change", () => {
        if (state.answers[select.dataset.label] === select.value) return;
        state.answers[select.dataset.label] = select.value;
        invalidatePhrasebook();
      });
    });

    panel.querySelector('[data-action="creation/to-checklist"]')?.addEventListener("click", () => {
      state.step = "checklist";
      ensurePhrasebookRequest();
      rerender();
    });
  }

  function bindChecklistStep(panel) {
    panel.querySelectorAll('[data-action="creation/toggle-checklist-item"]').forEach((row) => {
      row.addEventListener("click", () => {
        const idx = Number(row.dataset.index);
        const item = state.checklist[idx];
        const checkedCount = state.checklist.filter((candidate) => candidate.checked).length;
        if ((item.checked && checkedCount === 1) || (!item.checked && checkedCount === 8)) return;
        item.checked = !item.checked;
        rerender();
      });
    });

    panel.querySelector('[data-action="creation/submit-context"]')?.addEventListener("click", () => {
      submitContext();
    });
  }

  function bindErrorStep(panel) {
    panel.querySelector('[data-action="creation/retry"]')?.addEventListener("click", () => {
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

function selectCards(groups, selectedIndexes) {
  const phraseCards = [];
  const vocabularyCards = [];
  const seenTranslations = new Set();
  const vocabularyLimit = Math.min(24, selectedIndexes.length * 5);

  for (const index of selectedIndexes) {
    const group = groups[index];
    phraseCards.push(...group.cards);
    for (const card of group.vocab) {
      const key = card.translation.normalize("NFKC").toLocaleLowerCase("en-US");
      if (seenTranslations.has(key)) continue;
      seenTranslations.add(key);
      if (vocabularyCards.length < vocabularyLimit) vocabularyCards.push(card);
    }
  }

  return [...phraseCards, ...vocabularyCards];
}

// ── Render ───────────────────────────────────────────────────────────────

function renderStep(state, lang) {
  if (state.step === "topic") return renderTopicStep(state, lang);
  if (state.step === "questions") return renderQuestionsStep(state, lang);
  if (state.step === "checklist") return renderChecklistStep(state, lang);
  if (state.step === "generating") return renderGeneratingStep(state, lang);
  if (state.step === "error") return renderErrorStep(state, lang);
  return "";
}

// Every step is a white, top-rounded surface on the gray-100 pane.
function renderSurface(inner) {
  return `<div class="creation-surface flex-col">${inner}</div>`;
}

// Header title is always the phrasebook's language (bug 4); the entered topic
// lives in the persistent term line below (bug 5), never the header.
function renderHeader(lang, { extra = "" } = {}) {
  const flag = LANG_FLAGS[lang] ?? "";
  const langName = LANG_NAMES[lang] ?? lang;
  return renderPaneHeader({
    leading: headerIconButton("back", { action: "creation/back", label: "Back", className: "creation-back" }),
    title: headerTitle(`${flag} ${langName}`.trim()),
    trailing: `<div class="creation-header-right flex items-center gap-sm">${extra}</div>`,
  });
}

// The entered topic, pinned at the top of every post-topic step (bug 5) —
// Figma "Term" line: one Roboto-Flex line under a hairline divider.
function renderTermLine(topic) {
  return `<div class="creation-term flex items-end"><p class="creation-term-text flex-1">${escapeHTML(topic)}</p></div>`;
}

function renderTopicStep(state, lang) {
  const hasValue = state.topic.length > 0;
  const clearBtn = hasValue
    ? `<button class="icon-button creation-input-clear" data-action="creation/clear" aria-label="Clear">${icon("close", { size: "sm" })}</button>`
    : "";

  return renderSurface(`
    ${renderHeader(lang, { extra: clearBtn })}
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

// Page 1 of the context flow — the dynamic clarifying questions as selects.
function renderQuestionsStep(state, lang) {
  const questionsHTML = state.questions.map((q) => renderQuestionSelect(q, state.answers[q.label])).join("");
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

// Page 2 of the context flow — the section checklist (bug 2).
function renderChecklistStep(state, lang) {
  const checklistHTML = state.checklist.map((item, i) => renderChecklistItem(item, i)).join("");
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

function renderQuestionSelect(question, value) {
  return `
    <label class="creation-select-row flex-col">
      <span class="creation-select-label">${escapeHTML(question.label)}</span>
      <span class="creation-select-wrap flex items-center">
        <select class="creation-select" data-action="creation/answer" data-label="${escapeHTML(question.label)}">
          ${question.options.map((o) => `<option value="${escapeHTML(o)}" ${o === value ? "selected" : ""}>${escapeHTML(o)}</option>`).join("")}
        </select>
        ${icon("unfold-more", { className: "creation-select-chevron" })}
      </span>
    </label>
  `;
}

function renderChecklistItem(item, index) {
  return `
    <button class="creation-checklist-item flex items-center tappable" data-action="creation/toggle-checklist-item" data-index="${index}" data-checked="${item.checked}">
      <span class="creation-checklist-check flex items-center justify-center">${item.checked ? icon("check", { size: "sm" }) : ""}</span>
      <span class="text-body1 fg-body">${escapeHTML(item.label)}</span>
    </button>
  `;
}

function renderGeneratingStep(state, lang) {
  return renderSurface(`
    ${renderHeader(lang)}
    ${renderTermLine(state.topic)}
    <div class="creation-generating flex-col flex-1 items-center justify-center">
      ${renderSkeleton()}
      <p class="text-body2 fg-secondary">Building your phrasebook…</p>
    </div>
  `);
}

function renderSkeleton() {
  const one = `
    <div class="creation-skeleton-card bg-surface flex-col">
      <div class="creation-skeleton-line" style="width: 40%"></div>
      <div class="creation-skeleton-line" style="width: 70%; height: 20px;"></div>
    </div>
  `;
  return `<div class="creation-skeleton-list flex-col">${one}${one}${one}</div>`;
}

function renderErrorStep(state, lang) {
  return renderSurface(`
    ${renderHeader(lang)}
    ${state.topic ? renderTermLine(state.topic) : ""}
    <div class="creation-error text-center fg-secondary flex-1 flex-col items-center justify-center">
      <p>${escapeHTML(state.error)}</p>
      <button class="tappable creation-retry" data-action="creation/retry">Try again</button>
    </div>
  `);
}

function normalizeChecklist(checklist) {
  let checkedCount = 0;
  const normalized = checklist.map((item) => {
    const checked = Boolean(item.checked) && checkedCount < 8;
    if (checked) checkedCount += 1;
    return { ...item, checked };
  });
  if (normalized.length > 0 && checkedCount === 0) normalized[0].checked = true;
  return normalized;
}

