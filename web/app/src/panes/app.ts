import { createUIState, createHost, setAttrSafe } from '../js/uiState';
import type { UIState } from '../js/uiState';
import { createDelegate } from '../js/delegate';
import { getLastDeckId, setLastDeckId } from '../js/preferences';
import type { AppSlices, AppPayloads, AppTransitions } from '../js/app-types';
import navPane from './nav-pane';
import contentPane from './content-pane';
import actionPane from './action-pane';
import detailsPane from './details-pane';
import * as db from '../js/db';

export interface ShellSlice { exposed: 'foreground' | 'background' }
const shellTransitions: AppTransitions = {
  'shell/toggle': slice => ({exposed: slice.exposed === 'foreground' ? 'background' : 'foreground'}),
  'shell/close': () => ({exposed:'foreground'}),
  'shell/open': () => ({exposed:'background'}),
};

export interface AppMount {
  ui: UIState<AppSlices, AppPayloads>;
  dispose(): void;
}

const mounts = new WeakMap<HTMLElement, AppMount>();

/** Mounts one owned application tree without installing routing or debug hooks. */
export function mountApp(appEl: HTMLElement, params: Record<string,string> = {}): AppMount {
  mounts.get(appEl)?.dispose();
  const initialDeckId = params.id || getLastDeckId();
  const initialShell = initialDeckId ? 'foreground' : 'background';
  appEl.dataset.shell = initialShell;
  appEl.dataset.actionState = 'closed';
  appEl.innerHTML = `
    <div id="app-shell" class="fixed-inset overflow-hidden">
      ${navPane.render(navPane.initialState)}
      ${contentPane.render(contentPane.initialState)}
      <div class="shell-swipe-handle"></div>
    </div>
    ${detailsPane.render()}
    ${actionPane.render()}
  `;
  const ownedNodes = [...appEl.childNodes];
  const ui = createUIState<AppSlices,AppPayloads>({
    shell: {exposed:initialShell},
    nav: navPane.initialState,
    content: contentPane.initialState,
    action: actionPane.initialState,
    details: detailsPane.initialState,
  });
  ui.registerTransitions(shellTransitions);
  ui.registerTransitions(navPane.transitions);
  ui.registerTransitions(contentPane.transitions);
  ui.registerTransitions(actionPane.transitions);
  ui.registerTransitions(detailsPane.transitions);
  const unsubscribeShell = ui.subscribe('shell', next => setAttrSafe(appEl, 'shell', next.exposed));
  const unsubscribeContent = ui.subscribe('content', (next,prev) => {
    if (next.deckId && next.deckId !== prev.deckId) setLastDeckId(next.deckId);
  });
  const navEl = appEl.querySelector<HTMLElement>('#nav-pane');
  const contentEl = appEl.querySelector<HTMLElement>('#content-pane');
  const actionEl = appEl.querySelector<HTMLElement>('#action-layer');
  const detailsEl = appEl.querySelector<HTMLElement>('#details-layer');
  if (!navEl || !contentEl || !actionEl || !detailsEl) throw new Error('Missing application pane');
  const navDelegate = createDelegate(navEl);
  const contentDelegate = createDelegate(contentEl);
  const detailsDelegate = createDelegate(detailsEl);
  const cleanups = [
    navPane.bindEvents(navEl, createHost({ui,delegate:navDelegate,stageEl:appEl})),
    contentPane.bindEvents(contentEl, createHost({ui,delegate:contentDelegate,stageEl:appEl})),
    detailsPane.bindEvents(detailsEl, createHost({ui,delegate:detailsDelegate,stageEl:appEl})),
    actionPane.bindEvents(actionEl, createHost({ui,delegate:null,stageEl:appEl})),
  ];
  let disposed = false;
  const mount: AppMount = {
    ui,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cleanup of cleanups) cleanup();
      unsubscribeShell();
      unsubscribeContent();
      navDelegate.dispose();
      contentDelegate.dispose();
      detailsDelegate.dispose();
      for (const node of ownedNodes) {
        if (node.parentNode === appEl) node.remove();
      }
      if (mounts.get(appEl) === mount) {
        mounts.delete(appEl);
        delete appEl.dataset.shell;
        delete appEl.dataset.actionState;
        delete appEl.dataset.deckMode;
      }
    },
  };
  mounts.set(appEl, mount);
  if (initialDeckId) ui.transition('content/select-deck', {id:initialDeckId});
  return mount;
}

/** Production root lookup and mount-scoped console debugging. */
export function initApp(params: Record<string,string> = {}): AppMount {
  const appEl = document.getElementById('app');
  if (!appEl) throw new Error('Missing application root');
  const mount = mountApp(appEl, params);
  const debug = {ui:mount.ui,db};
  window.__loudmouth = debug;
  const dispose = mount.dispose;
  mount.dispose = () => {
    dispose();
    if (window.__loudmouth === debug) delete window.__loudmouth;
  };
  return mount;
}
