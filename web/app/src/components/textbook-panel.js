import { openBottomSheet } from "./bottom-sheet.js";
import { getTextbookQuestions, generateTextbook } from "../js/textbook-api.js";
import { createDeck, importCards } from "../js/db.js";
import { LANG_FLAGS, LANG_NAMES } from "../js/lang.js";
import { icon } from "./icon.js";
import { renderPaneHeader, headerIconButton, headerTitle } from "./pane-header.js";

/**
 * Opens the `textbook` action-pane content mode (docs/journeys.md Journey 5):
 * a linear, non-stack flow — topic entry → context questions + checklist →
 * generating → done — that replaces the manual look-up stack as the
 * phrasebook-CREATION path on this prototype branch (see action-pane.js's
 * `new-phrasebook` hand-off). Unlike lookup-panel.js's live per-term saves,
 * nothing is created until generation succeeds: the deck is created and
 * every card imported in one shot via `createDeck` + `importCards`
 * (db.js) — no staging, no undo, and the context Q&A/checklist state is
 * discarded once that succeeds (never persisted).
 *
 * @param {HTMLElement} appEl
 * @param {{ lang: string, ability: string }} params - the phrasebook's fixed
 *   language + ability, chosen in New-phrasebook mode (no deck exists yet).
 * @param {Function} onCreated - called with the created deck once generation
 *   and import both succeed.
 * @param {Function} onDismiss - called once the pane is dismissed, at any step.
 */
