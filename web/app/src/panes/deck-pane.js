// Deck pane — content-layer pane that lists the cards in a deck.
//
// Conforms to the Pane Protocol (web/docs/PANE_PROTOCOL.html):
//   - Single shared state slice at namespace "deck".
//   - Named transitions only (deck/verb).
//   - render() runs once; visual changes flow through data-* attributes
//     on the pane root (data-mode="normal" | "edit").
//   - Clicks routed through the content-layer delegate via data-action.
//   - Reorder gesture is wired to a STATIC handle (a strip overlaying the
//     list region), not to the dynamic card rows. The handle hit-tests
//     `event.target.closest('[data-card-id]')` to figure out which row
//     was grabbed.
//   - The gesture writes inline transforms during touchmove and only calls
//     a named transition on touchend.
//   - Subscribers use a setAttrSafe helper that respects [data-dragging].
//
// What this pane does NOT do:
//   - It does not implement the Generate Cards or Settings action panes.
//     It only fires `action/open` with a `kind` payload; the action layer
//     owns the rest.
//   - It does not persist card order — `saveOrder(deckId, newOrder)` is a
//     stub callable from the deck/confirm-edit transition's subscriber.

// Public stub. Real persistence is wired elsewhere; this exists so the
// confirm-edit subscriber has something concrete to call.
export function saveOrder(deckId, newOrder) {
  // eslint-disable-next-line no-console
  console.log('[deck-pane] saveOrder stub', { deckId, newOrder });
}

// ─── Slice shape ──────────────────────────────────────────────────────────
//
// {
//   deckId:    string,                    // which deck is on screen
//   title:     string,                    // header title
//   cards:     Array<{ id, text, meaning }>, // current visible order
//   mode:      'normal' | 'edit',         // controls header buttons and footer
//   menuOpen:  boolean,                   // title-tap menu visibility
//   editOrder: Array<string> | null,      // working order while in edit mode
// }
//
// initialState is an "empty" deck — the host app installs a real deck via
// deck/load before the user sees the pane.

const REORDER_DRAG_THRESHOLD_PX = 4;
const ROW_HEIGHT_PX = 52;

const namespace = 'deck';

const initialState = {
  deckId: null,
  title: '',
  cards: [],
  mode: 'normal',
  menuOpen: false,
  editOrder: null,
};

// ─── Transitions ──────────────────────────────────────────────────────────
//
// All transitions are pure (prevSlice, payload) -> nextSlice. They never
// touch the DOM, never call other transitions, never produce side effects.

const transitions = {
  'deck/load': (_s, p) => ({
    deckId: p.deckId,
    title: p.title,
    cards: p.cards,
    mode: 'normal',
    menuOpen: false,
    editOrder: null,
  }),

  'deck/toggle-menu': (s) => ({ ...s, menuOpen: !s.menuOpen }),
  'deck/close-menu': (s) => ({ ...s, menuOpen: false }),

  // Enter edit mode. Snapshot the current order so we can mutate it freely.
  'deck/enter-edit': (s) => ({
    ...s,
    mode: 'edit',
    menuOpen: false,
    editOrder: s.cards.map((c) => c.id),
  }),

  // Reorder during edit mode. Payload: { fromId, toIndex }.
  // Returns the same reference if nothing actually changed, so subscribers
  // are not notified (Rule 2).
  'deck/reorder': (s, p) => {
    if (s.mode !== 'edit' || !s.editOrder) return s;
    const from = s.editOrder.indexOf(p.fromId);
    if (from < 0 || from === p.toIndex) return s;
    const next = s.editOrder.slice();
    const [moved] = next.splice(from, 1);
    const clamped = Math.max(0, Math.min(next.length, p.toIndex));
    next.splice(clamped, 0, moved);
    return { ...s, editOrder: next };
  },

  // Commit edit mode. The matching subscriber fires saveOrder() and then the
  // cards array is re-sorted to match editOrder so the next render is stable.
  'deck/confirm-edit': (s) => {
    if (s.mode !== 'edit' || !s.editOrder) return s;
    const byId = new Map(s.cards.map((c) => [c.id, c]));
    const reordered = s.editOrder.map((id) => byId.get(id)).filter(Boolean);
    return {
      ...s,
      cards: reordered,
      mode: 'normal',
      menuOpen: false,
      editOrder: null,
    };
  },

  'deck/cancel-edit': (s) => ({
    ...s,
    mode: 'normal',
    menuOpen: false,
    editOrder: null,
  }),
};

