import { openBottomSheet } from "./bottom-sheet.js";
import { lookup } from "../js/lookup-api.js";
import { saveTermCard, updateDeckVibe, updateDeckName } from "../js/db.js";
import {
  getLookupHistory,
  addLookupHistory,
  isCoachDismissed,
  dismissCoach,
} from "../js/preferences.js";
import { speak, ttsText } from "../js/tts.js";
import { renderRuby } from "./card.js";
import { LANG_FLAGS, LANG_NAMES } from "../js/lang.js";
import { PLACEHOLDER_DECK_NAME } from "./new-phrasebook-panel.js";

const AUDIENCE_LABELS = {
  stranger: "strangers",
  staff: "staff",
  acquaintance: "acquaintances",
  family: "family",
};
const FORMALITY_LABELS = { casual: "Casual", polite: "Polite", formal: "Formal" };
const FORMALITY_SUMMARY = { casual: "Casual", polite: "Polite", formal: "Formal" };

/**
 * Opens the /lookup action-pane stack (docs/journeys.md 'Action-pane content
 * stack'): one bottom-sheet component internally holding a push/pop stack of
 * content modes — Input (level 1) -> Translation (level 2) -> Group
 * (level 3) — not three sibling modals.
 *
 * Covers PH-002 (Input mode + /lookup wiring), PH-003 (Translation mode:
 * primary card, related groups, save + basket badge), and PH-004 (Group
 * mode + 🔍 re-seed) from docs/projects/phrasebook-lookup-ux/tasks.json —
 * they share this one stack machine and don't decompose cleanly into
 * separate files without breaking the Pane Protocol's "one component, one
 * internal stack" contract journeys.md specifies.
 *
 * @param {HTMLElement} appEl
 * @param {Object} deck - the phrasebook (lang/ability/formality/audience/id)
 * @param {{ hasTranslatedBefore?: boolean }} [opts] - whether VIBE opens
 *   collapsed (phrasebook has prior translations) or expanded (first-ever).
 * @param {Function} onSaved - called with the saved card record on each 🔖 save
 * @param {Function} onDismiss - called once the whole stack is dismissed
 * @param {Function} [onDeckRenamed] - called when the placeholder deck name
 *   is auto-set from the first saved term (see `maybeAutoNameDeck`)
 */
