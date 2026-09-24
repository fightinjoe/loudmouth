import type { Delegate } from "./delegate";

/** A subscriber for one namespaced state slice. */
export type StateSubscriber<T> = (next: T, previous: T) => void;

type TransitionNamespace<Name> = Name extends `${infer Namespace}/${string}`
  ? Namespace
  : never;

type StringKey<T> = Extract<keyof T, string>;

/** Transition names whose namespace is present in the application state. */
export type TransitionName<S extends object, P extends object> = {
  [Name in StringKey<P>]: TransitionNamespace<Name> extends StringKey<S> ? Name : never;
}[StringKey<P>];

type TransitionSlice<S extends object, Name extends string> =
  S[Extract<TransitionNamespace<Name>, keyof S>];

type TransitionResult<Slice> = null extends Slice ? Slice | undefined : Slice;

export type TransitionHandler<
  S extends object,
  P extends object,
  Name extends TransitionName<S, P>,
> = (
  slice: TransitionSlice<S, Name>,
  payload: P[Name],
) => TransitionResult<TransitionSlice<S, Name>>;

/**
 * A partial transition registration. Each `namespace/action` handler receives
 * that namespace's slice and the payload declared for that exact action.
 */
export type TransitionMap<S extends object, P extends object> = {
  [Name in TransitionName<S, P>]?: TransitionHandler<S, P, Name>;
};

export interface UIState<S extends object, P extends object> {
  get(): S;
  get<K extends keyof S>(namespace: K): S[K];
  setNs<K extends keyof S>(namespace: K, next: S[K]): void;
  subscribe<K extends keyof S>(namespace: K, subscriber: StateSubscriber<S[K]>): () => void;
  registerTransitions(map: TransitionMap<S, P>): void;
  transition<K extends keyof P>(
    name: K,
    ...args: undefined extends P[K] ? [payload?: P[K]] : [payload: P[K]]
  ): void;
}

export interface Host<S extends object, P extends object> {
  ui: UIState<S, P>;
  delegate: Delegate | null;
  stageEl: HTMLElement | null;
  parent: unknown | null;
}

export interface HostOptions<S extends object, P extends object> {
  ui: UIState<S, P>;
  delegate?: Delegate | null;
  stageEl?: HTMLElement | null;
  parent?: unknown;
}

const IS_DEV = (() => {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
})();

type ErasedSubscriber = (next: unknown, previous: unknown) => void;
type ErasedTransition = (slice: never, payload: never) => unknown;

/**
 * Creates the application's namespaced state machine. `S` is the complete
 * state shape and `P` maps transition names to their payloads.
 */
export function createUIState<
  S extends object,
  P extends object = Record<never, never>,
>(initialByNamespace: S): UIState<S, P> {
  let state: S = { ...initialByNamespace };

  // These maps are the only heterogeneous storage boundary. Public methods
  // retain each key/value relationship; dispatch erases it only at the call.
  const listeners = new Map<keyof S, Set<ErasedSubscriber>>();
  const transitions = new Map<string, ErasedTransition>();

  function get(): S;
  function get<K extends keyof S>(namespace: K): S[K];
  function get<K extends keyof S>(namespace?: K): S | S[K] {
    return namespace === undefined ? state : state[namespace];
  }

  function applyNamespace<K extends keyof S>(namespace: K, next: S[K]): void {
    const previous = state[namespace];
    if (previous === next) return;

    const nextState: S = { ...state };
    nextState[namespace] = next;
    state = nextState;
    listeners.get(namespace)?.forEach((subscriber) => subscriber(next, previous));
  }

  function setNs<K extends keyof S>(namespace: K, next: S[K]): void {
    applyNamespace(namespace, next);
  }

  function subscribe<K extends keyof S>(
    namespace: K,
    subscriber: StateSubscriber<S[K]>,
  ): () => void {
    let set = listeners.get(namespace);
    if (!set) {
      set = new Set<ErasedSubscriber>();
      listeners.set(namespace, set);
    }

    const erased: ErasedSubscriber = (next, previous) => {
      subscriber(next as S[K], previous as S[K]);
    };
    set.add(erased);

    return () => {
      set.delete(erased);
    };
  }

  function registerTransitions(map: TransitionMap<S, P>): void {
    for (const rawName in map) {
      if (!Object.hasOwn(map, rawName)) continue;
      const name = rawName as TransitionName<S, P>;
      const handler = map[name];
      if (transitions.has(name)) {
        throw new Error(`uiState: duplicate transition registration: ${name}`);
      }
      if (typeof handler !== "function") {
        throw new Error(`uiState: transition ${name} is not a function`);
      }
      transitions.set(name, handler);
    }
  }

  function transition<K extends keyof P>(
    name: K,
    ...args: undefined extends P[K] ? [payload?: P[K]] : [payload: P[K]]
  ): void {
    const transitionName = String(name);
    const handler = transitions.get(transitionName);
    if (!handler) {
      const message = `uiState: unknown transition: ${transitionName}`;
      if (IS_DEV) throw new Error(message);
      console.warn(message);
      return;
    }

    const separator = transitionName.indexOf("/");
    if (separator < 0) {
      const message = `uiState: transition name must be namespace/verb: ${transitionName}`;
      if (IS_DEV) throw new Error(message);
      console.warn(message);
      return;
    }

    const namespace = transitionName.slice(0, separator) as keyof S;
    const result = handler(state[namespace] as never, args[0] as never);
    applyNamespace(
      namespace,
      (result === undefined ? null : result) as S[typeof namespace],
    );
  }

  return { get, setNs, subscribe, registerTransitions, transition };
}

/** Creates the canonical host object passed to each pane's event binder. */
export function createHost<S extends object, P extends object>(
  { ui, delegate, stageEl, parent }: HostOptions<S, P>,
): Host<S, P> {
  return {
    ui,
    delegate: delegate ?? null,
    stageEl: stageEl ?? null,
    parent: parent ?? null,
  };
}

/** Writes a data attribute unless the element or an ancestor is being dragged. */
export function setAttrSafe(
  element: HTMLElement,
  key: string,
  value: string | number | boolean | null | undefined,
): void {
  let cursor: HTMLElement | null = element;
  while (cursor) {
    if (cursor.dataset.dragging !== undefined) return;
    cursor = cursor.parentElement;
  }

  if (value === null || value === undefined) {
    delete element.dataset[key];
  } else {
    element.dataset[key] = String(value);
  }
}

/** Rebuilds a list region unless a gesture currently owns that region. */
export function setListHTMLSafe(element: HTMLElement, html: string): boolean {
  if (element.dataset.dragging !== undefined) return false;
  element.innerHTML = html;
  return true;
}