// ─── Render ───────────────────────────────────────────────────────────────
//
// Returns the full HTML for the pane root in one shot. Every element any
// state could ever show is present here. The title-tap menu, the (+)/(✓)
// header buttons, the "Add cards" footer input, and the static reorder
// handle are all rendered up front and shown/hidden via CSS attribute
// selectors keyed off `[data-mode]` and `[data-menu-open]` on the root.

function render(slice) {
  return `
    <div class="deck-pane"
         data-mode="${slice.mode}"
         data-menu-open="${slice.menuOpen ? 'true' : 'false'}">
      <div class="title-bar">
        <button class="title-bar__menu"
                data-action="shell/toggle"
                aria-label="Open navigation">&#9776;</button>

        <button class="title-bar__title"
                data-action="deck/toggle-menu"
                aria-haspopup="menu"
                aria-expanded="${slice.menuOpen ? 'true' : 'false'}">
          <span class="deck-title-text">${escapeHtml(slice.title)}</span>
        </button>

        <!-- Header right button: + in normal mode, ✓ in edit mode. Both are
             rendered; CSS shows the one that matches [data-mode]. -->
        <button class="title-bar__add"
                data-action="action/open"
                data-action-kind="translate"
                aria-label="Add card">+</button>
        <button class="title-bar__confirm"
                data-action="deck/confirm-edit"
                aria-label="Confirm order">&#10003;</button>
      </div>

      <!-- Title-tap menu. Always in the DOM; CSS hides it unless
           [data-menu-open="true"]. -->
      <div class="deck-pane__title-menu" role="menu">
        <button class="deck-pane__title-menu-item"
                role="menuitem"
                data-action="action/open"
                data-action-kind="deck-settings">Settings</button>
        <button class="deck-pane__title-menu-item"
                role="menuitem"
                data-action="deck/enter-edit">Edit cards</button>
      </div>

      <!-- List region. innerHTML is replaced when cards or editOrder change.
           Card rows themselves are dynamic — that's why the reorder gesture
           is NOT wired to them. -->
      <div class="deck-pane__list" data-list-region></div>

      <!-- STATIC reorder handle. Overlays the list region only while in
           edit mode (CSS controls pointer-events / opacity). It is a single
           element wired once during bindEvents; it survives every list
           re-render. touchstart hit-tests event.target.closest('[data-card-id]')
           to determine which row was grabbed. -->
      <div class="deck-pane__reorder-handle"
           data-static-handle="reorder"
           aria-hidden="true"></div>

      <!-- Footer "Add cards" input. Always in the DOM; CSS hides it unless
           [data-mode="edit"]. Tapping it opens the Generate Cards action
           pane via the kind payload. -->
      <div class="deck-pane__footer">
        <input class="deck-pane__add-input"
               type="text"
               readonly
               placeholder="Add cards"
               data-action="action/open"
               data-action-kind="generate"
               aria-label="Add cards">
      </div>
    </div>
  `;
}

// ─── bindEvents ───────────────────────────────────────────────────────────
//
// host: { contentDelegate, ui }
//   - contentDelegate is the SINGLE click handler for the content layer
//     (Rule 5). The pane registers actions through it; it never calls
//     addEventListener('click', ...) itself.
//   - ui is the global state machine with .subscribe(ns, fn), .get(ns),
//     .transition(name, payload).

