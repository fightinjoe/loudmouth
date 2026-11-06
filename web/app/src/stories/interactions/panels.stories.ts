import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fireEvent, userEvent, waitFor } from 'storybook/test';
import { cardIdentity } from '@catchphrase/card-schema';
import { db, getReviewCards, updateDeckOrder, applyCardOrder } from '../../js/db';
import type { LibraryEntry } from '../../js/library-types';
import { fixtureSuggestion } from '../support/fixtures';
import { appStory, getScenario, logScenarioEvent, replaceScenarioProperty } from '../support/scenario';
import { speechEvents, ttsText } from '../support/speech';

const meta = {
  title: 'Interactions/Panels', tags: ['autodocs'], argTypes: {},
  parameters: { docs: { description: { component: 'Executable production-controller journeys using src/panes/action-pane.ts, content-pane.ts, components/review-panel.ts, deck-settings.ts, json-panel.ts and new-phrasebook-panel.ts. Persistence is real sandbox Dexie, speech is recorded, browser dialog/clipboard descriptors are restored at teardown. Touch dispatch exercises controller thresholds; physical touch scrolling is supplemented by browser acceptance. Known limitations remain: suggested language does not translate the static preview, settings failures have no inline UI, and action sheets do not implement details-style Escape/focus trapping.' } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
function element<T extends HTMLElement = HTMLElement>(selector: string): T {
  const found = getScenario().root.querySelector<T>(selector);
  if (!found) throw new Error(`Missing production control: ${selector}`);
  return found;
}
async function click(selector: string): Promise<void> {
  await waitFor(() => {
    const control = element(selector);
    expect(control).toBeVisible();
    expect(getComputedStyle(control).pointerEvents).not.toBe('none');
  });
  await userEvent.click(element(selector));
}
async function ready(selector: string): Promise<void> {
  await waitFor(() => expect(getScenario().root.querySelector(selector)).not.toBeNull());
}
function swipe(direction: 'next' | 'previous'): void {
  const target = element('.review-card-wrap');
  const x = direction === 'next' ? 0 : 240;
  for (const [type, clientX] of [['touchstart', 120], ['touchmove', x], ['touchend', x]] as const) {
    const point = { clientX, clientY: 300 };
    const touches = Object.assign([point], { item: () => point });
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { touches: { value: touches }, changedTouches: { value: touches } });
    target.dispatchEvent(event);
  }
}
function expectHidden(): void { expect(element('.review-card-wrap')).toHaveAttribute('data-revealed', 'false'); }
async function assertCurrentSpeech(entry: LibraryEntry): Promise<void> {
  await click('[data-action="review/play"]');
  const event = speechEvents.filter((item) => item.kind === 'speak').at(-1);
  expect(event?.text).toBe(entry.card.type === 'chunk' ? entry.card.source.snapshot.text : ttsText(entry.card));
  expect(event?.lang).toBe(entry.card.lang);
}

export const Review: Story = {
  ...appStory({ initial: 'textbook', starred: true }),
  play: async () => {
    const { data, root } = getScenario();
    const entries = await getReviewCards(data.deck!.id);
    expect(new Set(entries.map((entry) => entry.cardId)).size).toBe(entries.length);
    await ready('[data-action="content/review"]');
    await click('[data-action="content/review"]');
    await ready('.review-card-wrap');
    await assertCurrentSpeech(entries[0]);
    swipe('previous');
    await assertCurrentSpeech(entries[0]);
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      expectHidden();
      if (entry.card.type === 'chunk') {
        const mark = element('[data-region="review-chunk-context"] mark');
        expect(mark.textContent).toBe('____');
        expect(mark.querySelector('rt')).toBeNull();
      }
      fireEvent.mouseDown(element('.review-answer-skeleton'));
      expect(element('.review-card-wrap')).toHaveAttribute('data-revealed', 'true');
      fireEvent.mouseUp(document);
      expectHidden();
      await click('[data-action="review/toggle-reveal"]');
      expect(element('.review-card-wrap')).toHaveAttribute('data-revealed', 'true');
      if (entry.card.type === 'word' && entry.sources.length) {
        await click('.review-source-examples summary');
        expect(element('.review-source-examples')).toHaveAttribute('open');
        expect(element('.review-source-example-list').textContent).toContain(entry.sources[0].snapshot.translation);
      }
      if (entry.card.type === 'chunk') {
        expect(element('[data-region="review-chunk-context"] mark').textContent).not.toBe('____');
        expect(element('.review-chunk-teaching').textContent).toContain(entry.card.explanation);
      }
      await assertCurrentSpeech(entry);
      await click('[data-action="review/toggle-direction"]');
      expectHidden();
      expect(element('.review-direction-lang').textContent).not.toBe('English');
      await assertCurrentSpeech(entry);
      await click('[data-action="review/toggle-reveal"]');
      await click('[data-action="review/toggle-direction"]');
      expectHidden();
      expect(element('.review-direction-lang').textContent).toBe('English');
      // Advance while revealed: the next entry must reset rather than inherit the answer.
      await click('[data-action="review/toggle-reveal"]');
      swipe('next');
      if (index < entries.length - 1) expectHidden();
    }
    await assertCurrentSpeech(entries[entries.length - 1]);
    swipe('next');
    await assertCurrentSpeech(entries[entries.length - 1]);
    swipe('previous');
    await assertCurrentSpeech(entries[entries.length - 2]);
    expectHidden();
    await click('[data-action="review/close"]');
    await waitFor(() => expect(root.querySelector('.review-panel')).toBeNull());
    await click('[data-action="content/review"]');
    await ready('.review-card-wrap');
    expectHidden();
    await assertCurrentSpeech(entries[0]);
    logScenarioEvent('Review passed', 'Unique starred query, peek/release, evidence, Chunk masking, both directions, speech, finite boundaries and reopen reset');
  },
};

export const ReviewSavedReverseAndRandom: Story = {
  ...appStory({ initial: 'textbook', starred: true }),
  play: async () => {
    const { data, app, root } = getScenario();
    for (const order of ['reverse', 'random'] as const) {
      await updateDeckOrder(data.deck!.id, order);
      const deck = (await db.decks.get(data.deck!.id))!;
      const entries = await getReviewCards(deck.id);
      for (let session = 0; session < 2; session += 1) {
        let ordered: LibraryEntry[];
        const original = Math.random;
        try {
          if (order === 'random') Math.random = () => 0.25;
          ordered = applyCardOrder(entries, order);
          app.ui.transition('action/open', { kind: 'review', payload: { deck, cards: entries } });
        } finally { Math.random = original; }
        await ready('.review-card-wrap');
        expectHidden();
        for (const entry of ordered) {
          await assertCurrentSpeech(entry);
          swipe('next');
        }
        await assertCurrentSpeech(ordered[ordered.length - 1]);
        await click('[data-action="review/toggle-direction"]');
        await click('[data-action="review/toggle-reveal"]');
        await click('[data-action="review/close"]');
        await waitFor(() => expect(root.querySelector('.review-panel')).toBeNull());
      }
    }
    // Leave a fresh session available for manual inspection.
    const deck = (await db.decks.get(data.deck!.id))!;
    const cards = await getReviewCards(deck.id);
    const original = Math.random;
    try {
      Math.random = () => 0.25;
      app.ui.transition('action/open', { kind: 'review', payload: { deck, cards } });
    } finally { Math.random = original; }
    logScenarioEvent('Saved Review order passed', 'Reverse/random applied exactly once; random controlled only during construction; reopening resets');
  },
};

export const SettingsAndJson: Story = {
  ...appStory({ initial: 'textbook', starred: true }),
  play: async () => {
    const { data, root } = getScenario();
    const id = data.deck!.id;
    let promptResult: string | null = null;
    let confirmResult = false;
    let clipboardResult: 'success' | 'error' = 'success';
    let copied = '';
    replaceScenarioProperty(window, 'prompt', { value: () => promptResult });
    replaceScenarioProperty(window, 'confirm', { value: () => confirmResult });
    replaceScenarioProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => {
      if (clipboardResult === 'error') throw new Error('Fixture clipboard rejection');
      copied = text; logScenarioEvent('Clipboard write', `${text.length} characters`);
    } } });
    await click('.textbook-book-tools [data-action="content/menu-settings"]');
    await ready('#ds-name-row');
    for (const answer of [null, '   ']) {
      promptResult = answer;
      await click('#ds-name-row');
      expect((await db.decks.get(id))!.name).toBe(data.deck!.name);
    }
    promptResult = '  Café with friends  ';
    await click('#ds-name-row');
    await waitFor(async () => expect((await db.decks.get(id))!.name).toBe('Café with friends'));
    for (const mode of ['review', 'reverse', 'study']) {
      await click('#ds-mode-row');
      await waitFor(async () => expect((await db.decks.get(id))!.mode).toBe(mode));
    }
    for (const order of ['random', 'reverse', 'default']) {
      await click('#ds-order-row');
      await waitFor(async () => expect((await db.decks.get(id))!.order).toBe(order));
    }
    for (const readingDisplay of ['romanization', 'reading']) {
      await click('#ds-reading-display-row');
      await waitFor(async () => expect((await db.decks.get(id))!.readingDisplay).toBe(readingDisplay));
    }
    await click('#ds-delete-row');
    expect(await db.decks.get(id)).toBeDefined();
    await click('#ds-export-row');
    await ready('.json-pane-textarea');
    await waitFor(() => expect(root.querySelector('.deck-settings-panel')).toBeNull());
    const exported = element<HTMLTextAreaElement>('.json-pane-textarea').value;
    const payload = JSON.parse(exported);
    expect(payload.schemaVersion).toBe(2);
    expect(new Set(payload.cards.map((candidate: { card: LibraryEntry['card'] }) => cardIdentity(candidate.card))).size).toBe(payload.cards.length);
    expect(payload.cards.some((candidate: { sources?: unknown[] }) => (candidate.sources?.length ?? 0) > 0)).toBe(true);
    for (const candidate of payload.cards) {
      expect(candidate).not.toHaveProperty('membership');
      expect(candidate).not.toHaveProperty('starredAt');
      expect(candidate).not.toHaveProperty('deckId');
    }
    await click('#btn-copy-json');
    await waitFor(() => expect(element('#btn-copy-json')).toHaveTextContent('Copied!'));
    expect(copied).toBe(exported);
    await waitFor(() => expect(element('#btn-copy-json').textContent).toBe('Copy'), { timeout: 2200 });
    clipboardResult = 'error';
    await click('#btn-copy-json');
    await waitFor(() => expect(element('#btn-copy-json')).toHaveTextContent('Copy failed'));
    let legacyCopies = 0;
    replaceScenarioProperty(navigator, 'clipboard', { value: undefined });
    replaceScenarioProperty(document, 'execCommand', { value: (command: string) => {
      expect(command).toBe('copy'); legacyCopies += 1; return true;
    } });
    await click('#btn-copy-json');
    await waitFor(() => expect(element('#btn-copy-json')).toHaveTextContent('Copied!'));
    expect(legacyCopies).toBe(1);
    expect(element('.json-pane-textarea')).toHaveAttribute('readonly');
    await click('.json-pane-back');
    await waitFor(() => expect(root.querySelector('.json-panel')).toBeNull());
    await click('.textbook-book-tools [data-action="content/menu-settings"]');
    await ready('#ds-delete-row');
    confirmResult = true;
    await click('#ds-delete-row');
    await waitFor(async () => expect(await db.decks.get(id)).toBeUndefined());
    expect(await db.cards.count()).toBeGreaterThan(0);
    logScenarioEvent('Settings and JSON passed', 'Trimmed rename, cancel/blank, persisted cycles, deduplicated export with evidence, copy/reset/rejection/fallback, Back and confirmed delete');
  },
};

