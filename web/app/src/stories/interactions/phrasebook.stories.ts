import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fireEvent, userEvent, waitFor } from 'storybook/test';
import { db, getCards, getReviewCards, restoreAllData } from '../../js/db';
import type { Group, LibraryEntry } from '../../js/library-types';
import { entryChapterKey } from '../../js/phrasebook-chapters';
import { appStory, getScenario, logScenarioEvent } from '../support/scenario';
import { FIXTURE_TOPICS, fixtureBackup } from '../support/fixtures';
import { speechEvents } from '../support/speech';
import { activeChapterPage, openChapter, phrasebookLanding, settledChapterSheet } from '../support/phrasebook';

const meta = {
  title: 'Interactions/Phrasebook', tags: ['autodocs'], argTypes: {},
  parameters: { layout: 'fullscreen', docs: { description: { component: 'src/panes/content-pane.ts, content-pane-actions.ts and content-pane-gestures.ts under mountApp. Real membership stars, canonical identity, the chapter sheet (opening from category headers and deck cards, section reveal, Starred tabs, chapter menu, Escape and focus return), the collapsing title, native rows and persisted ordering local to a word family, exchange turn or topic section. Plays assert visible outcomes and real DB records, not implementation source strings. Browser pointer acceptance supplements synthetic play for native pointer capture and scrolling.' } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
function element<T extends HTMLElement = HTMLElement>(selector: string): T {
  const result = getScenario().root.querySelector<T>(selector);
  if (!result) throw new Error(`Missing phrasebook journey element: ${selector}`);
  return result;
}
async function click(selector: string): Promise<void> { await userEvent.click(element(selector)); }
const content = () => getScenario().app.ui.get('content');
/** Topics in stored order; setup may replace the seeded groups, so read them from the content owner. */
const topics = (): Group[] => [...content().groups].sort((left, right) => left.position - right.position);
const selectedTab = () => element('.chapter-tab[aria-selected="true"]').dataset.tab;
const frames = (count: number) => new Promise<void>((resolve) => {
  const step = (left: number): void => { if (left === 0) resolve(); else requestAnimationFrame(() => step(left - 1)); };
  step(count);
});
/** True while an element's top edge lies inside the scrolling page's visible box. */
function revealed(target: Element, page: HTMLElement): boolean {
  const { top } = target.getBoundingClientRect();
  const box = page.getBoundingClientRect();
  return top >= box.top - 1 && top < box.bottom;
}
const CATEGORY_KEYS = ['category:words', 'category:phrases', 'category:exchanges', 'category:conversation'];
const MENU_OPEN = 'chapter-sheet--menu-open';
const COLLAPSED = 'phrasebook--collapsed';
const FLASH = 'chapter-flash';

/** A second word family in every topic: the Words row holds two deck cards per topic and overflows even on wide layouts. */
async function addSecondWordFamilies(): Promise<void> {
  const backup = fixtureBackup({ starred: true });
  backup.groups.forEach((group, index) => {
    const family = { id: `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`, title: 'More drinks', position: 1 };
    group.wordFamilies.push(family);
    const source = backup.topicWords.find((entry) => entry.groupId === group.id)!;
    backup.topicWords.push({ ...source, id: `55555555-5555-4555-8555-${String(index).padStart(12, '0')}`, familyId: family.id, position: 0 });
  });
  await restoreAllData(backup);
}

export const MembershipStars: Story = {
  ...appStory({ library: 'multiple', initial: 'textbook' }),
  parameters: { docs: { description: { story: 'The same Phrase in every topic\'s Key phrases shares one membership star; the Starred card appears on the landing. Another book sharing the canonical Phrase remains independent. Removing the last star inside the Starred pane empties it in place, removes the Starred card, disables Review and keeps focus inside the pane. Language browsing has no phrasebook star controls.' } } },
  play: async () => {
    await openChapter('category:phrases');
    const { root, data, app } = getScenario();
    const first = activeChapterPage().querySelector<HTMLElement>('.card-star')!;
    const cardId = first.dataset.cardId!;
    const copies = () => [...root.querySelectorAll<HTMLElement>(`[data-region="chapter-sheet-body"] .card-star[data-card-id="${cardId}"]`)];
    await expect(copies().length).toBeGreaterThan(1);
    await userEvent.click(first);
    await waitFor(() => expect(copies().every((button) => button.getAttribute('aria-pressed') === 'true')).toBe(true));
    await waitFor(() => expect(root.querySelector('[data-region="starred-card"] .chapter-card--starred')).not.toBeNull());
    await expect(await getReviewCards(data.deck!.id)).toHaveLength(1);
    await expect(element('[data-action="content/review"]')).toBeEnabled();
    const other = data.decks.find((deck) => deck.lang === data.deck!.lang && deck.id !== data.deck!.id)!;
    await expect((await db.memberships.get([other.id, cardId]))?.starredAt).toBeNull();
    app.ui.transition('content/select-deck', { id: other.id });
    await waitFor(() => expect(content().deck?.id).toBe(other.id));
    await expect(root.querySelector('[data-region="starred-card"] .chapter-card--starred')).toBeNull();
    await openChapter('category:phrases');
    await expect(element(`[data-region="chapter-sheet-body"] .card-star[data-card-id="${cardId}"]`)).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(activeChapterPage().querySelector<HTMLElement>(`.card-star[data-card-id="${cardId}"]`)!);
    await waitFor(async () => expect(await getReviewCards(other.id)).toHaveLength(1));
    app.ui.transition('content/select-deck', { id: data.deck!.id });
    await waitFor(() => expect(content().deck?.id).toBe(data.deck!.id));
    await click('[data-region="starred-card"] .deck-card[data-tab="phrases"]');
    const page = await settledChapterSheet();
    await expect(content().chapterKey).toBe('starred');
    await expect(page.querySelectorAll('.starred-item')).toHaveLength(1);
    const last = page.querySelector<HTMLElement>('.card-star')!;
    last.focus();
    await userEvent.click(last);
    await waitFor(() => expect(activeChapterPage().querySelectorAll('.starred-item')).toHaveLength(0));
    await expect(content().chapterKey).toBe('starred');
    await expect(element('.chapter-sheet-back')).toHaveFocus();
    await expect(root.querySelector('[data-region="starred-card"] .chapter-card--starred')).toBeNull();
    await expect(element('[data-action="content/review"]')).toBeDisabled();
    await expect(await getReviewCards(data.deck!.id)).toHaveLength(0);
    await expect(await getReviewCards(other.id)).toHaveLength(1);
    await openChapter('category:phrases');
    await expect(copies().every((button) => button.getAttribute('aria-pressed') === 'false')).toBe(true);
    app.ui.transition('content/select-deck', { id: `lang:${data.deck!.lang}` });
    await waitFor(() => expect(root.querySelector('[data-region="card-list"]')).not.toBeNull());
    await expect(root.querySelectorAll('.card-star')).toHaveLength(0);
    logScenarioEvent('Shared occurrences, independent books, last unstar in Starred and read-only browse completed');
  },
};

export const CategoryNavigation: Story = {
  ...appStory({ library: 'single', initial: 'textbook' }),
  globals: { viewport: { value: 'mobile', isRotated: false } },
  parameters: { docs: { description: { story: 'The landing lists the four categories in order. An exchange deck card opens Exchanges revealed at that exchange and highlights it; Back gets focus and the landing goes inert. The chapter menu lists categories then collections (Starred only while starred), supports arrow/Home/End movement, and switching opens the chosen chapter at its top. Escape closes the menu first, then the sheet, returning focus to the opening card. A category header opens its chapter at the top; pointerdown outside closes the menu. A word-family deck card reveals its family without a highlight.' } } },
  play: async () => {
    const reader = await phrasebookLanding();
    const { root } = getScenario();
    const cards = [...reader.querySelectorAll<HTMLElement>('.chapter-card[data-chapter-kind="category"]')];
    await expect(cards.map((card) => card.dataset.chapterKey)).toEqual(CATEGORY_KEYS);
    const exchangeCards = [...cards[2]!.querySelectorAll<HTMLElement>('.deck-card')];
    await expect(exchangeCards).toHaveLength(FIXTURE_TOPICS.length);
    const opener = exchangeCards.at(-1)!;
    await userEvent.click(opener);
    let page = await settledChapterSheet();
    await expect(content().chapterKey).toBe('category:exchanges');
    await expect(element('[data-region="chapter-sheet-title"]')).toHaveTextContent('Exchanges');
    await expect(element('.chapter-tabs')).toHaveAttribute('data-tab-count', '1');
    const exchange = page.querySelector<HTMLElement>(`[data-exchange-id="${CSS.escape(opener.dataset.focus!.slice('exchange:'.length))}"]`)!;
    await expect(exchange).toHaveClass(FLASH);
    await expect(exchange.querySelector('.chapter-group-context')).toHaveTextContent(FIXTURE_TOPICS[2]);
    await expect(revealed(exchange, page)).toBe(true);
    await expect(page.querySelectorAll(`.${FLASH}`)).toHaveLength(1);
    await expect(element('.chapter-sheet-back')).toHaveFocus();
    await expect(reader).toHaveProperty('inert', true);

    const sheet = element('[data-region="chapter-sheet"]');
    const toggle = element('.chapter-sheet-switch');
    await userEvent.click(toggle);
    await expect(sheet).toHaveClass(MENU_OPEN);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const items = [...root.querySelectorAll<HTMLElement>('.chapter-menu-item')];
    await expect(items.map((item) => item.dataset.chapterKey)).toEqual([...CATEGORY_KEYS, 'translations', 'words', 'chunks']);
    await expect(element('.chapter-menu-item[aria-checked="true"]').dataset.chapterKey).toBe('category:exchanges');
    await expect(items[2]).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(items[3]).toHaveFocus();
    await userEvent.keyboard('{End}');
    await expect(items.at(-1)).toHaveFocus();
    await userEvent.keyboard('{Home}');
    await expect(items[0]).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    await expect(items.at(-1)).toHaveFocus();
    await userEvent.click(items[0]!);
    await waitFor(() => expect(content().chapterKey).toBe('category:words'));
    page = activeChapterPage();
    await expect(element('[data-region="chapter-sheet-title"]')).toHaveTextContent('Words');
    await expect(page.querySelectorAll('[data-family-id]')).toHaveLength(FIXTURE_TOPICS.length);
    await expect(page.scrollTop).toBe(0);
    await expect(sheet).not.toHaveClass(MENU_OPEN);
    await expect(toggle).toHaveFocus();

    await userEvent.click(toggle);
    await expect(sheet).toHaveClass(MENU_OPEN);
    await userEvent.keyboard('{Escape}');
    await expect(sheet).not.toHaveClass(MENU_OPEN);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveFocus();
    await expect(content().chapterKey).toBe('category:words');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(content().chapterKey).toBeNull());
    await expect(element('#content-pane')).not.toHaveAttribute('data-chapter-open');
    await expect(reader).toHaveProperty('inert', false);
    await expect(opener).toHaveFocus();

    const header = cards[1]!.querySelector<HTMLElement>('.chapter-card-header')!;
    await userEvent.click(header);
    page = await settledChapterSheet();
    await expect(content().chapterKey).toBe('category:phrases');
    await expect(page.scrollTop).toBe(0);
    await expect(page.querySelectorAll(`.${FLASH}`)).toHaveLength(0);
    await userEvent.click(toggle);
    await expect(sheet).toHaveClass(MENU_OPEN);
    await fireEvent.pointerDown(page);
    await expect(sheet).not.toHaveClass(MENU_OPEN);
    await expect(content().chapterKey).toBe('category:phrases');
    await click('.chapter-sheet-back');
    await waitFor(() => expect(content().chapterKey).toBeNull());
    await expect(header).toHaveFocus();

    const familyCard = [...cards[0]!.querySelectorAll<HTMLElement>('.deck-card')].at(-1)!;
    await userEvent.click(familyCard);
    page = await settledChapterSheet();
    await expect(content().chapterKey).toBe('category:words');
    const family = page.querySelector<HTMLElement>(`[data-family-id="${CSS.escape(familyCard.dataset.focus!.slice('family:'.length))}"]`)!;
    await expect(family.querySelector('.chapter-group-context')).toHaveTextContent(FIXTURE_TOPICS[2]);
    await expect(revealed(family, page)).toBe(true);
    await expect(family).not.toHaveClass(FLASH);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(content().chapterKey).toBeNull());
    await expect(familyCard).toHaveFocus();
    logScenarioEvent('Deck card reveal, menu switch, Escape order, header open and focus return completed');
  },
};

export const HeaderCollapse: Story = {
  ...appStory({ library: 'single', initial: 'textbook' }),
  globals: { viewport: { value: 'mobile', isRotated: false } },
  parameters: { docs: { description: { story: 'Scrolling the landing past 150px swaps the title bubble for the slim title bar; it expands again only below 110px, so scrolling within that band never flickers.' } } },
  play: async () => {
    const reader = await phrasebookLanding();
    const body = element('[data-region="content-body"]');
    const settle = async (top: number) => { reader.scrollTop = top; await frames(3); };
    await expect(reader.scrollHeight - reader.clientHeight).toBeGreaterThan(200);
    await settle(140);
    await expect(body).not.toHaveClass(COLLAPSED);
    reader.scrollTop = 170;
    await waitFor(() => expect(body).toHaveClass(COLLAPSED));
    await settle(120);
    await expect(body).toHaveClass(COLLAPSED);
    reader.scrollTop = 90;
    await waitFor(() => expect(body).not.toHaveClass(COLLAPSED));
    await settle(140);
    await expect(body).not.toHaveClass(COLLAPSED);
    logScenarioEvent('Title collapses past 150px and expands below 110px');
  },
};

export const StarredTabsAndRows: Story = {
  ...appStory({ library: 'single', initial: 'textbook', setup: addSecondWordFamilies }),
  globals: { viewport: { value: 'narrow', isRotated: false } },
  parameters: { docs: { description: { story: 'Landing row Home/End/arrows scroll only the focused row (Words, two families per topic). Category chapters hide the tab bar; Starred keeps Words and Phrases tabs whose arrows/Home/End select and wrap, a tab click selects, and swiping the pager settles on its page\'s tab. A short row click requests speech without opening details. "In context ›" opens the entry\'s category and highlights its row; returning to Starred keeps its tab; Back returns focus to the Starred header. Use a real browser mouse drag on the Words row to verify drag suppresses its release click; native pointer capture is deliberately not replaced in play.' } } },
  play: async () => {
    const reader = await phrasebookLanding();
    const row = (category: string) => element(`.chapter-card[data-category="${category}"] .chapter-row`);
    const [first, other] = [row('words'), row('phrases')];
    await expect(first.querySelectorAll('.deck-card')).toHaveLength(FIXTURE_TOPICS.length * 2);
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

    const header = reader.querySelector<HTMLElement>('.chapter-card--starred .chapter-card-header')!;
    await userEvent.click(header);
    await settledChapterSheet();
    await expect(content().chapterKey).toBe('starred');
    await expect(element('.chapter-tabs')).toHaveAttribute('data-tab-count', '2');
    await expect(selectedTab()).toBe('words');
    element('.chapter-tab[data-tab="words"]').focus();
    const pager = element('[data-region="chapter-pager"]');
    const shownPage = () => [...pager.querySelectorAll<HTMLElement>('.chapter-page')][Math.round(pager.scrollLeft / pager.clientWidth)]?.dataset.tab;
    for (const [key, tab] of [['{ArrowRight}', 'phrases'], ['{Home}', 'words'], ['{End}', 'phrases'], ['{ArrowRight}', 'words'], ['{ArrowLeft}', 'phrases']] as const) {
      await userEvent.keyboard(key);
      await expect(selectedTab(), `tab after ${key}`).toBe(tab);
      await expect(element(`.chapter-tab[data-tab="${tab}"]`)).toHaveFocus();
      await expect(activeChapterPage().dataset.tab).toBe(tab);
      // The pager follows the selected tab before the reader presses the next key.
      await waitFor(() => expect(shownPage()).toBe(tab));
    }
    await click('.chapter-tab[data-tab="words"]');
    await expect(content().starredTab).toBe('words');
    await waitFor(() => expect(shownPage()).toBe('words'));
    pager.scrollLeft = pager.clientWidth;
    await waitFor(() => expect(content().starredTab).toBe('phrases'));
    await expect(selectedTab(), 'tab after swipe').toBe('phrases');
    await waitFor(() => expect(shownPage()).toBe('phrases'));
    const before = speechEvents.length;
    await userEvent.click(activeChapterPage().querySelector<HTMLElement>('[data-action="content/open-card"]')!);
    await waitFor(() => expect(speechEvents.length).toBeGreaterThan(before));
    await expect(getScenario().app.ui.get('details')).toBeNull();

    const placed = [...activeChapterPage().querySelectorAll<HTMLElement>('.starred-in-context')]
      .map((button) => ({ button, entry: content().cards.find((candidate) => candidate.key === button.dataset.entryKey)! }))
      .find(({ entry }) => entry.occurrence?.groupId !== undefined)!;
    const entryKey = placed.entry.key;
    const chapterKey = entryChapterKey(placed.entry);
    await expect(CATEGORY_KEYS).toContain(chapterKey);
    await userEvent.click(placed.button);
    await waitFor(() => expect(content().chapterKey).toBe(chapterKey));
    await expect(element('.chapter-tabs')).toHaveAttribute('data-tab-count', '1');
    const target = activeChapterPage().querySelector<HTMLElement>(`.card-row-wrapper[data-entry-key="${CSS.escape(entryKey)}"]`)!;
    await expect(target).toHaveClass(FLASH);
    await expect(revealed(target, activeChapterPage())).toBe(true);
    await click('.chapter-sheet-switch');
    await click('.chapter-menu-item[data-chapter-key="starred"]');
    await waitFor(() => expect(content().chapterKey).toBe('starred'));
    await expect(selectedTab(), 'remembered Starred tab').toBe('phrases');
    await click('.chapter-sheet-back');
    await waitFor(() => expect(content().chapterKey).toBeNull());
    await expect(header).toHaveFocus();
    logScenarioEvent('Independent rows, Starred tab keyboard/click/swipe, short click and In context completed');
  },
};

function sectionEntries(entries: LibraryEntry[], groupId: string): LibraryEntry[] {
  return entries.filter((entry) => entry.occurrence?.groupId === groupId && entry.occurrence.section === 'thingsToSay');
}
function rowKeys(region: HTMLElement): string[] {
  return [...region.querySelectorAll<HTMLElement>('.card-row-wrapper')].map((row) => row.dataset.entryKey!);
}
const phrasesRegion = (groupId: string) => activeChapterPage().querySelector<HTMLElement>(`[data-reorder-region="thingsToSay:${CSS.escape(groupId)}"]`)!;
async function reversePhrasesWithTouch(groupId: string): Promise<void> {
  const rows = [...phrasesRegion(groupId).querySelectorAll<HTMLElement>('.card-row-wrapper')];
  const start = rows[0]!.getBoundingClientRect();
  const end = rows[1]!.getBoundingClientRect();
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
  parameters: { docs: { description: { story: 'TouchEvent input goes through the production reorder handle and geometry inside the open Key phrases chapter. Done persists the first topic\'s phrase order and leaves the other topics untouched; a second reorder followed by Cancel restores it; a third followed by Back closes the chapter, leaves edit mode and saves nothing. Browser acceptance supplements this with native pointer/touch input. No DOM reorder is performed by the story.' } } },
  play: async () => {
    await openChapter('category:phrases');
    const { data, app } = getScenario();
    const deckId = data.deck!.id;
    const [groupId, ...otherIds] = topics().map((group) => group.id);
    const sections = async (ids: readonly string[]) => { const entries = await getCards(deckId); return ids.map((id) => sectionEntries(entries, id).map((entry) => entry.key)); };
    const original = (await sections([groupId!]))[0]!;
    const others = await sections(otherIds);
    const reversed = [...original].reverse();
    await click('.chapter-sheet-edit');
    await reversePhrasesWithTouch(groupId!);
    await expect(rowKeys(phrasesRegion(groupId!))).toEqual(reversed);
    await click('.chapter-sheet-done');
    await waitFor(() => expect(app.ui.get('content').editMode).toBe(false));
    await expect(await sections([groupId!, ...otherIds])).toEqual([reversed, ...others]);
    await click('.chapter-sheet-edit');
    await reversePhrasesWithTouch(groupId!);
    await expect(rowKeys(phrasesRegion(groupId!))).toEqual(original);
    await click('.chapter-sheet-cancel');
    await expect(rowKeys(phrasesRegion(groupId!))).toEqual(reversed);
    await expect((await sections([groupId!]))[0]).toEqual(reversed);
    await click('.chapter-sheet-edit');
    await reversePhrasesWithTouch(groupId!);
    await expect(rowKeys(phrasesRegion(groupId!))).toEqual(original);
    await click('.chapter-sheet-back');
    await waitFor(() => expect(content().chapterKey).toBeNull());
    await expect(content().editMode).toBe(false);
    await expect((await sections([groupId!]))[0]).toEqual(reversed);
    await openChapter('category:phrases');
    await expect(rowKeys(phrasesRegion(groupId!))).toEqual(reversed);
    logScenarioEvent('Topic-local touch reorder Done persisted; Cancel restored; Back discarded');
  },
};

export const ReorderBoundaries: Story = {
  ...appStory({ library: 'single', initial: 'textbook', setup: async () => {
    const backup = fixtureBackup();
    const group = backup.groups[0]!;
    const family = { id: '22222222-2222-4222-8222-222222222222', title: 'Another word family', position: 1 };
    group.wordFamilies.push(family);
    const source = backup.topicWords.find((entry) => entry.groupId === group.id)!;
    backup.topicWords.push({ ...source, id: '33333333-3333-4333-8333-333333333333', familyId: family.id, position: 0 });
    await restoreAllData(backup);
  } }),
  parameters: { docs: { description: { story: 'Typed reorder boundary probes while the real edit owner is active in an open category. Attempts to move across sections, exchange turns or word families of one topic, or across topics within the same section, exchange turn or same-titled word family, leave the visible order and persisted records unchanged. Starred cannot enter edit mode. These guard probes supplement, rather than replace, the gesture Done/Cancel journey.' } } },
  play: async () => {
    await openChapter('category:words');
    const { app } = getScenario();
    await click('.chapter-sheet-edit');
    await expect(app.ui.get('content').editMode).toBe(true);
    const entries = app.ui.get('content').cards;
    const [groupId, otherId] = topics().map((group) => group.id);
    const occurrence = (id: string, section: string, turnIndex?: number) => entries.find((entry) => entry.occurrence?.groupId === id
      && entry.occurrence.section === section && (turnIndex === undefined || entry.occurrence.turnIndex === turnIndex))!;
    const word = (id: string, familyIndex: number) => {
      const families = [...topics().find((group) => group.id === id)!.wordFamilies].sort((left, right) => left.position - right.position);
      return entries.find((entry) => entry.wordPlacement?.groupId === id && entry.wordPlacement.familyId === families[familyIndex]!.id)!;
    };
    const probes: [string, LibraryEntry, LibraryEntry][] = [
      ['section', occurrence(groupId!, 'thingsToSay'), occurrence(groupId!, 'exampleConversation')],
      ['exchange turn', occurrence(groupId!, 'likelyExchanges', 0), occurrence(groupId!, 'likelyExchanges', 1)],
      ['word family', word(groupId!, 0), word(groupId!, 1)],
      ['topic (Key phrases)', occurrence(groupId!, 'thingsToSay'), occurrence(otherId!, 'thingsToSay')],
      ['topic (exchange turn)', occurrence(groupId!, 'likelyExchanges', 0), occurrence(otherId!, 'likelyExchanges', 0)],
      ['topic (same-titled family)', word(groupId!, 0), word(otherId!, 0)],
    ];
    const original = [...app.ui.get('content').editOrder!];
    const visibleRows = () => [...element('[data-region="chapter-sheet-body"]').querySelectorAll<HTMLElement>('.card-row-wrapper')].map((row) => row.dataset.entryKey);
    const visible = visibleRows();
    for (const [boundary, left, right] of probes) {
      await expect(left, boundary).toBeDefined();
      await expect(right, boundary).toBeDefined();
      app.ui.transition('content/reorder', { pageOrder: [right.key, left.key] });
      await expect(app.ui.get('content').editOrder, boundary).toEqual(original);
      await expect(visibleRows(), boundary).toEqual(visible);
    }
    await click('.chapter-sheet-done');
    await waitFor(() => expect(app.ui.get('content').editMode).toBe(false));
    await expect((await getCards(getScenario().data.deck!.id)).map((entry) => entry.key)).toEqual(original);
    await openChapter('starred');
    app.ui.transition('content/enter-edit');
    await expect(app.ui.get('content').editMode).toBe(false);
    logScenarioEvent('Cross-section, cross-turn, cross-family and cross-topic moves rejected; Starred cannot be reordered');
  },
};
