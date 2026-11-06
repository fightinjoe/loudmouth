import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';
import { validateBreakdownRequest, validateBreakdownResponse } from '@catchphrase/card-schema';
import { db, getCards, getReviewCards, toggleCardStar } from '../../js/db';
import { cardRequest, readCache } from '../../js/phrase-breakdown';
import type { LibraryEntry } from '../../js/library-types';
import { toImportJson } from '../../components/json-panel';
import { appStory, getScenario, logScenarioEvent } from '../support/scenario';
import { breakdownResponse } from '../support/fixtures';
import { allowLateResponse, requests, resolvePending, setOutcome, setResponseFactory } from '../support/transport';
import { speechEvents, ttsText } from '../support/speech';

const meta = {
  title: 'Interactions/Details',
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen', docs: { story: { inline: false }, description: { component: 'Executable journeys through src/panes/content-pane-actions.ts and src/panes/details-pane.ts, with real Dexie, real phrase-breakdown cache/validators and request-specific fixture responses. Real mounted card buttons supply geometry and focus restoration. Speech is recorded, never audible. Pointer events here exercise production event handlers; native touch scrolling and physical-device timing require browser/device acceptance. Reduced motion uses the actual browser preference, not a CSS substitute. Reset scenario clears only this iframe’s sandbox.' } } },
} satisfies Meta;
export default meta;
type Story = StoryObj;
const scene = () => appStory({ library: 'single', initial: 'textbook' });
// Match the app's ES2022 runtime/library; Promise.withResolvers requires ES2024.
const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const query = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const element = getScenario().root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing production details element: ${selector}`);
  return element;
};
const apiCount = () => requests.filter((request) => request.endpoint === '/phrase-breakdown').length;
const spoken = () => speechEvents.filter((event) => event.kind === 'speak');
async function phrase(): Promise<{ row: HTMLElement; opener: HTMLButtonElement; entry: LibraryEntry }> {
  // Initial navigation refresh legitimately cancels any active hold. Start gestures
  // only after both independently loaded production panes have mounted their data.
  await waitFor(() => expect(getScenario().app.ui.get('nav').items.length).toBeGreaterThan(0));
  let result: { row: HTMLElement; opener: HTMLButtonElement; entry: LibraryEntry } | undefined;
  await waitFor(() => {
    const { root, app } = getScenario();
    for (const row of root.querySelectorAll<HTMLElement>('[data-action="content/open-card"]')) {
      const entry = app.ui.get('content').cards.find((candidate) => candidate.key === row.dataset.entryKey);
      const opener = row.querySelector<HTMLButtonElement>('.card-term');
      if (entry?.card.type === 'phrase' && opener) { result = { row, opener, entry }; break; }
    }
    expect(result).toBeDefined();
  });
  return result!;
}
async function ready(): Promise<void> {
  await waitFor(() => expect(query('#details-layer')).toHaveAttribute('data-details-view', 'ready'));
  await waitFor(() => expect(query('#details-explanations').children.length).toBeGreaterThan(0));
  await waitFor(() => expect(query('#details-layer')).toHaveAttribute('data-details-state', 'open'));
}
async function open(method: 'keyboard' | 'context' = 'keyboard') {
  const origin = await phrase();
  origin.opener.focus({ preventScroll: true });
  if (method === 'keyboard') await fireEvent.keyDown(origin.opener, { key: 'F10', shiftKey: true });
  else {
    // A real secondary click starts with pointerdown, clearing the preceding
    // keyboard/hold click suppression before contextmenu is delivered.
    await fireEvent.pointerDown(origin.opener, { pointerId: 42, pointerType: 'mouse', isPrimary: true, button: 2 });
    await fireEvent.contextMenu(origin.opener);
    await fireEvent.pointerUp(origin.opener, { pointerId: 42, pointerType: 'mouse', isPrimary: true, button: 2 });
  }
  await waitFor(() => expect(query('#details-layer')).toHaveAttribute('data-details-state', 'open'));
  await expect(query('[role="dialog"]')).toBeVisible();
  return origin;
}
async function close(method: 'button' | 'scrim' | 'escape' = 'button'): Promise<void> {
  if (method === 'escape') await fireEvent.keyDown(query('.details-close'), { key: 'Escape' });
  else await userEvent.click(query(method === 'scrim' ? '.details-scrim' : '.details-close'));
  await waitFor(() => expect(query('#details-layer')).toHaveAttribute('data-details-state', 'closed'));
}
async function target(kind: 'word' | 'chunk'): Promise<HTMLButtonElement> {
  let button: HTMLButtonElement;
  await waitFor(() => {
    button = query<HTMLButtonElement>(`.details-target-star[data-target-kind="${kind}"]`);
    expect(button).toBeEnabled();
  });
  return button!;
}
async function allParts(): Promise<void> {
  const toggle = query('[data-action="details/toggle-all"]');
  if (toggle.getAttribute('aria-pressed') !== 'true') await userEvent.click(toggle);
  await waitFor(() => expect(query('#details-explanations').children.length).toBeGreaterThan(1));
}
function pointer(element: HTMLElement | Window, type: string, x = 40): void {
  element.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 41, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: 80 }));
}

export const KeyboardFocusAndCloseRestoration: Story = {
  ...scene(),
  play: async () => {
    const { root } = getScenario();
    const origin = await phrase();
    const scroll = query<HTMLElement>('[data-region="textbook-reader"]');
    scroll.scrollTop = 40;
    const originalScroll = scroll.scrollTop;
    await expect(originalScroll).toBeGreaterThan(0);
    await open();
    await ready();
    await expect(query('#app-shell')).toHaveProperty('inert', true);
    const surface = query('.details-surface');
    const closeButton = query('.details-close');
    closeButton.focus();
    await userEvent.tab();
    await expect(surface.contains(document.activeElement)).toBe(true);
    await expect(closeButton).not.toHaveFocus();
    await userEvent.tab({ shift: true });
    await expect(closeButton).toHaveFocus();
    await close('escape');
    await expect(origin.opener).toHaveFocus();
    await expect(scroll.scrollTop).toBe(originalScroll);
    await expect(query('#app-shell')).toHaveProperty('inert', false);
    await open('context'); await ready(); await close('scrim');
    await expect(origin.opener).toHaveFocus();
    await open(); await ready(); await close('button');
    await expect(origin.opener).toHaveFocus();
    await expect(root.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    logScenarioEvent('Keyboard/context opening and all close paths restore focus and scroll');
  },
};

export const ShortTapSpeaksHoldDoesNot: Story = {
  ...scene(),
  play: async () => {
    const { opener, entry } = await phrase();
    await userEvent.click(opener);
    await expect(spoken()).toHaveLength(1);
    await expect(spoken()[0]).toMatchObject({ text: ttsText(entry.card), lang: entry.card.lang });
    await expect(getScenario().app.ui.get('details')).toBeNull();
    // Flush the click's native focus/scroll events before beginning a new hold;
    // scrolling during a hold is intentionally a cancellation path in production.
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    pointer(opener, 'pointerdown');
    await waitFor(() => expect(query('[role="dialog"]')).toBeVisible(), { timeout: 1500 });
    pointer(window, 'pointerup');
    await fireEvent.click(opener);
    await ready();
    await expect(spoken()).toHaveLength(1);
    await userEvent.click(query('[data-action="details/play-audio"]'));
    await expect(spoken()).toHaveLength(2);
    await expect(spoken()[1]).toMatchObject({ text: ttsText(entry.card), lang: entry.card.lang });
    logScenarioEvent('Short tap speaks; 500ms hold and release do not; details audio uses real ttsText');
  },
};

export const MovementScrollAndCancellationPreventHold: Story = {
  ...scene(),
  play: async () => {
    const { opener } = await phrase();
    for (const cancellation of ['movement', 'scroll', 'cancel'] as const) {
      pointer(opener, 'pointerdown');
      if (cancellation === 'movement') pointer(window, 'pointermove', 65);
      else if (cancellation === 'scroll') await fireEvent.scroll(opener.closest('.card-row-wrapper')!);
      else pointer(window, 'pointercancel');
      // Deliberately cross the real 500ms production hold threshold.
      await pause(550);
      pointer(window, 'pointerup');
      await fireEvent.click(opener);
      await expect(getScenario().app.ui.get('details')).toBeNull();
      await expect(spoken()).toHaveLength(0);
    }
    await open(); await ready();
    logScenarioEvent('Movement, scroll and pointercancel cancel hold without stray speech');
  },
};

export const ContextKeyOpensPhraseOnly: Story = {
  ...scene(),
  play: async () => {
    const { app } = getScenario();
    await phrase();
    app.ui.transition('content/jump-chapter', { chapterKey: 'starred' });
    // The real Starred chapter can be empty; use saved membership operations to populate all types.
    const { data } = getScenario();
    const entries = await getCards(data.deck!.id);
    for (const kind of ['word', 'chunk'] as const) {
      const entry = entries.find((candidate) => candidate.card.type === kind)!;
      await toggleCardStar(data.deck!.id, { cardId: entry.cardId });
    }
    app.ui.transition('content/cards-changed', { deckId: data.deck!.id, cards: await getCards(data.deck!.id) });
    for (const kind of ['word', 'chunk'] as const) {
      let row: HTMLElement | undefined;
      await waitFor(() => {
        row = [...getScenario().root.querySelectorAll<HTMLElement>('[data-action="content/open-card"]')].find((element) => app.ui.get('content').cards.find((entry) => entry.key === element.dataset.entryKey)?.card.type === kind);
        expect(row).toBeDefined();
      });
      await fireEvent.contextMenu(row!);
      await fireEvent.keyDown(row!, { key: 'ContextMenu' });
      await expect(app.ui.get('details')).toBeNull();
    }
    app.ui.transition('content/jump-chapter', { chapterKey: `group:${data.groups[0]!.id}` });
    const origin = await phrase();
    await fireEvent.keyDown(origin.opener, { key: 'ContextMenu' });
    await ready();
    logScenarioEvent('ContextMenu opens Phrase only, never Word or Chunk');
  },
};

export const LoadingHttpMalformedAndRetry: Story = {
  ...appStory({ library: 'single', initial: 'textbook', outcomes: { '/phrase-breakdown': 'pending' } }),
  play: async () => {
    const { entry } = await open();
    await expect(query('[data-region="details-source"]')).toHaveTextContent(entry.card.translation);
    await waitFor(() => expect(query('[data-region="details-body"] [role="status"]')).toBeVisible());
    setOutcome('/phrase-breakdown', 'error');
    // Cancel the pending load through the real close path, then issue the HTTP failure.
    await close(); await open();
    await waitFor(() => expect(query('#details-layer')).toHaveAttribute('data-details-view', 'error'));
    await expect(query('[data-region="details-source"]')).toHaveTextContent(entry.card.translation);
    setOutcome('/phrase-breakdown', 'invalid');
    await userEvent.click(within(query('.details-body')).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(query('#details-layer')).toHaveAttribute('data-details-view', 'error'));
    setOutcome('/phrase-breakdown', 'success');
    await userEvent.click(within(query('.details-body')).getByRole('button', { name: 'Retry' }));
    await ready();
    await expect(apiCount()).toBe(4);
    logScenarioEvent('Source survives loading, HTTP and validator failures; Retry recovers');
  },
};

export const SelectionPrimaryTargetsAndDurableStars: Story = {
  ...scene(),
  play: async () => {
    await open(); await ready();
    const { data, app } = getScenario();
    await expect(query('#details-explanations').children).toHaveLength(1);
    await expect(await target('word')).toHaveAttribute('aria-pressed', 'false');
    const parts = getScenario().root.querySelectorAll<HTMLElement>('.details-phrase-part');
    parts[1]!.focus();
    await fireEvent.keyDown(parts[1]!, { key: 'Enter' });
    await expect(query('#details-explanations .details-chunk-target')).toBeVisible();
    await expect(parts[1]).toHaveAttribute('aria-pressed', 'true');
    await allParts();
    await expect(query('[data-action="details/toggle-all"]')).toHaveTextContent('SHOW SELECTED');
    await userEvent.click(query('[data-action="details/toggle-all"]'));
    await expect(query('#details-explanations').children).toHaveLength(1);
    await expect(query('#details-explanations .details-chunk-target')).toBeVisible();
    await allParts();
    await userEvent.click(await target('word'));
    await waitFor(async () => expect(await target('word')).toHaveAttribute('aria-pressed', 'true'));
    await userEvent.click(await target('chunk'));
    await waitFor(async () => expect(await target('chunk')).toHaveAttribute('aria-pressed', 'true'));
    const review = await getReviewCards(data.deck!.id);
    await expect(review.map((entry) => entry.card.type).sort()).toEqual(['chunk', 'word']);
    const savedWord = review.find((entry) => entry.card.type === 'word')!;
    await expect(savedWord.sources.length).toBeGreaterThan(0);
    await expect(savedWord.sources.some((source) => source.ref?.occurrenceId === app.ui.get('details')?.entry.occurrence?.id)).toBe(true);
    const savedChunk = review.find((entry) => entry.card.type === 'chunk')!;
    if (savedChunk.card.type !== 'chunk') throw new Error('Expected persisted Chunk');
    await expect(savedChunk.card.source.snapshot.text).toBe(app.ui.get('details')?.entry.card.text);
    await close();
    await expect(query<HTMLButtonElement>('[data-action="content/review"]')).toBeEnabled();
    await open(); await ready(); await allParts();
    await expect(await target('word')).toHaveAttribute('aria-pressed', 'true');
    await expect(await target('chunk')).toHaveAttribute('aria-pressed', 'true');
    await expect(apiCount()).toBe(1);
    await close();
    await toggleCardStar(data.deck!.id, { cardId: savedWord.cardId });
    await open(); await ready();
    await expect(await target('word')).toHaveAttribute('aria-pressed', 'false');
    await expect(apiCount()).toBe(1);
    logScenarioEvent('Word evidence and Chunk source persisted; cached teaching resolves durable stars on reopen');
  },
};

export const NoDeckCannotSave: Story = {
  ...scene(),
  play: async () => {
    const { opener, entry } = await phrase();
    getScenario().app.ui.transition('details/open', { opener, entry });
    await ready(); await allParts();
    await waitFor(() => expect(query('.details-save-unavailable')).toBeVisible());
    await expect(getScenario().root.querySelectorAll('.details-target-star')).toHaveLength(0);
    await expect(await getReviewCards(getScenario().data.deck!.id)).toHaveLength(0);
    logScenarioEvent('No owning deck: teaching remains readable, save controls are absent');
  },
};

export const RegenerationRetainsTeachingAndSavedEvidence: Story = {
  ...scene(),
  play: async () => {
    await open(); await ready(); await allParts();
    await userEvent.click(await target('chunk'));
    await waitFor(async () => expect(await target('chunk')).toHaveAttribute('aria-pressed', 'true'));
    const deckId = getScenario().data.deck!.id;
    const before = (await getReviewCards(deckId)).find((entry) => entry.card.type === 'chunk')!;
    const teaching = query('#details-explanations').textContent;
    setOutcome('/phrase-breakdown', 'pending');
    await userEvent.click(query('[data-action="details/regenerate"]'));
    await expect(query('[data-action="details/regenerate"]')).toBeDisabled();
    await expect(query('#details-explanations').textContent).toBe(teaching);
    setResponseFactory('/phrase-breakdown', (body) => {
      const request = validateBreakdownRequest(body);
      const response = breakdownResponse(request);
      for (const chunk of response.chunks) {
        chunk.explanation = 'Fresh teaching for this exact source, retained only in the analysis cache.';
        if (chunk.target.kind === 'chunk') chunk.target.card.explanation = chunk.explanation;
      }
      return validateBreakdownResponse(response, request);
    });
    resolvePending('/phrase-breakdown');
    await waitFor(() => expect(query('#details-explanations')).toHaveTextContent('Fresh teaching'));
    await expect((await getReviewCards(deckId)).find((entry) => entry.cardId === before.cardId)?.card).toEqual(before.card);
    setOutcome('/phrase-breakdown', 'error');
    await userEvent.click(query('[data-action="details/regenerate"]'));
    await waitFor(() => expect(query('.details-regenerate-error')).toBeVisible());
    await expect(query('#details-explanations')).toHaveTextContent('Fresh teaching');
    setOutcome('/phrase-breakdown', 'success');
    await userEvent.click(within(query('.details-regenerate-error')).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(query('.details-regenerate-error')).not.toBeVisible());
    await waitFor(() => expect(query('[data-action="details/regenerate"]')).toBeEnabled());
    await expect((await getReviewCards(deckId)).find((entry) => entry.cardId === before.cardId)?.card).toEqual(before.card);
    logScenarioEvent('Regeneration pending/error retains teaching; successful regeneration never overwrites saved Chunk teaching');
  },
};

export const ExactContextCacheHitAndMiss: Story = {
  ...scene(),
  play: async () => {
    await open(); await ready();
    const { app, data } = getScenario();
    const state = app.ui.get('details')!;
    const firstRequest = cardRequest(state.entry, state.deck, state.group);
    await expect(readCache(firstRequest)).not.toBeNull();
    await close(); await open(); await ready();
    await expect(apiCount()).toBe(1);
    await close();
    const origin = await phrase();
    app.ui.transition('details/open', { entry: origin.entry, opener: origin.opener, deck: state.deck,
      group: state.group, readingDisplay: 'romanization', showReadings: false, showEnglish: false });
    await ready();
    await expect(apiCount()).toBe(1);
    await expect(getScenario().root.querySelector('[data-region="details-source"] rt')).toBeNull();
    await expect(getScenario().root.querySelector('[data-region="details-source"] .card-term-english')).toBeNull();
    await close();
    const group = state.group;
    if (!group) throw new Error('Fixture needs an occurrence-scoped group');
    await db.groups.update(group.id, { title: `${group.title} — changed context` });
    app.ui.transition('content/reload-deck');
    await waitFor(() => expect(app.ui.get('content').groups.find((candidate) => candidate.id === group.id)?.title).toContain('changed context'));
    await open(); await ready();
    await expect(apiCount()).toBe(2);
    const current = app.ui.get('details')!;
    const changedRequest = cardRequest(current.entry, current.deck, current.group);
    await expect(changedRequest.source).toEqual(firstRequest.source);
    await expect(changedRequest.context).not.toEqual(firstRequest.context);
    await expect(readCache(firstRequest)).not.toBeNull();
    await expect(readCache(changedRequest)).not.toBeNull();
    await expect(await getReviewCards(data.deck!.id)).toHaveLength(0);
    logScenarioEvent('Exact source/context cache hit; persisted group-context change makes a new validated request');
  },
};

export const ActionAndContentSwitchReleaseFocus: Story = {
  ...scene(),
  parameters: { docs: { description: { story: 'Replaces details with the real JSON action and focuses its Back button. Settings currently consists of non-focusable div rows, so it is not used as a keyboard-focus destination. Then a content chapter switch must also cancel details without deferred focus theft.' } } },
  play: async () => {
    await open(); await ready();
    const { app, data, root } = getScenario();
    app.ui.transition('action/open', { kind: 'json', payload: { title: data.deck!.name, jsonString: toImportJson(app.ui.get('content').cards) } });
    await expect(query('#details-layer')).toHaveAttribute('data-details-state', 'closed');
    await expect(query('#app-shell')).toHaveProperty('inert', false);
    const actionFocus = query<HTMLButtonElement>('.json-pane-back');
    await waitFor(() => expect(actionFocus.closest('.pane-full')).toHaveClass('pane-full--visible'));
    actionFocus.focus();
    await pause(550);
    await expect(actionFocus).toHaveFocus();
    app.ui.transition('action/close');
    await waitFor(() => expect(root.querySelector('.json-pane-back')).toBeNull());
    await open(); await ready();
    app.ui.transition('content/jump-chapter', { chapterKey: 'starred' });
    await expect(query('#details-layer')).toHaveAttribute('data-details-state', 'closed');
    const destination = root.querySelector<HTMLElement>('#content-pane button');
    if (!destination) throw new Error('Content switch needs a focus destination');
    destination.focus();
    await pause(550);
    await expect(destination).toHaveFocus();
    logScenarioEvent('Action/content replacement releases details immediately without deferred focus theft');
  },
};

export const LateResponseCannotReopen: Story = {
  ...appStory({ library: 'single', initial: 'textbook', outcomes: { '/phrase-breakdown': 'pending' }, setup() { allowLateResponse('/phrase-breakdown'); } }),
  play: async () => {
    const origin = await open();
    await waitFor(() => expect(apiCount()).toBe(1));
    await close('escape');
    resolvePending('/phrase-breakdown');
    await waitFor(() => expect(requests.filter((request) => request.endpoint === '/phrase-breakdown').every((request) => request.status !== 'pending')).toBe(true));
    await pause(50);
    await expect(getScenario().app.ui.get('details')).toBeNull();
    await expect(query('#details-layer')).toHaveAttribute('data-details-state', 'closed');
    await expect(origin.opener).toHaveFocus();
    await expect(await getReviewCards(getScenario().data.deck!.id)).toHaveLength(0);
    logScenarioEvent('Deliberately late fixture response cannot reopen or save after dismissal');
  },
};

export const ActualReducedMotionPreference: Story = {
  ...scene(),
  parameters: { docs: { description: { story: 'Uses actual matchMedia(prefers-reduced-motion). Enable Reduce Motion in browser/system accessibility settings (or emulate media in browser acceptance). Details opening and closing settle synchronously only when that preference is active; no production animation CSS is overridden.' } } },
  play: async () => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const origin = await open();
    if (reduced) await expect(query('#details-layer')).toHaveAttribute('data-details-state', 'open');
    await ready();
    await close('escape');
    await expect(origin.opener).toHaveFocus();
    logScenarioEvent('Actual reduced-motion preference', reduced ? 'reduce: production immediate motion path' : 'no-preference: production animated motion path');
  },
};
