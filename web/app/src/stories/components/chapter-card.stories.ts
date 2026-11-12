import type { Meta, StoryObj } from '@storybook/html-vite';
import type { Lang } from '@catchphrase/card-schema';
import { CATEGORIES, type CategoryChapter, type CategoryKey, type Topic } from '../../js/phrasebook-chapters';
import { renderCategoryCard, renderCollectionCard, renderStarredCard } from '../../components/chapter-card';
import { escapeHTML } from '../../js/utils';
import { FIXTURE_LANGUAGES, HOSTILE_TEXT, LONG_TITLE, textFixtureEntry } from '../support/fixtures';
import { categoryChapter, collectionChapters, fixtureBook, starredChapter } from '../support/chapters';
import { mountedStory } from '../support/mounted-story';

type Content = 'all' | 'sparse' | 'empty';
type Args = { category: CategoryKey; language: Lang; content: Content };

function mount(body: string): HTMLElement {
  return mountedStory((host) => {
    host.className = 'workbench-gallery';
    host.innerHTML = `<div id="content-pane" style="max-width:480px;min-width:0"><div class="chapter-cards"><div class="chapter-list-region">${body}</div></div></div><output class="workbench-caption" aria-live="polite">Renderer specimen: click a header or deck card to inspect its content/open-chapter payload; nothing opens here.</output>`;
    const log = (event: Event): void => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null;
      if (target) host.querySelector('output')!.textContent = JSON.stringify(target.dataset);
    };
    host.addEventListener('click', log);
    return () => host.removeEventListener('click', log);
  });
}
const caption = (text: string) => `<p class="workbench-caption">${escapeHTML(text)}</p>`;

/** The same topic with every section emptied; word families and exchanges keep their (empty) shells. */
function emptied(topic: Topic): Topic {
  return { ...topic, thingsToSay: [], exampleConversation: [],
    likelyExchanges: topic.likelyExchanges.map((exchange) => ({ ...exchange, turns: [] })),
    words: topic.words.map((family) => ({ ...family, entries: [] })) };
}

function category(args: Args): CategoryChapter {
  const chapter = categoryChapter(fixtureBook({ lang: args.language }), args.category);
  const last = chapter.topics.length - 1;
  const topics = args.content === 'all' ? chapter.topics
    : chapter.topics.map((topic, index) => args.content === 'sparse' && index === last ? topic : emptied(topic));
  return { ...chapter, topics };
}

function renderCategory(args: Args): string {
  const html = renderCategoryCard(category(args));
  return html || caption('renderCategoryCard returned an empty string: the landing omits a category without content.');
}

