/**
 * delegate — one click handler per layer.
 *
 * See web/docs/PANE_PROTOCOL.html, Rule 5. Panes never call
 * addEventListener('click', ...) on their own elements. Instead they
 * register action handlers against their layer's delegate; the delegate's
 * single listener finds the nearest [data-action] ancestor on click and
 * dispatches.
 *
 * Payload data lives on the same element as data-action, in additional
 * data-* attributes. The handler receives (event, actionElement) so it can
 * read those values.
 */

export function createDelegate(rootEl) {
  const handlers = new Map();

  rootEl.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || !rootEl.contains(el)) return;
    const fn = handlers.get(el.dataset.action);
    if (!fn) return; // unknown action: silent no-op
    fn(e, el);
  });

  return {
    register(action, fn) {
      handlers.set(action, fn);
    },
    unregister(action) {
      handlers.delete(action);
    },
  };
}