export const SuggestedPreview: Story = {
  ...appStory({ library: 'empty', mount(_root, _data, app) {
    app.ui.transition('action/open', { kind: 'new-phrasebook', payload: { suggestion: fixtureSuggestion() } });
  } }),
  play: async () => {
    const { root } = getScenario();
    await ready('[data-action="new-phrasebook/create"]');
    await userEvent.selectOptions(element('[data-action="new-phrasebook/lang"]'), 'es');
    await userEvent.selectOptions(element('[data-action="new-phrasebook/ability"]'), 'conversational');
    await userEvent.dblClick(element('[data-action="new-phrasebook/create"]'));
    await ready('[data-action="content/save-preview"]');
    await waitFor(() => expect(root.querySelector('.new-phrasebook-panel')).toBeNull());
    expect(await db.decks.count()).toBe(0);
    expect(root.querySelector('[data-action="content/review"]')).toBeNull();
    expect(root.querySelector('[data-action="content/star-card"]')).toBeNull();
    const preview = getScenario().app.ui.get('content').deck;
    expect(preview?.lang).toBe('ja');
    logScenarioEvent('Existing suggestion limitation', 'Spanish confirmation still shows the static Japanese preview');
    await userEvent.dblClick(element('[data-action="content/save-preview"]'));
    await waitFor(async () => expect(await db.decks.count()).toBe(1));
    await waitFor(() => expect(root.querySelector('[data-action="content/save-preview"]')).toBeNull());
    const memberships = await db.memberships.toArray();
    expect(memberships.length).toBeGreaterThan(0);
    expect(memberships.every((membership) => membership.starredAt === null)).toBe(true);
    await waitFor(() => expect(element('[data-action="content/review"]')).toBeDisabled());
    logScenarioEvent('Suggested preview passed', 'Read-only before Save; double confirmation/save commits once with unstarred cards');
  },
};
export const SuggestedDismissalSavesNothing: Story = {
  ...appStory({ library: 'empty', mount(_root, _data, app) {
    app.ui.transition('action/open', { kind: 'new-phrasebook', payload: { suggestion: fixtureSuggestion() } });
  } }), play: async () => {
    const { root } = getScenario();
    await click('.new-phrasebook-scrim');
    await waitFor(() => expect(root.querySelector('.new-phrasebook-panel')).toBeNull());
    expect(await db.decks.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
    logScenarioEvent('Dismissed suggestion without saving');
  },
};
