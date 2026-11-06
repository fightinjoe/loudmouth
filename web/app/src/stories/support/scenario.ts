import { db } from '../../js/db';
import { mountApp, type AppMount } from '../../panes/app';
import { seedLibrary, type FixtureOptions, type SeededLibrary } from './fixtures';
import {
  configureTransport, installTransport, resetTransport, resolvePending, failPending,
  requests, type Endpoint, type Outcome,
} from './transport';
import { DATABASE_NAME, SESSION_PREFIX, PREFERENCE_PREFIX, BREAKDOWN_CACHE_PREFIX } from './storage-config';
import { resetSpeech, speechEvents } from './speech';
import { mountedStory, type StoryCleanup } from './mounted-story';

export interface ScenarioOptions extends FixtureOptions {
  outcomes?: Partial<Record<Endpoint, Outcome>>;
  initial?: 'library' | 'textbook';
  setup?: (data: SeededLibrary) => Promise<void> | void;
  /** Mount a public controller on the real app root. Return its synchronous dispose,
   * not its animated close; called before app disposal on disconnect and reset. */
  mount?: (root: HTMLElement, data: SeededLibrary, app: AppMount) => void | StoryCleanup;
}

interface ScenarioView {
  root: HTMLElement;
  app: AppMount;
  dispose: StoryCleanup;
}
interface ScenarioSession {
  options: ScenarioOptions;
  data?: SeededLibrary;
  view?: ScenarioView;
  cleanups: StoryCleanup[];
  work: Set<Promise<unknown>>;
  events: string[];
  refreshLog?: () => void;
}

let session: ScenarioSession | undefined;
let queue: Promise<unknown> = Promise.resolve();
let failure: HTMLElement | undefined;

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation);
  queue = result.catch(() => undefined);
  return result;
}

// Observe native transactions without replacing Dexie, its tables or persistence APIs.
// Waiting for a stable task turn also drains completion continuations that start a
// second transaction (for example a committed book binding its illustration).
const transactions = new Set<Promise<void>>();
let transactionRevision = 0;
db.use({
  stack: 'dbcore',
  name: 'workbench-transaction-ownership',
  create(core) {
    return {
      ...core,
      transaction(stores, mode, options) {
        const transaction = core.transaction(stores, mode, options);
        const native = transaction as IDBTransaction;
        transactionRevision += 1;
        let finish!: () => void;
        const settled = new Promise<void>((resolve) => { finish = resolve; });
        transactions.add(settled);
        const complete = () => {
          native.removeEventListener('complete', complete);
          native.removeEventListener('abort', complete);
          transactions.delete(settled);
          finish();
        };
        native.addEventListener('complete', complete);
        native.addEventListener('abort', complete);
        return transaction;
      },
    };
  },
});

async function drainDatabase(): Promise<void> {
  let revision: number;
  do {
    revision = transactionRevision;
    await Promise.all([...transactions]);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  } while (transactions.size || revision !== transactionRevision);
}

function assertSandbox(): void {
  if (!DATABASE_NAME.startsWith('catchphrase-storybook.') || db.name !== DATABASE_NAME
    || SESSION_PREFIX !== `${DATABASE_NAME}.`
    || !PREFERENCE_PREFIX.startsWith(SESSION_PREFIX) || !BREAKDOWN_CACHE_PREFIX.startsWith(SESSION_PREFIX)) {
    throw new Error('Workbench refuses to reset storage outside its preview-document sandbox');
  }
}

