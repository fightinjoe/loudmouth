import type { Meta, StoryObj } from '@storybook/html-vite';
import { userEvent } from 'storybook/test';
import { db, getCards, updateDeckEntryOrder } from '../../js/db';
import type { CategoryKey, StarredTab } from '../../js/phrasebook-chapters';
import { appStory, getScenario, type ScenarioOptions } from '../support/scenario';
import { openChapter, phrasebookLanding, settledChapterSheet } from '../support/phrasebook';

const meta = {
  title: 'Compositions/Phrasebook', tags: ['autodocs'], argTypes: {},
  parameters: { layout: 'fullscreen', docs: { description: { component: 'src/panes/content-pane.ts and content-pane-render.ts: renderDeckBody under the real content owner, composing src/components/phrasebook-title.ts, chapter-card.ts and chapter-sheet.ts. Three topics, each with Words (one family), Key phrases, an Exchange with alternative responses and a Conversation, organized into four category chapters, then supplemental Translations/Words/Chunks collections and Starred. Stories open chapters by clicking the landing controls or through the production content/open-chapter transition; stars, speech, the chapter menu and reordering remain live against isolated IndexedDB.' } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const scene = (options: ScenarioOptions, description: string): Story => ({
  ...appStory({ initial: 'textbook', library: 'single', ...options }),
  parameters: { docs: { description: { story: description } } },
});
const open = (chapterKey: string, tab?: StarredTab): Story['play'] => async () => { await openChapter(chapterKey, tab); };
/** Clicks a category card's header or its last deck card, as a reader would. */
const openFrom = (category: CategoryKey, control: 'header' | 'last deck card'): Story['play'] => async () => {
  const reader = await phrasebookLanding();
  const card = reader.querySelector<HTMLElement>(`.chapter-card[data-category="${category}"]`)!;
  await userEvent.click(control === 'header' ? card.querySelector<HTMLElement>('.chapter-card-header')! : [...card.querySelectorAll<HTMLElement>('.deck-card')].at(-1)!);
  await settledChapterSheet();
};

export const Landing = scene({}, 'Landing: collapsing title bubble over the cover, then one card per category (Words, Key phrases, Exchanges, Conversation) whose snapping rows hold a deck card per word family, topic or exchange, then the Translations/Words/Chunks collections. Nothing is starred, so no Starred card leads the list and Review is disabled.');
export const StarredLanding = scene({ starred: true }, 'Every membership starred: the Starred card leads the categories, grouping starred Words by family and phrases/chunks under Phrases. Review is enabled.');
export const OpenWords: Story = { ...scene({}, 'Words header opened: every topic\'s word families at the top of one page, each pinned family heading with its topic beneath.'), play: openFrom('words', 'header') };
export const OpenKeyPhrases: Story = { ...scene({}, 'Key phrases header opened: one section per topic with its Things to say.'), play: openFrom('phrases', 'header') };
export const OpenExchanges: Story = { ...scene({}, 'Exchanges header opened: one section per exchange with its topic beneath; alternatives stay inside their speaker turn, with the production "or" separator.'), play: openFrom('exchanges', 'header') };
export const OpenConversation: Story = { ...scene({}, 'Conversation header opened: one section per topic with speaker-aligned lines.'), play: openFrom('conversation', 'header') };
export const WordsFromDeckCard: Story = { ...scene({}, 'The last topic\'s word-family deck card opens Words scrolled to that family, without a highlight.'), play: openFrom('words', 'last deck card') };
export const KeyPhrasesFromDeckCard: Story = { ...scene({}, 'The last topic\'s Key phrases deck card opens Key phrases scrolled to that topic, without a highlight.'), play: openFrom('phrases', 'last deck card') };
export const ExchangeFromDeckCard: Story = { ...scene({}, 'The last exchange deck card opens Exchanges scrolled to that exchange and briefly highlights it.'), play: openFrom('exchanges', 'last deck card') };
export const ConversationFromDeckCard: Story = { ...scene({}, 'The last topic\'s Conversation deck card opens Conversation scrolled to that topic.'), play: openFrom('conversation', 'last deck card') };
export const ChapterMenu: Story = {
  ...scene({ starred: true }, 'Open chapter menu: Starred first while anything is starred, then the categories with content and the collections; the current chapter is checked.'),
  play: async () => {
    await openChapter('category:exchanges');
    await userEvent.click(getScenario().root.querySelector<HTMLElement>('.chapter-sheet-switch')!);
  },
};
export const RepeatedTopicTitles: Story = {
  ...scene({ setup: async ({ groups }) => {
    for (const group of groups) await db.groups.update(group.id, { title: 'At the café' });
  } }, 'Identical topic titles retain distinct persisted IDs: Key phrases shows one section per topic, each keyed by its group, and the deck cards open their own section. Reorder boundaries follow identity, not title text.'),
  play: open('category:phrases'),
};
export const StarredPane: Story = { ...scene({ starred: true }, 'Starred pane: Words and Phrases tabs only. Each item names its topic and family and links back "In context". Starred deduplicates repeated membership occurrences and retains mixed Phrase, Word and Chunk entries.'), play: open('starred') };
export const EmptyStarred: Story = { ...scene({}, 'Starred stays open after its last star is removed: both tabs show their empty messages. With nothing starred the landing has no Starred card, the chapter menu omits Starred and Review is disabled.'), play: open('starred') };
export const EmptyPhrasebook: Story = {
  ...scene({}, 'Controller state specimen with existing groups and no entries: the landing has no category or collection cards, and an open category keeps each family heading with its empty message. Production wording is retained.'),
  play: async () => {
    await phrasebookLanding();
    const { app, data } = getScenario();
    app.ui.transition('content/cards-changed', { cards: [], groups: data.groups, deckId: data.deck!.id });
    app.ui.transition('content/open-chapter', { chapterKey: 'category:words' });
    await settledChapterSheet();
  },
};
export const CollectionTranslations: Story = { ...scene({}, 'Ungrouped Phrase occurrences open as the single-page Translations collection, separate from topic placement; the tab bar is hidden.'), play: open('translations') };
export const CollectionWords: Story = { ...scene({}, 'An unplaced Word with preserved source evidence opens in the Words collection.'), play: open('words') };
export const CollectionChunks: Story = { ...scene({}, 'Saved Chunk with its exact source snapshot opens in the Chunks collection.'), play: open('chunks') };
export const ReadyCover = scene({ illustration: 'ready' }, 'Real persisted ready image envelope. The cover behind the title uses the local image, not the fallback texture.');
export const FallbackCover = scene({ illustration: 'failed' }, 'Failed generated cover uses the existing /textbook/frogs.png fallback; category cards stay usable.');
export const Reordered: Story = {
  ...scene({ setup: async ({ deck }) => {
    const entries = await getCards(deck!.id);
    const first = entries.find((entry) => entry.occurrence?.section === 'thingsToSay')!;
    const section = entries.filter((entry) => entry.occurrence?.section === 'thingsToSay' && entry.occurrence.groupId === first.occurrence!.groupId);
    const replacements = section.map((entry) => entry.key).reverse();
    const keys = new Set(replacements);
    await updateDeckEntryOrder(deck!.id, entries.map((entry) => keys.has(entry.key) ? replacements.shift()! : entry.key));
  } }, 'Persisted reverse order in the first topic\'s Key phrases only; its Key phrases deck card previews the new first phrase, while the other topics, exchange turns and word families keep their original ordering.'),
  play: open('category:phrases'),
};
