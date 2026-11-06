import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { db, getCards, getReviewCards, restoreAllData } from '../../js/db';
import type { LibraryEntry } from '../../js/library-types';
import { appStory, getScenario, logScenarioEvent } from '../support/scenario';
import { fixtureBackup } from '../support/fixtures';
import { speechEvents } from '../support/speech';

const meta = {
  title: 'Interactions/Textbook', tags: ['autodocs'], argTypes: {},
  parameters: { layout: 'fullscreen', docs: { description: { component: 'src/panes/content-pane.ts, content-pane-actions.ts and content-pane-gestures.ts under mountApp. Real membership stars, canonical identity, chapter focus, native shelves and section-local persisted ordering. Plays assert visible outcomes and real DB records, not implementation source strings. Browser pointer acceptance supplements synthetic play for native pointer capture and scrolling.' } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
function element(selector: string): HTMLElement {
  const result = getScenario().root.querySelector<HTMLElement>(selector);
  if (!result) throw new Error(`Missing textbook journey element: ${selector}`);
  return result;
}
async function ready(): Promise<void> {
  await waitFor(() => expect(getScenario().root.querySelector('.textbook-reader')).not.toBeNull());
}
async function click(selector: string): Promise<void> { await userEvent.click(element(selector)); }
const starredRows = () => getScenario().root.querySelectorAll('.textbook-chapter[data-chapter-key="starred"] .card-row-wrapper');

export const MembershipStars: Story = {
  ...appStory({ library: 'multiple', initial: 'textbook' }),
  parameters: { docs: { description: { story: 'Repeated occurrences share one membership star and one Starred row. Another book sharing the canonical Phrase remains independent. Removing the last star disables Review and restores focus inside Starred. Language browsing has no phrasebook star controls.' } } },
  play: async () => {
    await ready();
    const { root, data, app } = getScenario();
    const first = element('.card-star');
    const cardId = first.dataset.cardId!;
    const copies = () => [...root.querySelectorAll<HTMLElement>(`.card-star[data-card-id="${cardId}"]`)];
    await expect(copies().length).toBeGreaterThan(1);
    await userEvent.click(first);
    await waitFor(() => expect(copies().every((button) => button.getAttribute('aria-pressed') === 'true')).toBe(true));
    await expect(starredRows()).toHaveLength(1);
    await expect(await getReviewCards(data.deck!.id)).toHaveLength(1);
    await expect(element('[data-action="content/review"]')).toBeEnabled();
    const other = data.decks.find((deck) => deck.lang === data.deck!.lang && deck.id !== data.deck!.id)!;
    await expect((await db.memberships.get([other.id, cardId]))?.starredAt).toBeNull();
    app.ui.transition('content/select-deck', { id: other.id });
    await waitFor(() => expect(app.ui.get('content').deck?.id).toBe(other.id));
    await expect(element(`.card-star[data-card-id="${cardId}"]`)).toHaveAttribute('aria-pressed', 'false');
    await click(`.card-star[data-card-id="${cardId}"]`);
    await waitFor(async () => expect(await getReviewCards(other.id)).toHaveLength(1));
    app.ui.transition('content/select-deck', { id: data.deck!.id });
    await waitFor(() => expect(app.ui.get('content').deck?.id).toBe(data.deck!.id));
    await click('.textbook-star-link');
    const last = element('.textbook-chapter[data-chapter-key="starred"] .card-star');
    last.focus();
    await userEvent.click(last);
    await waitFor(() => expect(starredRows()).toHaveLength(0));
    await expect(element('[data-action="content/review"]')).toBeDisabled();
    await expect(element('.textbook-chapter[data-chapter-key="starred"]')).toHaveFocus();
    await expect(await getReviewCards(data.deck!.id)).toHaveLength(0);
    await expect(await getReviewCards(other.id)).toHaveLength(1);
    await expect(copies().every((button) => button.getAttribute('aria-pressed') === 'false')).toBe(true);
    app.ui.transition('content/select-deck', { id: `lang:${data.deck!.lang}` });
    await waitFor(() => expect(root.querySelector('[data-region="card-list"]')).not.toBeNull());
    await expect(root.querySelectorAll('.card-star')).toHaveLength(0);
    logScenarioEvent('Shared occurrences, independent books, last unstar and read-only browse completed');
  },
};

export const TextbookNavigationAndShelves: Story = {
  ...appStory({ library: 'single', initial: 'textbook', starred: true, setup: async () => {
    const backup = fixtureBackup({ starred: true });
    const group = backup.groups[0];
    const source = backup.occurrences.find((entry) => entry.groupId === group.id && entry.section === 'thingsToSay')!;
    for (let index = 2; index < 12; index += 1) backup.occurrences.push({ ...source, id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`, position: index });
    await restoreAllData(backup);
  } }),
  globals: { viewport: { value: 'narrow', isRotated: false } },
  parameters: { docs: { description: { story: 'Contents and Starred move reader focus to the correct chapter; shelf Home/End/arrows move only the focused shelf. A short click requests speech without opening details. Use a real browser mouse drag on the first extended shelf to verify drag suppresses its release click; native pointer capture is deliberately not replaced in play.' } } },
  play: async () => {
    await ready();
    const { root, data } = getScenario();
    await click('.textbook-chapter-nav summary');
    const secondKey = `group:${data.groups[1].id}`;
    await click(`.textbook-chapter-links [data-chapter-key="${secondKey}"]`);
    await expect(element(`.textbook-chapter[data-chapter-key="${secondKey}"]`)).toHaveFocus();
    await expect(root.querySelector('.textbook-chapter-nav details')).not.toHaveAttribute('open');
    await click('.textbook-star-link');
    await expect(element('.textbook-chapter[data-chapter-key="starred"]')).toHaveFocus();
    await click('.textbook-chapter-nav summary');
    await click(`.textbook-chapter-links [data-chapter-key="group:${data.groups[0].id}"]`);
    const shelves = [...root.querySelectorAll<HTMLElement>('.textbook-shelf')];
    const first = shelves[0];
    const other = shelves[1];
    const otherLeft = other.scrollLeft;
    first.focus();
    await userEvent.keyboard('{End}');
    await expect(first.scrollLeft).toBeGreaterThan(0);
    await expect(other.scrollLeft).toBe(otherLeft);
    await userEvent.keyboard('{Home}');
    await expect(first.scrollLeft).toBe(0);
    await userEvent.keyboard('{ArrowRight}');
    await expect(first.scrollLeft).toBeGreaterThan(0);
    await userEvent.keyboard('{ArrowLeft}');
    await expect(first.scrollLeft).toBe(0);
    const before = speechEvents.length;
    await userEvent.click(first.querySelector<HTMLElement>('[data-action="content/open-card"]')!);
    await waitFor(() => expect(speechEvents.length).toBeGreaterThan(before));
    await expect(getScenario().app.ui.get('details')).toBeNull();
    logScenarioEvent('Chapter navigation, independent shelves and short click completed');
  },
};

function sectionEntries(entries: LibraryEntry[], groupId: string): LibraryEntry[] {
  return entries.filter((entry) => entry.occurrence?.groupId === groupId && entry.occurrence.section === 'thingsToSay');
}
function rowKeys(region: HTMLElement): string[] {
  return [...region.querySelectorAll<HTMLElement>('.card-row-wrapper')].map((row) => row.dataset.entryKey!);
}
async function reverseFirstSectionWithTouch(): Promise<void> {
  const region = element('.textbook-shelf[data-reorder-region="thingsToSay"]');
  region.scrollIntoView({ block: 'center' });
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const rows = [...region.querySelectorAll<HTMLElement>('.card-row-wrapper')];
  const start = rows[0].getBoundingClientRect();
  const end = rows[1].getBoundingClientRect();
  const handle = element('#reorder-handle');
  const x = handle.getBoundingClientRect().left + 2;
  const dispatch = (type: string, y: number) => {
    const touch = new Touch({ identifier: 1, target: handle, clientX: x, clientY: y });
    handle.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [touch], changedTouches: [touch], targetTouches: type === 'touchend' ? [] : [touch] }));
  };
  dispatch('touchstart', start.top + start.height / 2);
  dispatch('touchmove', end.bottom + start.height);
  dispatch('touchend', end.bottom + start.height);
}

export const ReorderDoneAndCancel: Story = {
  ...appStory({ library: 'single', initial: 'textbook' }),
  globals: { viewport: { value: 'mobile', isRotated: false } },
  parameters: { docs: { description: { story: 'TouchEvent input goes through the production reorder handle and geometry. Done persists the first section order; a second reorder followed by Cancel restores it. Browser acceptance supplements this with native pointer/touch input. No DOM reorder is performed by the story.' } } },
  play: async () => {
    await ready();
    const { data, app } = getScenario();
    const deckId = data.deck!.id;
    const groupId = data.groups[0].id;
    const original = sectionEntries(await getCards(deckId), groupId).map((entry) => entry.key);
    await click('[data-action="content/menu-edit"]');
    await reverseFirstSectionWithTouch();
    await expect(rowKeys(element('.textbook-shelf[data-reorder-region="thingsToSay"]'))).toEqual([...original].reverse());
    await click('[data-action="content/done"]');
    await waitFor(() => expect(app.ui.get('content').editMode).toBe(false));
    await expect(sectionEntries(await getCards(deckId), groupId).map((entry) => entry.key)).toEqual([...original].reverse());
    await click('[data-action="content/menu-edit"]');
    await reverseFirstSectionWithTouch();
    await expect(rowKeys(element('.textbook-shelf[data-reorder-region="thingsToSay"]'))).toEqual(original);
    await click('[data-action="content/cancel-edit"]');
    await expect(rowKeys(element('.textbook-shelf[data-reorder-region="thingsToSay"]'))).toEqual([...original].reverse());
    await expect(sectionEntries(await getCards(deckId), groupId).map((entry) => entry.key)).toEqual([...original].reverse());
    logScenarioEvent('Section-local touch reorder Done persisted; Cancel restored');
  },
};

export const ReorderSectionTurnAndFamilyBoundaries: Story = {
  ...appStory({ library: 'single', initial: 'textbook', setup: async () => {
    const backup = fixtureBackup();
    const group = backup.groups[0];
    const family = { id: '22222222-2222-4222-8222-222222222222', title: 'Another word family', position: 1 };
    group.wordFamilies.push(family);
    const source = backup.topicWords.find((entry) => entry.groupId === group.id)!;
    backup.topicWords.push({ ...source, id: '33333333-3333-4333-8333-333333333333', familyId: family.id, position: 0 });
    await restoreAllData(backup);
  } }),
  parameters: { docs: { description: { story: 'Typed reorder boundary probes while the real edit owner is active. Attempts to move across sections, exchange turns, or Word families leave the visible order and persisted records unchanged. These guard probes supplement, rather than replace, the gesture Done/Cancel journey.' } } },
  play: async () => {
    await ready();
    const { app, data } = getScenario();
    await click('[data-action="content/menu-edit"]');
    const entries = app.ui.get('content').cards;
    const groupId = data.groups[0].id;
    const things = entries.find((entry) => entry.occurrence?.groupId === groupId && entry.occurrence.section === 'thingsToSay')!;
    const conversation = entries.find((entry) => entry.occurrence?.groupId === groupId && entry.occurrence.section === 'exampleConversation')!;
    const turns = entries.filter((entry) => entry.occurrence?.groupId === groupId && entry.occurrence.section === 'likelyExchanges');
    const turnA = turns[0];
    const turnB = turns.find((entry) => entry.occurrence?.turnIndex !== turnA.occurrence?.turnIndex)!;
    const words = entries.filter((entry) => entry.wordPlacement?.groupId === groupId);
    const wordA = words[0];
    const wordB = words.find((entry) => entry.wordPlacement?.familyId !== wordA.wordPlacement?.familyId)!;
    const original = [...app.ui.get('content').editOrder!];
    const visible = [...getScenario().root.querySelectorAll<HTMLElement>('.card-row-wrapper')].map((row) => row.dataset.entryKey);
    for (const [left, right] of [[things, conversation], [turnA, turnB], [wordA, wordB]]) {
      app.ui.transition('content/reorder', { pageOrder: [right.key, left.key] });
      await expect(app.ui.get('content').editOrder).toEqual(original);
      await expect([...getScenario().root.querySelectorAll<HTMLElement>('.card-row-wrapper')].map((row) => row.dataset.entryKey)).toEqual(visible);
    }
    await click('[data-action="content/done"]');
    await waitFor(() => expect(app.ui.get('content').editMode).toBe(false));
    await expect((await getCards(data.deck!.id)).map((entry) => entry.key)).toEqual(original);
    logScenarioEvent('Cross-section, cross-turn and cross-family moves rejected');
  },
};