async function clearSandbox(): Promise<void> {
  assertSandbox();
  await drainDatabase();
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
  await drainDatabase();
  for (const storage of [localStorage, sessionStorage]) {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(SESSION_PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  }
}

function showFailure(error: unknown, host?: HTMLElement): void {
  failure?.remove();
  failure = document.createElement('section');
  failure.className = 'workbench-failure';
  failure.setAttribute('role', 'alert');
  const heading = document.createElement('h2');
  heading.textContent = 'Workbench scenario failed';
  const message = document.createElement('pre');
  message.textContent = error instanceof Error ? error.message : String(error);
  failure.append(heading, message);
  (host ?? document.body).append(failure);
}

async function release(current?: ScenarioSession): Promise<void> {
  const errors: unknown[] = [];
  try { current?.view?.dispose(); } catch (error) { errors.push(error); }
  if (current) {
    for (const cleanup of current.cleanups.splice(0).reverse()) {
      try { cleanup(); } catch (error) { errors.push(error); }
    }
  }
  try { await resetTransport(); } catch (error) { errors.push(error); }
  if (current) {
    while (current.work.size) await Promise.allSettled([...current.work]);
  }
  try { await clearSandbox(); } catch (error) { errors.push(error); }
  resetSpeech();
  if (current) current.data = undefined;
  if (errors.length) throw new AggregateError(errors, 'Workbench scenario teardown failed');
}

async function prepare(current: ScenarioSession): Promise<void> {
  assertSandbox();
  installTransport();
  configureTransport(current.options.outcomes);
  current.events.length = 0;
  current.data = await seedLibrary(current.options);
  await current.options.setup?.(current.data);
  logScenarioEvent('Scenario ready');
}

/** Restore session resources before reset or the next story's setup.
 * Controls-only remounts retain these resources; mount-specific resources belong
 * in ScenarioOptions.mount's returned synchronous disposer instead. */
export function onScenarioCleanup(cleanup: StoryCleanup): void {
  if (!session) throw new Error('No active workbench scenario');
  session.cleanups.push(cleanup);
}

/** Keep explicitly owned async work in the teardown barrier; cleanup must settle deferred work. */
export function trackScenarioWork<T>(work: Promise<T>): Promise<T> {
  if (!session) throw new Error('No active workbench scenario');
  const owner = session;
  owner.work.add(work);
  void work.then(() => owner.work.delete(work), () => owner.work.delete(work));
  return work;
}

/** Restore the exact own descriptor, or remove an override of an inherited property. */
export function replaceScenarioProperty(target: object, key: PropertyKey, descriptor: PropertyDescriptor): void {
  if (!session) throw new Error('No active workbench scenario');
  const original = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, ...descriptor });
  onScenarioCleanup(() => {
    if (original) Object.defineProperty(target, key, original);
    else Reflect.deleteProperty(target, key);
  });
}

export function logScenarioEvent(name: string, detail?: string): void {
  if (!session) throw new Error('No active workbench scenario');
  session.events.push(detail ? `${name}: ${detail}` : name);
  if (session.events.length > 200) session.events.shift();
  session.refreshLog?.();
}

export function getScenario(): { data: SeededLibrary; root: HTMLElement; app: AppMount } {
  if (!session?.data || !session.view) throw new Error('Workbench scenario is not mounted');
  return { data: session.data, root: session.view.root, app: session.view.app };
}