export function openTextbookPanel(appEl, { lang, ability }, onCreated, onDismiss) {
  const state = {
    step: "topic", // 'topic' | 'questions' | 'checklist' | 'generating' | 'error'
    topic: "",
    questions: [],
    checklist: [],
    answers: {},
    error: null,
    // Which step a transient 'generating'/'error' resolves back to: a failed
    // topic-submit lands on 'topic'; a failed context-submit on 'checklist'.
    resumeStep: "topic",
  };

  const sheet = openBottomSheet(appEl, {
    kind: "textbook",
    size: "full",
    bodyHTML: `<div class="textbook-panel-inner flex-col flex-1">${renderStep(state, lang)}</div>`,
    onClose: onDismiss,
    onMount: (panel) => {
      bind(panel);
      focusInputIfPresent(panel);
    },
  });

  return sheet;

  function rerender({ focusInput = false } = {}) {
    const inner = sheet.panel.querySelector(".textbook-panel-inner");
    if (!inner) return;
    inner.innerHTML = renderStep(state, lang);
    bind(sheet.panel);
    if (focusInput) focusInputIfPresent(sheet.panel);
  }

  function focusInputIfPresent(panel) {
    panel.querySelector(".textbook-input-field")?.focus();
  }

  function autoGrowInput(el) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  async function submitTopic(rawTopic) {
    const topic = (rawTopic || "").trim();
    if (!topic) return;
    state.topic = topic;
    state.resumeStep = "topic";
    state.step = "generating";
    state.error = null;
    rerender();
    try {
      const { questions, checklist } = await getTextbookQuestions({ topic, language: lang, ability });
      state.questions = questions;
      state.checklist = checklist.map((item) => ({ ...item }));
      state.answers = Object.fromEntries(questions.map((q) => [q.label, q.default]));
      state.step = "questions";
    } catch (err) {
      state.error = err?.message || "Something went wrong. Please try again.";
      state.step = "error";
    }
    rerender();
  }

  async function submitContext() {
    state.resumeStep = "checklist";
    state.step = "generating";
    state.error = null;
    rerender();
    const checkedLabels = state.checklist.filter((item) => item.checked).map((item) => item.label);
    try {
      const { title, groups } = await generateTextbook({
        topic: state.topic,
        language: lang,
        ability,
        context: { answers: state.answers, checklist: checkedLabels },
      });
      // Bug 6: the phrasebook name is the API's concise title; fall back to
      // the raw topic only when the model omitted it.
      const deckName = (title && title.trim()) || state.topic;
      const deck = await createDeck(deckName, lang, { ability });
      const cards = groups.flatMap((group) =>
        group.cards.map((card) => ({ ...card, context: group.title })),
      );
      await importCards(cards, deck.id);
      sheet.close();
      onCreated(deck);
    } catch (err) {
      state.error = err?.message || "Something went wrong. Please try again.";
      state.step = "error";
      rerender();
    }
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
    panel.querySelector('[data-action="textbook/back"]')?.addEventListener("click", goBack);

    if (state.step === "topic") bindTopicStep(panel);
    if (state.step === "questions") bindQuestionsStep(panel);
    if (state.step === "checklist") bindChecklistStep(panel);
    if (state.step === "error") bindErrorStep(panel);
  }

  function bindTopicStep(panel) {
    const inputEl = panel.querySelector(".textbook-input-field");
    if (inputEl) {
      inputEl.value = state.topic;
      autoGrowInput(inputEl);
      inputEl.addEventListener("input", (e) => {
        state.topic = e.target.value;
        const wrap = panel.querySelector(".textbook-input-wrap");
        if (wrap) wrap.dataset.hasValue = state.topic.length > 0 ? "true" : "false";
        const submitBtn = panel.querySelector('[data-action="textbook/submit-topic"]');
        if (submitBtn) submitBtn.disabled = state.topic.length === 0;
        autoGrowInput(inputEl);
      });
    }

    panel.querySelector('[data-action="textbook/clear"]')?.addEventListener("click", () => {
      state.topic = "";
      rerender({ focusInput: true });
    });

    panel.querySelector('[data-action="textbook/submit-topic"]')?.addEventListener("click", () => {
      submitTopic(panel.querySelector(".textbook-input-field")?.value);
    });
  }

  function bindQuestionsStep(panel) {
    panel.querySelectorAll('[data-action="textbook/answer"]').forEach((select) => {
      select.addEventListener("change", () => {
        state.answers[select.dataset.label] = select.value;
      });
    });

    panel.querySelector('[data-action="textbook/to-checklist"]')?.addEventListener("click", () => {
      state.step = "checklist";
      rerender();
    });
  }

  function bindChecklistStep(panel) {
    panel.querySelectorAll('[data-action="textbook/toggle-checklist-item"]').forEach((row) => {
      row.addEventListener("click", () => {
        const idx = Number(row.dataset.index);
        state.checklist[idx].checked = !state.checklist[idx].checked;
        rerender();
      });
    });

    panel.querySelector('[data-action="textbook/submit-context"]')?.addEventListener("click", () => {
      submitContext();
    });
  }

  function bindErrorStep(panel) {
    panel.querySelector('[data-action="textbook/retry"]')?.addEventListener("click", () => {
      state.step = state.questions.length > 0 ? state.resumeStep : "topic";
      state.error = null;
      rerender({ focusInput: state.step === "topic" });
    });
  }
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

// Every step is a white, top-rounded surface (Figma "Look-up" card) sitting
// on the gray-100 pane (bug 3) — hugs its content so the pane color shows
// below, shrinking + scrolling its body only when content overflows.
function renderSurface(inner) {
  return `<div class="textbook-surface flex-col">${inner}</div>`;
}

// Header title is always the phrasebook's language (bug 4); the entered topic
// lives in the persistent term line below (bug 5), never the header.
function renderHeader(lang, { extra = "" } = {}) {
  const flag = LANG_FLAGS[lang] ?? "";
  const langName = LANG_NAMES[lang] ?? lang;
  return renderPaneHeader({
    leading: headerIconButton("back", { action: "textbook/back", label: "Back", className: "textbook-back" }),
    title: headerTitle(`${flag} ${langName}`.trim()),
    trailing: `<div class="textbook-header-right flex items-center gap-sm">${extra}</div>`,
  });
}

// The entered topic, pinned at the top of every post-topic step (bug 5) —
// Figma "Term" line: one Roboto-Flex line under a hairline divider.
function renderTermLine(topic) {
  return `<div class="textbook-term flex items-end"><p class="textbook-term-text flex-1">${esc(topic)}</p></div>`;
}

function renderTopicStep(state, lang) {
  const hasValue = state.topic.length > 0;
  const clearBtn = hasValue
    ? `<button class="icon-button textbook-input-clear" data-action="textbook/clear" aria-label="Clear">${icon("close", { size: "sm" })}</button>`
    : "";

  return renderSurface(`
    ${renderHeader(lang, { extra: clearBtn })}
    <div class="textbook-input-form flex-col">
      <div class="textbook-input-wrap" data-has-value="${hasValue}">
        <div class="textbook-input-field-row flex items-center">
          <textarea
            class="textbook-input-field flex-1 text-entry"
            rows="1"
            placeholder="Enter word, phrase, or topic"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          ></textarea>
        </div>
      </div>
      <button class="icon-button textbook-submit" data-action="textbook/submit-topic" aria-label="Continue" ${hasValue ? "" : "disabled"}>${icon("next")}</button>
    </div>
  `);
}

// Page 1 of the context flow — the dynamic clarifying questions as selects.
function renderQuestionsStep(state, lang) {
  const questionsHTML = state.questions.map((q) => renderQuestionSelect(q, state.answers[q.label])).join("");
  return renderSurface(`
    ${renderHeader(lang)}
    ${renderTermLine(state.topic)}
    <div class="textbook-step-body flex-col">
      <div class="textbook-questions flex-col">${questionsHTML}</div>
    </div>
    <div class="textbook-context-footer flex items-center justify-end">
      <button class="icon-button textbook-submit" data-action="textbook/to-checklist" aria-label="Continue">${icon("next")}</button>
    </div>
  `);
}

// Page 2 of the context flow — the section checklist (bug 2).
function renderChecklistStep(state, lang) {
  const checklistHTML = state.checklist.map((item, i) => renderChecklistItem(item, i)).join("");
  return renderSurface(`
    ${renderHeader(lang)}
    ${renderTermLine(state.topic)}
    <div class="textbook-step-body flex-col">
      <div class="textbook-checklist flex-col">
        <div class="section-label">What do you most want to ask someone to do?</div>
        <div class="textbook-checklist-items flex-col">${checklistHTML}</div>
      </div>
    </div>
    <div class="textbook-context-footer flex items-center justify-end">
      <button class="icon-button textbook-submit" data-action="textbook/submit-context" aria-label="Generate phrasebook">${icon("next")}</button>
    </div>
  `);
}

function renderQuestionSelect(question, value) {
  return `
    <label class="textbook-select-row flex-col">
      <span class="textbook-select-label">${esc(question.label)}</span>
      <span class="textbook-select-wrap flex items-center">
        <select class="textbook-select" data-action="textbook/answer" data-label="${esc(question.label)}">
          ${question.options.map((o) => `<option value="${esc(o)}" ${o === value ? "selected" : ""}>${esc(o)}</option>`).join("")}
        </select>
        ${icon("unfold-more", { className: "textbook-select-chevron" })}
      </span>
    </label>
  `;
}

function renderChecklistItem(item, index) {
  return `
    <button class="textbook-checklist-item flex items-center tappable" data-action="textbook/toggle-checklist-item" data-index="${index}" data-checked="${item.checked}">
      <span class="textbook-checklist-check flex items-center justify-center">${item.checked ? icon("check", { size: "sm" }) : ""}</span>
      <span class="text-body1 fg-body">${esc(item.label)}</span>
    </button>
  `;
}

function renderGeneratingStep(state, lang) {
  return renderSurface(`
    ${renderHeader(lang)}
    ${renderTermLine(state.topic)}
    <div class="textbook-generating flex-col flex-1 items-center justify-center">
      ${renderSkeleton()}
      <p class="text-body2 fg-secondary">Building your phrasebook…</p>
    </div>
  `);
}

function renderSkeleton() {
  const one = `
    <div class="textbook-skeleton-card bg-surface flex-col">
      <div class="textbook-skeleton-line" style="width: 40%"></div>
      <div class="textbook-skeleton-line" style="width: 70%; height: 20px;"></div>
    </div>
  `;
  return `<div class="textbook-skeleton-list flex-col">${one}${one}${one}</div>`;
}

function renderErrorStep(state, lang) {
  return renderSurface(`
    ${renderHeader(lang)}
    ${state.topic ? renderTermLine(state.topic) : ""}
    <div class="textbook-error text-center fg-secondary flex-1 flex-col items-center justify-center">
      <p>${esc(state.error)}</p>
      <button class="tappable textbook-retry" data-action="textbook/retry">Try again</button>
    </div>
  `);
}

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