export function openLookupPanel(appEl, deck, opts, onSaved, onDismiss, onDeckRenamed) {
  const { hasTranslatedBefore = false } = opts || {};

  const state = {
    stack: [{ mode: "input" }],
    inputValue: "",
    vibeExpanded: !hasTranslatedBefore,
    savedCount: 0,
    savedKeys: new Set(),
  };

  const sheet = openBottomSheet(appEl, {
    kind: "lookup",
    bodyHTML: `<div class="lookup-panel-inner flex-col flex-1">${renderStack(state, deck)}</div>`,
    onClose: onDismiss,
    onMount: (panel) => {
      bind(panel);
      focusInputIfPresent(panel);
    },
  });

  return sheet;

  function rerender({ focusInput = false } = {}) {
    const inner = sheet.panel.querySelector(".lookup-panel-inner");
    if (!inner) return;
    inner.innerHTML = renderStack(state, deck);
    bind(sheet.panel);
    if (focusInput) focusInputIfPresent(sheet.panel);
  }

  function focusInputIfPresent(panel) {
    panel.querySelector(".lookup-input-field")?.focus();
  }

  function top() {
    return state.stack[state.stack.length - 1];
  }

  /**
   * 🔍 re-seed (journeys.md 'Magnifying-glass action'): pop the whole stack
   * back to Input and prefill it with the tapped card's text — plus its
   * source group's title in parentheses, but ONLY when re-seeding from a
   * group card. A primary/block card's `context` field carries the
   * *previous* query's parenthetical (service-assigned provenance, not "this
   * card's group") and must NOT be reused here — the caller passes
   * `groupTitle` explicitly based on which frame the tap came from, rather
   * than reading it off `card.context`.
   */
  function reseed(text, groupTitle) {
    state.stack = [{ mode: "input" }];
    state.inputValue = groupTitle ? `${text} (${groupTitle})` : text;
    state.vibeExpanded = false; // re-seeding is never a phrasebook's first look-up
    rerender({ focusInput: true });
  }

  async function submit(rawTerm) {
    const term = (rawTerm || "").trim();
    if (!term) return;
    addLookupHistory(deck.id, term);
    const frame = { mode: "translation", term, loading: true, error: null, blocks: null };
    state.stack.push(frame);
    rerender();
    try {
      const { blocks } = await lookup({
        term,
        language: deck.lang,
        ability: deck.ability,
        formality: deck.formality,
        audience: deck.audience,
      });
      frame.loading = false;
      frame.blocks = blocks;
    } catch (err) {
      frame.loading = false;
      frame.error = err?.message || "Something went wrong. Please try again.";
    }
    rerender();
  }

  async function saveCard(card, key) {
    const saved = await saveTermCard(card, deck.id);
    state.savedCount += 1;
    state.savedKeys.add(key);
    dismissCoach("lookup-save");
    await maybeAutoNameDeck(card);
    onSaved?.(saved);
    rerender();
    return saved;
  }

  /**
   * A freshly created phrasebook has the generic placeholder name
   * (new-phrasebook-panel.js's PLACEHOLDER_DECK_NAME) until its first term
   * is saved, at which point it's renamed to "{Term} phrasebook" — matching
   * the finished "Dinner phrasebook" shown in docs/journeys.md Journey 1
   * step 10, named after the first look-up rather than left generic.
   */
  async function maybeAutoNameDeck(card) {
    if (deck.name !== PLACEHOLDER_DECK_NAME) return;
    const name = `${cap(card.translation)} phrasebook`;
    await updateDeckName(deck.id, name);
    deck.name = name;
    onDeckRenamed?.(deck);
  }

  function bind(panel) {
    const frame = top();

    panel.querySelector('[data-action="lookup/back"]')?.addEventListener("click", () => {
      if (frame.mode === "input") {
        sheet.close();
        return;
      }
      state.stack.pop();
      rerender();
    });

    // Basket badge (or swipe-down, handled by openBottomSheet itself) is the
    // "done" escape hatch — dismisses the whole stack at once, from any depth.
    panel.querySelector('[data-action="lookup/badge"]')?.addEventListener("click", () => {
      sheet.close();
    });

    if (frame.mode === "input") bindInput(panel);
    if (frame.mode === "translation" || frame.mode === "group") bindCardActions(panel, frame);
    if (frame.mode === "translation" && !frame.loading && !frame.error) bindGroupOpeners(panel, frame);

    panel.querySelectorAll('[data-action="lookup/dismiss-coach"]').forEach((el) => {
      el.addEventListener("click", () => {
        dismissCoach(el.dataset.coachKey);
        rerender();
      });
    });
  }

  function bindInput(panel) {
    const inputEl = panel.querySelector(".lookup-input-field");
    if (inputEl) {
      inputEl.value = state.inputValue;
      // Update the value + the CSS-driven has-value flag on every keystroke,
      // but never rerender here — a full innerHTML replace would blur the
      // field and lose cursor position mid-type.
      inputEl.addEventListener("input", (e) => {
        state.inputValue = e.target.value;
        const wrap = panel.querySelector(".lookup-input-wrap");
        if (wrap) wrap.dataset.hasValue = state.inputValue.length > 0 ? "true" : "false";
      });
      inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit(inputEl.value);
        }
      });
    }

    panel.querySelector('[data-action="lookup/clear"]')?.addEventListener("click", () => {
      state.inputValue = "";
      rerender({ focusInput: true });
    });

    panel.querySelectorAll('[data-action="lookup/history-item"]').forEach((el) => {
      el.addEventListener("click", () => submit(el.dataset.term));
    });

    panel.querySelector('[data-action="lookup/vibe-toggle"]')?.addEventListener("click", () => {
      state.vibeExpanded = !state.vibeExpanded;
      rerender();
    });

    const formalitySelect = panel.querySelector('[data-action="lookup/formality"]');
    const audienceSelect = panel.querySelector('[data-action="lookup/audience"]');
    if (formalitySelect) formalitySelect.value = deck.formality;
    if (audienceSelect) audienceSelect.value = deck.audience;

    formalitySelect?.addEventListener("change", (e) => {
      deck.formality = e.target.value;
      updateDeckVibe(deck.id, { formality: deck.formality });
    });

    audienceSelect?.addEventListener("change", (e) => {
      deck.audience = e.target.value;
      updateDeckVibe(deck.id, { audience: deck.audience });
    });
  }

  function bindGroupOpeners(panel, frame) {
    panel.querySelectorAll('[data-action="lookup/open-group"]').forEach((el) => {
      el.addEventListener("click", () => {
        const blockIdx = Number(el.dataset.blockIndex);
        const groupIdx = Number(el.dataset.groupIndex);
        const group = frame.blocks[blockIdx].groups[groupIdx];
        dismissCoach("lookup-groups");
        state.stack.push({
          mode: "group",
          title: group.title,
          cards: group.cards,
          blockIndex: blockIdx,
          groupIndex: groupIdx,
        });
        rerender();
      });
    });
  }

  function bindCardActions(panel, frame) {
    panel.querySelectorAll('[data-action="lookup/save"]').forEach((el) => {
      el.addEventListener("click", async () => {
        if (el.disabled) return;
        const card = resolveCard(frame, el);
        if (!card) return;
        el.disabled = true;
        await saveCard(card, cardKey(frame, el));
      });
    });
    panel.querySelectorAll('[data-action="lookup/play"]').forEach((el) => {
      el.addEventListener("click", () => {
        const card = resolveCard(frame, el);
        if (card) speak(ttsText(card), card.lang);
      });
    });
    panel.querySelectorAll('[data-action="lookup/reseed"]').forEach((el) => {
      el.addEventListener("click", () => {
        const card = resolveCard(frame, el);
        if (!card) return;
        reseed(card.text, el.dataset.groupTitle || null);
      });
    });
  }

  // Stable per-render-position key so a save survives navigating away and
  // back within the same look-up (cards have no id of their own until
  // saved). Block cards key off their block; group cards key off which
  // group frame (blockIndex/groupIndex) and their position within it —
  // scoping by blockIndex/groupIndex avoids collisions between different
  // groups that each render a "card index 0, 1, 2…".
  function cardKey(frame, el) {
    if (frame.mode === "group") {
      return `group:${frame.blockIndex}:${frame.groupIndex}:${el.dataset.cardIndex}`;
    }
    if (el.dataset.groupIndex !== undefined) {
      return `group:${el.dataset.blockIndex}:${el.dataset.groupIndex}:${el.dataset.cardIndex}`;
    }
    return `block:${el.dataset.blockIndex}`;
  }

  function resolveCard(frame, el) {
    if (frame.mode === "group") {
      return frame.cards[Number(el.dataset.cardIndex)];
    }
    const blockIdx = Number(el.dataset.blockIndex);
    if (el.dataset.groupIndex !== undefined) {
      const groupIdx = Number(el.dataset.groupIndex);
      const cardIdx = Number(el.dataset.cardIndex);
      return frame.blocks[blockIdx].groups[groupIdx].cards[cardIdx];
    }
    return frame.blocks[blockIdx].card;
  }
}