function mountView(host: HTMLElement, current: ScenarioSession): StoryCleanup {
  if (session !== current || !current.data) throw new Error('Workbench scenario must finish beforeEach before rendering');
  current.view?.dispose();
  const root = document.createElement('div');
  root.id = 'app';
  const toolbar = document.createElement('details');
  toolbar.className = 'workbench-tools';
  toolbar.innerHTML = '<summary>Workbench</summary><div class="workbench-tools-body"><div class="workbench-actions"></div><h2>Event log</h2><ol class="workbench-log" aria-label="Workbench event log"></ol></div>';
  const actions = toolbar.querySelector<HTMLElement>('.workbench-actions')!;
  const log = toolbar.querySelector<HTMLOListElement>('.workbench-log')!;
  const buttons: HTMLButtonElement[] = [];
  const addButton = (label: string, action: () => void) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', action);
    actions.append(button);
    buttons.push(button);
  };
  host.replaceChildren(root, toolbar);
  let app: AppMount;
  try {
    app = mountApp(root, current.options.initial === 'textbook' && current.data.deck
      ? { id: current.data.deck.id } : {});
    if (current.options.initial !== 'textbook') app.ui.transition('shell/open');
  } catch (error) {
    root.remove();
    toolbar.remove();
    showFailure(error, host);
    throw error;
  }

  let disposed = false;
  let extensionCleanup: void | StoryCleanup;
  let poll: number | undefined;
  const subscriptions: StoryCleanup[] = [];
  let previousLog = '';
  const refresh = () => {
    if (disposed) return;
    const lines = [
      ...current.events,
      ...requests.map((request, index) => `API ${index + 1} ${request.endpoint}: ${request.status}`),
      ...speechEvents.map((event) => event.kind === 'cancel' ? 'Speech cancelled' : `Speech ${event.lang ?? ''}: ${event.text ?? ''}`),
    ];
    const signature = JSON.stringify(lines);
    if (signature === previousLog) return;
    previousLog = signature;
    log.replaceChildren(...lines.map((line) => {
      const item = document.createElement('li');
      item.textContent = line;
      return item;
    }));
  };
  const view: ScenarioView = {
    root, app,
    dispose() {
      if (disposed) return;
      disposed = true;
      window.clearInterval(poll);
      window.removeEventListener('workbench:speech', refresh);
      subscriptions.forEach((unsubscribe) => unsubscribe());
      if (current.refreshLog === refresh) current.refreshLog = undefined;
      if (current.view === view) current.view = undefined;
      try { extensionCleanup?.(); }
      finally {
        try { app.dispose(); }
        finally { root.remove(); toolbar.remove(); }
      }
    },
  };
  current.view = view;
  current.refreshLog = refresh;
  addButton('Resolve', () => { resolvePending(); logScenarioEvent('Pending requests resolved'); });
  addButton('Fail', () => { failPending(); logScenarioEvent('Pending requests failed'); });
  addButton('Reset scenario', () => {
    buttons.forEach((button) => { button.disabled = true; });
    void serialize(async () => {
      if (session !== current || disposed || !host.isConnected) return;
      await release(current);
      try { await prepare(current); }
      catch (error) {
        try { await release(current); }
        catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Workbench reset failed'); }
        throw error;
      }
      if (session === current && host.isConnected) mountView(host, current);
    }).catch((error: unknown) => {
      showFailure(error, host.isConnected ? host : undefined);
      // A reset click has no Storybook hook promise to reject; report the failure
      // as a real browser error as well as keeping the visible failure specimen.
      queueMicrotask(() => { throw error; });
    });
  });
  try {
    for (const namespace of ['shell', 'nav', 'content', 'action', 'details'] as const) {
      subscriptions.push(app.ui.subscribe(namespace, () => {
        if (session === current) logScenarioEvent(`${namespace} state changed`);
      }));
    }
    extensionCleanup = current.options.mount?.(root, current.data, app);
    window.addEventListener('workbench:speech', refresh);
    poll = window.setInterval(refresh, 150);
    refresh();
  } catch (error) {
    view.dispose();
    showFailure(error, host);
    throw error;
  }
  // Reset replaces the view without replacing the lifecycle host. Its disconnect
  // must dispose whichever view that host currently owns, not just its first one.
  return () => {
    if (current.view?.root.parentElement === host) current.view.dispose();
    else view.dispose();
  };
}

/** Real production app with isolated, serialized fixtures and iframe-local ownership.
 * beforeEach and Reset scenario clear and reseed storage. Controls-only rerenders
 * and host reconnects mount fresh controllers but preserve sandbox persistence. */
export function appStory(options: ScenarioOptions = {}) {
  let owner: ScenarioSession | undefined;
  return {
    parameters: { layout: 'fullscreen', docs: { story: { inline: false } } },
    async beforeEach(): Promise<() => Promise<void>> {
      const current: ScenarioSession = { options, cleanups: [], work: new Set(), events: [] };
      await serialize(async () => {
        failure?.remove();
        failure = undefined;
        await release(session);
        session = current;
        owner = current;
        try {
          await prepare(current);
        } catch (error) {
          try { await release(current); }
          catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Workbench setup failed'); }
          showFailure(error);
          throw error;
        }
      }).catch((error: unknown) => {
        showFailure(error);
        throw error;
      });
      return () => serialize(async () => {
        if (session !== current) return;
        try { await release(current); }
        finally { if (session === current) session = undefined; }
      });
    },
    render(): HTMLElement {
      const current = owner;
      if (!current || current !== session || !current.data) {
        const error = new Error('Workbench story render requires its async beforeEach fixture setup');
        showFailure(error);
        throw error;
      }
      return mountedStory((host) => mountView(host, current));
    },
  };
}
