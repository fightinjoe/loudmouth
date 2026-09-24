import { createUIState, createHost, setAttrSafe } from '../js/uiState';
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

export function initApp(params: Record<string,string> = {}): void {
  const appEl = document.getElementById('app');
  if (!appEl) throw new Error('Missing application root');
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
  ui.subscribe('shell', next => setAttrSafe(appEl, 'shell', next.exposed));
  ui.subscribe('content', (next,prev) => {
    if (next.deckId && next.deckId !== prev.deckId) setLastDeckId(next.deckId);
  });
  const navEl = appEl.querySelector<HTMLElement>('#nav-pane');
  const contentEl = appEl.querySelector<HTMLElement>('#content-pane');
  const actionEl = appEl.querySelector<HTMLElement>('#action-layer');
  const detailsEl = appEl.querySelector<HTMLElement>('#details-layer');
  if (!navEl || !contentEl || !actionEl || !detailsEl) throw new Error('Missing application pane');
  navPane.bindEvents(navEl, createHost({ui,delegate:createDelegate(navEl),stageEl:appEl}));
  contentPane.bindEvents(contentEl, createHost({ui,delegate:createDelegate(contentEl),stageEl:appEl}));
  detailsPane.bindEvents(detailsEl, createHost({ui,delegate:createDelegate(detailsEl),stageEl:appEl}));
  actionPane.bindEvents(actionEl, createHost({ui,delegate:null,stageEl:appEl}));
  if (initialDeckId) ui.transition('content/select-deck', {id:initialDeckId});
  window.__loudmouth = {ui,db};
}
