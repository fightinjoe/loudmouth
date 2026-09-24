/** A click handler registered with a layer-scoped event delegate. */
export type DelegateHandler = (event: MouseEvent, actionElement: HTMLElement) => void;

/** Handle for registering and unregistering delegated click actions. */
export interface Delegate {
  register(action: string, handler: DelegateHandler): void;
  unregister(action: string): void;
}

/** Creates one delegated click listener for a UI layer. */
export function createDelegate(rootElement: HTMLElement): Delegate {
  const handlers = new Map<string, DelegateHandler>();

  rootElement.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;

    const candidate = event.target.closest("[data-action]");
    if (!(candidate instanceof HTMLElement) || !rootElement.contains(candidate)) return;

    const action = candidate.dataset.action;
    if (!action) return;
    const handler = handlers.get(action);
    if (!handler) return;
    handler(event, candidate);
  });

  return {
    register(action, handler) {
      handlers.set(action, handler);
    },
    unregister(action) {
      handlers.delete(action);
    },
  };
}