function bindEvents(rootEl, host) {
  const { contentDelegate, ui } = host;
  const listEl = rootEl.querySelector('[data-list-region]');
  const handleEl = rootEl.querySelector('[data-static-handle="reorder"]');

  // ── Click actions (routed through the content-layer delegate) ──────────

  const registrations = [
    ['deck/toggle-menu', () => ui.transition('deck/toggle-menu')],
    ['deck/close-menu', () => ui.transition('deck/close-menu')],
    ['deck/enter-edit', () => ui.transition('deck/enter-edit')],
    ['deck/cancel-edit', () => ui.transition('deck/cancel-edit')],
    ['deck/confirm-edit', () => {
      const slice = ui.get(namespace);
      // saveOrder fires here, OUTSIDE the transition (transitions are pure).
      if (slice && slice.editOrder) {
        saveOrder(slice.deckId, slice.editOrder.slice());
      }
      ui.transition('deck/confirm-edit');
    }],

    // action/open is owned by the action layer's transition, but the click
    // target lives in this pane. The action handler just forwards intent —
    // the kind comes from data-action-kind on the same element.
    ['action/open', (_e, el) => {
      ui.transition('action/open', { kind: el.dataset.actionKind });
      // Closing the title menu on any action open is a UX nicety.
      if (ui.get(namespace).menuOpen) ui.transition('deck/close-menu');
    }],
  ];
  registrations.forEach(([name, fn]) => contentDelegate.register(name, fn));

  // ── Subscribers ────────────────────────────────────────────────────────

  function setAttrSafe(el, key, value) {
    // Rule 7: never write to an element (or any ancestor) that is mid-drag.
    let p = el;
    while (p) {
      if (p.dataset && p.dataset.dragging !== undefined) return;
      p = p.parentElement;
    }
    if (value === null || value === undefined) delete el.dataset[key];
    else el.dataset[key] = String(value);
  }

  function paintList(slice) {
    // List re-render is the explicit Rule 4 exception. Card rows are
    // dynamic; that's fine because clicks delegate to the layer root and
    // the reorder gesture lives on the static handle, not the rows.
    const order = slice.mode === 'edit' && slice.editOrder
      ? slice.editOrder
      : slice.cards.map((c) => c.id);
    const byId = new Map(slice.cards.map((c) => [c.id, c]));
    listEl.innerHTML = order.map((id, i) => {
      const card = byId.get(id);
      if (!card) return '';
      return `
        <div class="card-row"
             data-card-id="${escapeAttr(card.id)}"
             data-index="${i}">
          <span class="card-row__text">${escapeHtml(card.text)}</span>
          <span class="card-row__meaning">${escapeHtml(card.meaning)}</span>
          <span class="card-row__grip" aria-hidden="true">&#x2261;</span>
        </div>
      `;
    }).join('');
  }

  const unsubscribe = ui.subscribe(namespace, (next) => {
    setAttrSafe(rootEl, 'mode', next.mode);
    setAttrSafe(rootEl, 'menuOpen', next.menuOpen ? 'true' : 'false');
    const titleSpan = rootEl.querySelector('.deck-title-text');
    if (titleSpan) titleSpan.textContent = next.title;
    paintList(next);
  });

  // Initial paint — bindEvents runs after render, so we need to reflect the
  // current slice into the freshly-mounted DOM.
  paintList(ui.get(namespace));

  // ── Reorder gesture ────────────────────────────────────────────────────
  //
  // Wired ONCE to the static handle. Hit-tests on touchstart to find the
  // row beneath the finger; tracks pixel offset under the finger; commits
  // a single named transition (deck/reorder) on touchend.

  const gestureState = {
    startX: 0,
    startY: 0,
    axis: null,           // 'h' | 'v' | null
    rowEl: null,
    rowId: null,
    startIndex: -1,
    active: false,
  };

  function findRowAt(x, y) {
    // The handle sits above the list, so elementFromPoint finds the handle
    // itself. We temporarily disable its pointer events to look through.
    const prev = handleEl.style.pointerEvents;
    handleEl.style.pointerEvents = 'none';
    const el = document.elementFromPoint(x, y);
    handleEl.style.pointerEvents = prev;
    if (!el) return null;
    return el.closest('[data-card-id]');
  }

  function onTouchStart(e) {
    // Only active during edit mode. CSS already disables pointer-events on
    // the handle in normal mode, but guard anyway in case of mouse use.
    if (ui.get(namespace).mode !== 'edit') return;
    const t = e.touches ? e.touches[0] : e;
    const row = findRowAt(t.clientX, t.clientY);
    if (!row) return;
    gestureState.rowEl = row;
    gestureState.rowId = row.dataset.cardId;
    gestureState.startIndex = Number(row.dataset.index);
    gestureState.startX = t.clientX;
    gestureState.startY = t.clientY;
    gestureState.axis = null;
    gestureState.active = false;
  }

  function onTouchMove(e) {
    if (!gestureState.rowEl) return;
    const t = e.touches ? e.touches[0] : e;
    const dx = t.clientX - gestureState.startX;
    const dy = t.clientY - gestureState.startY;

    if (!gestureState.axis) {
      if (Math.abs(dx) < REORDER_DRAG_THRESHOLD_PX
          && Math.abs(dy) < REORDER_DRAG_THRESHOLD_PX) return;
      // Reorder is vertical. If the user moved horizontally first, bail so
      // page scroll / horizontal gestures are not disrupted.
      gestureState.axis = Math.abs(dy) > Math.abs(dx) ? 'v' : 'h';
      if (gestureState.axis !== 'v') {
        gestureState.rowEl = null;
        return;
      }
    }

    if (!gestureState.active) {
      gestureState.active = true;
      // Mark BOTH the row and the list region as dragging so subscribers
      // do not paintList() over us mid-drag (Rule 7).
      gestureState.rowEl.dataset.dragging = '';
      listEl.dataset.dragging = '';
    }

    // Track the finger. Inline transform only.
    gestureState.rowEl.style.transform = `translateY(${dy}px)`;
  }

  function onTouchEnd(e) {
    if (!gestureState.rowEl) return;
    const t = (e.changedTouches && e.changedTouches[0]) || e;
    const dy = t.clientY - gestureState.startY;
    const row = gestureState.rowEl;

    // Compute the target index from final pixel offset. Integer division by
    // row height gives the slot the finger ended up over.
    const delta = Math.round(dy / ROW_HEIGHT_PX);
    const toIndex = gestureState.startIndex + delta;

    // Reset visuals BEFORE clearing dragging — the inline transform comes
    // off, then dragging is cleared, then the transition fires. The
    // subscriber's paintList() then runs (no longer blocked by dragging)
    // and the row appears in its new slot.
    row.style.transform = '';
    delete row.dataset.dragging;
    delete listEl.dataset.dragging;

    if (gestureState.axis === 'v' && Math.abs(delta) >= 1) {
      ui.transition('deck/reorder', {
        fromId: gestureState.rowId,
        toIndex,
      });
    }

    gestureState.rowEl = null;
    gestureState.rowId = null;
    gestureState.startIndex = -1;
    gestureState.axis = null;
    gestureState.active = false;
  }

  function onTouchCancel(e) {
    // Treat the same as a below-threshold end: snap back, clear state.
    if (!gestureState.rowEl) return;
    gestureState.rowEl.style.transform = '';
    delete gestureState.rowEl.dataset.dragging;
    delete listEl.dataset.dragging;
    gestureState.rowEl = null;
    gestureState.rowId = null;
    gestureState.startIndex = -1;
    gestureState.axis = null;
    gestureState.active = false;
  }

  handleEl.addEventListener('touchstart', onTouchStart, { passive: true });
  handleEl.addEventListener('touchmove', onTouchMove, { passive: true });
  handleEl.addEventListener('touchend', onTouchEnd);
  handleEl.addEventListener('touchcancel', onTouchCancel);

  // ── Cleanup ────────────────────────────────────────────────────────────

  return function cleanup() {
    registrations.forEach(([name]) => contentDelegate.unregister(name));
    unsubscribe();
    handleEl.removeEventListener('touchstart', onTouchStart);
    handleEl.removeEventListener('touchmove', onTouchMove);
    handleEl.removeEventListener('touchend', onTouchEnd);
    handleEl.removeEventListener('touchcancel', onTouchCancel);
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

// ─── Module export ────────────────────────────────────────────────────────
// Exactly the five fields the Pane Protocol contract requires.
export default { namespace, initialState, transitions, render, bindEvents };
