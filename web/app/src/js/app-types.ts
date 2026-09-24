import type { ShellSlice } from '../panes/app';
import type { NavSlice } from '../panes/nav-pane';
import type { ContentSlice } from '../panes/content-pane';
import type { ActionSlice, ActionOpen } from '../panes/action-pane';
import type { DetailsSlice, DetailsOpen, TargetState } from '../panes/details-pane';
import type { BreakdownResponse } from '@catchphrase/card-schema';
import type { Group, LibraryEntry } from './library-types';
import type { Host, TransitionMap, UIState } from './uiState';

export interface AppSlices {
  shell: ShellSlice;
  nav: NavSlice;
  content: ContentSlice;
  action: ActionSlice;
  details: DetailsSlice;
}

export interface AppPayloads {
  'shell/toggle': undefined;
  'shell/open': undefined;
  'shell/close': undefined;
  'nav/reload': undefined;
  'nav/refresh': {items: NavSlice['items']};
  'action/open': ActionOpen;
  'action/close': undefined;
  'content/select-deck': {id: string | null};
  'content/reload-deck': undefined;
  'content/loaded': {deck: ContentSlice['deck']; cards: LibraryEntry[]; groups?: Group[]};
  'content/cards-changed': {cards: LibraryEntry[]; groups?: Group[]; deckId?: string};
  'content/card-star-changed': {deckId: string; cardId: string; starredAt: string | null};
  'content/set-page': {pageKey: string};
  'content/enter-edit': undefined;
  'content/reorder': {pageOrder: string[]};
  'content/confirm-edit': undefined;
  'content/cancel-edit': undefined;
  'content/toggle-menu': undefined;
  'content/close-menu': undefined;
  'content/browse': NonNullable<ContentSlice['browse']>;
  'content/browse-back': undefined;
  'details/open': DetailsOpen;
  'details/close': undefined;
  'details/retry': undefined;
  'details/regenerate': undefined;
  'details/loaded': {requestId: number; breakdown: BreakdownResponse};
  'details/failed': {requestId: number; error: string};
  'details/select-part': {index: number};
  'details/toggle-all': undefined;
  'details/targets-resolved': {requestId: number; targets: Record<string, TargetState>};
  'details/target-pending': {identity: string; pending: boolean};
  'details/target-failed': {identity: string; error: string};
}

export type AppUI = UIState<AppSlices, AppPayloads>;
export type AppHost = Host<AppSlices, AppPayloads>;
export type AppTransitions = TransitionMap<AppSlices, AppPayloads>;
