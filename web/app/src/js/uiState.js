/**
 * uiState — the application's single namespaced state machine.
 *
 * See web/docs/PANE_PROTOCOL.html for the contract. Summary:
 *
 *   - State is one object split into named slices (namespaces). Each
 *     namespace is owned by exactly one pane module.
 *   - Subscribers register against a single namespace and only fire when
 *     that namespace's slice changes. Change is signalled by reference
 *     equality on the slice object — never deep-diff, never shallowEqual.
 *   - State changes flow through named transitions of the form
 *     `namespace/verb`. Transitions are pure: previous slice + payload →
 *     next slice. Returning `undefined` clears the slice (sets it to null).
 *   - Unknown transitions throw in development and warn in production.
 *   - Duplicate transition registration throws at boot.
 */

const IS_DEV = (() => {
  try {
    return !!import.meta.env?.DEV;
  } catch {
    return false;
  }
})();

export function createUIState(initialByNamespace = {}) {
  let state = { ...initialByNamespace };
  const listeners = new Map(); // ns -> Set<fn(next, prev)>
  const transitions = new Map(); // verb -> fn(slice, payload)

  function get(ns) {
    return ns === undefined ? state : state[ns];
  }

  function setNs(ns, next) {
    const prev = state[ns];
    if (prev === next) return;
    state = { ...state, [ns]: next };
    const set = listeners.get(ns);
    if (!set) return;
    set.forEach((fn) => fn(next, prev));
  }

  function subscribe(ns, fn) {
    let set = listeners.get(ns);
    if (!set) {
      set = new Set();
      listeners.set(ns, set);
    }
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  }

  function registerTransitions(map) {
    for (const [name, fn] of Object.entries(map)) {
      if (transitions.has(name)) {
        throw new Error(`uiState: duplicate transition registration: ${name}`);
      }
      if (typeof fn !== "function") {
        throw new Error(`uiState: transition ${name} is not a function`);
      }
      transitions.set(name, fn);
    }
  }

  function transition(verb, payload) {
    const fn = transitions.get(verb);
    if (!fn) {
      const msg = `uiState: unknown transition: ${verb}`;
      if (IS_DEV) throw new Error(msg);
      console.warn(msg);
      return;
    }
    const sep = verb.indexOf("/");
    if (sep < 0) {
      const msg = `uiState: transition name must be namespace/verb: ${verb}`;
      if (IS_DEV) throw new Error(msg);
      console.warn(msg);
      return;
    }
    const ns = verb.slice(0, sep);
    const result = fn(state[ns], payload);
    setNs(ns, result === undefined ? null : result);
  }

  return { get, setNs, subscribe, registerTransitions, transition };
}

/**
 * createHost — shared host shape passed to every pane's bindEvents.
 *
 * Panes never reach for globals or import other panes directly. If they
 * need something not in host, the host shape is extended (a protocol
 * change), not worked around.
 */
export function createHost({ ui, delegate, parent }) {
  return { ui, delegate, parent: parent || null };
}

/**
 * setAttrSafe — shared subscriber helper that respects [data-dragging].
 *
 * Subscribers must never write to an element while a gesture is dragging
 * it (or an ancestor). The helper either writes immediately or no-ops; a
 * future queue could defer until touchend if a gesture's mid-flight calls
 * a transition (forbidden by Rule 6 but the guard makes accidents harmless).
 */
export function setAttrSafe(el, key, value) {
  let cursor = el;
  while (cursor) {
    if (cursor.dataset && cursor.dataset.dragging !== undefined) return;
    cursor = cursor.parentElement;
  }
  if (value === null || value === undefined) {
    delete el.dataset[key];
  } else {
    el.dataset[key] = String(value);
  }
}

/**
 * setListHTMLSafe — list re-render variant of setAttrSafe.
 *
 * Rule 4 allows a list region's innerHTML to be re-built from fresh data.
 * Rule 7 forbids that re-build while a gesture is dragging items inside
 * the region: the gesture marks the region itself with [data-dragging],
 * and this helper no-ops the rebuild until it clears.
 */
export function setListHTMLSafe(el, html) {
  if (el.dataset && el.dataset.dragging !== undefined) return false;
  el.innerHTML = html;
  return true;
}