const meta = {
  title: 'Components/ChapterCard', tags: ['autodocs'],
  args: { category: 'words', language: 'ja', content: 'all' },
  argTypes: {
    category: { control: 'radio', options: CATEGORIES.map(({ key }) => key), description: 'Words (one card per word family, grouped by topic), Key phrases (one card per topic), Exchanges (one card per exchange, grouped by topic) or Conversation (one bubble-preview card per topic).' },
    language: { control: 'select', options: FIXTURE_LANGUAGES, description: 'Schema-valid authored specimen language.' },
    content: { control: 'radio', options: ['all', 'sparse', 'empty'], description: 'Every topic filled; only the last topic filled (empty topics leave no group); or no content at all (the card renders nothing).' },
  },
  parameters: { docs: { description: { component: 'src/components/chapter-card.ts: renderCategoryCard, renderStarredCard and renderCollectionCard, rendered under the actual #content-pane .chapter-cards .chapter-list-region ancestors. Chapters come from the real getDeckChapters over an in-memory projection of the three-topic fixture book. A category header opens its chapter at the top; each deck card carries data-focus naming the family, exchange or topic section to reveal. The horizontal row (.chapter-row) scrolls natively; keyboard and drag scrolling are exercised in Interactions/Phrasebook.' } } },
  render: (args: Args) => mount(renderCategory(args)),
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;

export const Playground: Story = {};
export const WordsCard: Story = { args: { category: 'words' }, parameters: { docs: { description: { story: 'Words: "Aa" glyph, count of word families with content, one deck card per family headed by its title, grouped per topic, footed "2 words".' } } } };
export const KeyPhrasesCard: Story = { args: { category: 'phrases' }, parameters: { docs: { description: { story: 'Key phrases: one joined group with one deck card per topic, headed by the topic title and previewing its first phrase.' } } } };
export const ExchangesCard: Story = { args: { category: 'exchanges' }, parameters: { docs: { description: { story: 'Exchanges: one deck card per exchange headed by the exchange title, grouped per topic, footed by its line count; opening one highlights the exchange.' } } } };
export const ConversationCard: Story = { args: { category: 'conversation' }, parameters: { docs: { description: { story: 'Conversation: one card per topic previewing up to three lines as speaker-aligned bubbles.' } } } };
export const AllCategories: Story = {
  parameters: { docs: { description: { story: 'The four category cards in landing order: Words, Key phrases, Exchanges, Conversation.' } } },
  render: (args: Args) => mount(CATEGORIES.map(({ key }) => renderCategoryCard(category({ ...args, category: key }))).join('')),
};
export const SparseCategory: Story = { args: { category: 'exchanges', content: 'sparse' }, parameters: { docs: { description: { story: 'Only the last topic has content: the count drops to one and empty topics leave no group or placeholder.' } } } };
export const EmptyCategories: Story = {
  args: { content: 'empty' },
  parameters: { docs: { description: { story: 'Topics without content: every category card renders nothing, so the landing shows only the collections.' } } },
  render: (args: Args) => mount(CATEGORIES.map(({ key, title }) => caption(`${title}: ${renderCategoryCard(category({ ...args, category: key })) ? 'rendered' : 'empty string'}`)).join('')),
};
export const StarredCard: Story = {
  parameters: { docs: { description: { story: 'Starred leads the landing with the same card shape: starred Words grouped by their family title, then one Phrases card covering phrases and chunks. The header counts deduplicated memberships.' } } },
  render: () => {
    const book = fixtureBook({ starred: true });
    return mount(`${caption('Every membership starred')}${renderStarredCard(starredChapter(book), book.chapters)}${caption('Nothing starred: renderStarredCard returns an empty string (no card below)')}${renderStarredCard(starredChapter(fixtureBook()), [])}`);
  },
};
export const CollectionCards: Story = {
  parameters: { docs: { description: { story: 'Unplaced Translations, Words and Chunks follow the categories as one-card chapters with the collection icon instead of a glyph.' } } },
  render: () => mount(collectionChapters(fixtureBook()).map(renderCollectionCard).join('')),
};
export const LongAndHostileTitles: Story = {
  parameters: { docs: { description: { story: 'Long and literal hostile topic, family and exchange titles and card text stay escaped and clamped in deck cards.' } } },
  render: () => {
    const book = fixtureBook();
    const hostile = textFixtureEntry('hostile');
    const long = textFixtureEntry('long');
    const retitle = (topics: readonly Topic[]): Topic[] => topics.map((topic, index) => ({ ...topic,
      title: index === 0 ? LONG_TITLE : HOSTILE_TEXT,
      thingsToSay: index === 0 ? topic.thingsToSay : [hostile, long],
      words: topic.words.map((family) => ({ ...family, title: index === 0 ? LONG_TITLE : HOSTILE_TEXT })),
      likelyExchanges: topic.likelyExchanges.map((exchange) => ({ ...exchange, title: HOSTILE_TEXT })) }));
    return mount([
      ...CATEGORIES.map(({ key }) => { const chapter = categoryChapter(book, key); return renderCategoryCard({ ...chapter, topics: retitle(chapter.topics) }); }),
      renderCollectionCard({ kind: 'translations', key: 'translations', title: 'Translations', entries: [long, hostile] }),
    ].join(''));
  },
};