// ── Render ───────────────────────────────────────────────────────────────

function renderStack(state, deck) {
  const frame = state.stack[state.stack.length - 1];
  const badge = state.savedCount > 0 ? renderBadge(state.savedCount) : "";
  if (frame.mode === "input") return renderInputFrame(state, deck, badge);
  if (frame.mode === "translation") return renderTranslationFrame(state, frame, deck, badge);
  if (frame.mode === "group") return renderGroupFrame(state, frame, badge);
  return "";
}

function renderBadge(count) {
  return `<button class="lookup-badge tappable" data-action="lookup/badge" aria-label="Done, go to phrasebook">${count}</button>`;
}

function renderHeader({ backLabel, title, badge, extra = "" }) {
  return `
    <div class="pane-header flex items-center">
      <button class="icon-button lookup-back" data-action="lookup/back" aria-label="${backLabel}">‹</button>
      <span class="pane-header-title flex-1 text-center text-header fg-body">${title}</span>
      <div class="lookup-header-right flex items-center gap-sm">${badge}${extra}</div>
    </div>
  `;
}

function renderInputFrame(state, deck, badge) {
  const flag = LANG_FLAGS[deck.lang] ?? "";
  const langName = LANG_NAMES[deck.lang] ?? deck.lang;
  const history = getLookupHistory(deck.id);
  const hasValue = state.inputValue.length > 0;

  const vibeSummary = `${FORMALITY_SUMMARY[deck.formality] ?? deck.formality} conversation with ${AUDIENCE_LABELS[deck.audience] ?? deck.audience}`;

  return `
    ${renderHeader({ backLabel: "Close", title: `${flag} ${langName}`, badge })}
    <div class="lookup-input-body flex-col flex-1">
      <div class="lookup-input-wrap" data-has-value="${hasValue}">
        <div class="lookup-input-field-row flex items-center">
          <input
            class="lookup-input-field flex-1 text-h1"
            type="text"
            placeholder="Enter word or phrase"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
          <button class="lookup-input-clear icon-button" data-action="lookup/clear" aria-label="Clear">×</button>
        </div>
      </div>

      <div class="lookup-vibe-group" data-expanded="${state.vibeExpanded}">
        <button class="lookup-vibe-summary tappable" data-action="lookup/vibe-toggle">
          <span class="lookup-vibe-summary-label text-body1 fg-body">${esc(vibeSummary)}</span>
        </button>
        <div class="lookup-vibe-expanded flex-col">
          <div class="section-label">VIBE</div>
          <label class="lookup-vibe-row flex items-center justify-between">
            <span class="text-body1 fg-body">Formality</span>
            <select class="lookup-vibe-select" data-action="lookup/formality">
              ${["casual", "polite", "formal"].map((v) => `<option value="${v}" ${deck.formality === v ? "selected" : ""}>${FORMALITY_LABELS[v]}</option>`).join("")}
            </select>
          </label>
          <label class="lookup-vibe-row flex items-center justify-between">
            <span class="text-body1 fg-body">Audience</span>
            <select class="lookup-vibe-select" data-action="lookup/audience">
              ${["stranger", "staff", "acquaintance", "family"].map((v) => `<option value="${v}" ${deck.audience === v ? "selected" : ""}>${cap(AUDIENCE_LABELS[v])}</option>`).join("")}
            </select>
          </label>
        </div>
      </div>

      <div class="lookup-history flex-col" data-visible="${!hasValue && history.length > 0}">
        <div class="section-label">HISTORY</div>
        ${history.map((term) => `
          <button class="lookup-history-item tappable text-body1 fg-body" data-action="lookup/history-item" data-term="${esc(term)}">${esc(term)}</button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderTranslationFrame(state, frame, deck, badge) {
  const header = renderHeader({ backLabel: "Back to input", title: `"${esc(frame.term)}"`, badge });

  if (frame.loading) {
    return `${header}${renderSkeleton()}`;
  }
  if (frame.error) {
    return `${header}<div class="lookup-error text-center fg-secondary flex-1 flex-col items-center justify-center"><p>${esc(frame.error)}</p></div>`;
  }

  const saveHintDismissed = isCoachDismissed("lookup-save");
  const groupsHintDismissed = isCoachDismissed("lookup-groups");

  const blocksHTML = (frame.blocks || [])
    .map((block, blockIndex) => renderBlock(block, blockIndex, deck, state.savedKeys))
    .join("");

  return `
    ${header}
    <div class="lookup-results flex-col flex-1 overflow-y-auto">
      ${renderCoachMark("lookup-save", "Tap to save to your phrasebook", saveHintDismissed)}
      ${blocksHTML}
      ${renderCoachMark("lookup-groups", "View other related words and phrases", groupsHintDismissed)}
    </div>
  `;
}

function renderGroupFrame(state, frame, badge) {
  const header = renderHeader({ backLabel: "Back to results", title: esc(frame.title), badge });
  const cardsHTML = frame.cards
    .map((card, cardIndex) => renderCard(card, {
      cardIndex,
      groupTitle: frame.title,
      saved: state.savedKeys.has(`group:${frame.blockIndex}:${frame.groupIndex}:${cardIndex}`),
    }))
    .join("");
  return `
    ${header}
    <div class="lookup-results flex-col flex-1 overflow-y-auto">${cardsHTML}</div>
  `;
}

function renderSkeleton() {
  const one = `
    <div class="lookup-skeleton-card bg-surface flex-col">
      <div class="review-skeleton-line" style="width: 40%"></div>
      <div class="review-skeleton-line" style="width: 70%; height: 20px;"></div>
    </div>
  `;
  return `<div class="lookup-skeleton-list flex-col">${one}${one}${one}</div>`;
}

function renderCoachMark(key, text, dismissed) {
  if (dismissed) return "";
  return `
    <div class="lookup-coach flex items-center justify-between" data-coach="${key}">
      <span class="text-body2 fg-secondary">${esc(text)}</span>
      <button class="lookup-coach-dismiss icon-button" data-action="lookup/dismiss-coach" data-coach-key="${key}" aria-label="Dismiss">×</button>
    </div>
  `;
}

function renderBlock(block, blockIndex, deck, savedKeys) {
  const primary = renderCard(block.card, { blockIndex, saved: savedKeys.has(`block:${blockIndex}`) });
  const groupsHTML = (block.groups || [])
    .map((group, groupIndex) => renderGroupSummary(group, blockIndex, groupIndex))
    .join("");
  return `<div class="lookup-block flex-col">${primary}${groupsHTML}</div>`;
}

function renderGroupSummary(group, blockIndex, groupIndex) {
  const allWords = group.cards.every((c) => c.type === "word");
  const countLabel = `${group.cards.length} ${allWords ? "word" : "phrase"}${group.cards.length === 1 ? "" : "s"}`;
  const preview = group.cards.slice(0, 3).map((c) => `
    <div class="lookup-group-preview-row flex items-center justify-between">
      <span class="text-body2 fg-body">${esc(c.translation)}</span>
      <span class="text-body2 fg-secondary">${sourceHTML(c)}</span>
    </div>
  `).join("");

  return `
    <button
      class="lookup-group-summary flex-col tappable"
      data-action="lookup/open-group"
      data-block-index="${blockIndex}"
      data-group-index="${groupIndex}"
    >
      <div class="lookup-group-summary-header flex items-center justify-between">
        <span class="lookup-group-title text-body1 font-semibold fg-body">${esc(group.title)}</span>
        <span class="lookup-group-count text-body2 fg-secondary">${countLabel}</span>
      </div>
      ${preview}
    </button>
  `;
}

function renderCard(card, { blockIndex, groupIndex, cardIndex, groupTitle, saved = false } = {}) {
  const dataAttrs = [
    blockIndex !== undefined ? `data-block-index="${blockIndex}"` : "",
    groupIndex !== undefined ? `data-group-index="${groupIndex}"` : "",
    cardIndex !== undefined ? `data-card-index="${cardIndex}"` : "",
  ].join(" ");
  // Re-seed prefill rule (see openLookupPanel's `reseed` doc comment):
  // group cards carry their group's title, primary/block cards carry none.
  const reseedGroupTitleAttr = groupTitle ? `data-group-title="${esc(groupTitle)}"` : "";
  const savedAttr = saved ? "disabled" : "";

  return `
    <div class="lookup-card bg-surface flex-col" data-saved="${saved}" ${dataAttrs}>
      <div class="lookup-card-primary flex-col">
        <span class="lookup-card-headword text-h2 fg-body">${esc(card.translation)}</span>
        ${card.definition ? `<span class="lookup-card-definition text-body2 fg-secondary">${esc(card.definition)}</span>` : ""}
      </div>
      <div class="lookup-card-divider"></div>
      <div class="lookup-card-source flex-col">
        <span class="lookup-card-text text-h2 fg-accent">${sourceHTML(card)}</span>
      </div>
      <div class="lookup-card-actions flex items-center justify-end gap-sm">
        <button class="icon-button lookup-card-play" data-action="lookup/play" ${dataAttrs} aria-label="Play audio">🔊</button>
        <button class="icon-button lookup-card-save" data-action="lookup/save" ${dataAttrs} ${savedAttr} aria-label="Save to phrasebook">🔖</button>
        <button class="icon-button lookup-card-reseed" data-action="lookup/reseed" ${dataAttrs} ${reseedGroupTitleAttr} aria-label="Search from this card">🔍</button>
      </div>
    </div>
  `;
}

function sourceHTML(card) {
  return Array.isArray(card.reading) ? renderRuby(card.reading) : esc(card.text || "");
}

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cap(str) {
  return str ? str[0].toUpperCase() + str.slice(1) : str;
}
