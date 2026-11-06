import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, waitFor } from 'storybook/test';
import { db, getCards, updateDeckEntryOrder } from '../../js/db';
import { appStory, getScenario, type ScenarioOptions } from '../support/scenario';

const meta = {
  title: 'Compositions/Textbook', tags: ['autodocs'], argTypes: {},
  parameters: { layout: 'fullscreen', docs: { description: { component: 'src/panes/content-pane.ts and content-pane-render.ts: renderDeckBody/renderTextbook/renderChapter under the real content owner. Three topics, four learning sections, alternatives, Word families and repeated canonical entries. All editing, stars, speech and menus remain live against isolated IndexedDB.' } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const scene = (options: ScenarioOptions, description: string): Story => ({
  ...appStory({ initial: 'textbook', library: 'single', ...options }),
  parameters: { docs: { description: { story: description } } },
});
const jump = (chapterKey: string): Story['play'] => async () => {
  const { root, app } = getScenario();
  await waitFor(() => expect(root.querySelector('.textbook-reader')).not.toBeNull());
  app.ui.transition('content/jump-chapter', { chapterKey });
};

export const CompleteMultiTopicBook = scene({}, 'Complete book: Things to say, Likely exchanges with alternative responses, Words grouped by family, and Example conversation; supplemental Translations/Words/Chunks follow the topics.');
export const RepeatedTitlesDistinctIds = scene({ setup: async ({ groups }) => {
  for (const group of groups) await db.groups.update(group.id, { title: 'At the café' });
} }, 'Identical topic titles retain distinct persisted IDs. Contents jumps and reorder boundaries follow identity, not title text.');
export const ExchangesAndAlternatives: Story = {
  ...scene({}, 'Alternatives stay inside their speaker turn, with the production explicit separator. Scroll within the first topic to inspect the full exchange.'),
  play: async () => {
    await waitFor(() => expect(getScenario().root.querySelector('.topic-exchange')).not.toBeNull());
    getScenario().root.querySelector('.topic-exchange')!.scrollIntoView({ block: 'start' });
  },
};
export const WordFamilies: Story = {
  ...scene({}, 'Word tiles use actual textbook ancestors, family labels and independent horizontal shelves.'),
  play: async () => {
    await waitFor(() => expect(getScenario().root.querySelector('.topic-word-family')).not.toBeNull());
    getScenario().root.querySelector('.topic-word-family')!.scrollIntoView({ block: 'start' });
  },
};
export const SupplementalTranslations: Story = { ...scene({}, 'Ungrouped Phrase occurrences appear in Translations, separate from topic placement.'), play: jump('translations') };
export const SupplementalWords: Story = { ...scene({}, 'An unplaced Word with preserved source evidence appears in the supplemental Words chapter.'), play: jump('words') };
export const SupplementalChunks: Story = { ...scene({}, 'Saved Chunk with its exact source snapshot appears in Chunks.'), play: jump('chunks') };
export const EmptySections: Story = {
  ...scene({}, 'Controller state specimen with existing groups and no entries. Shows all four current empty-section messages and empty Starred. This is not a database-fault test; production wording is retained, including its existing inconsistencies.'),
  play: async () => {
    const { app, root, data } = getScenario();
    await waitFor(() => expect(root.querySelector('.textbook-reader')).not.toBeNull());
    app.ui.transition('content/cards-changed', { cards: [], groups: data.groups, deckId: data.deck!.id });
  },
};
export const EmptyStarred: Story = { ...scene({}, 'No memberships starred: empty Starred message and disabled Review.'), play: jump('starred') };
export const MixedStarred: Story = { ...scene({ starred: true }, 'Starred deduplicates repeated membership occurrences and retains mixed Phrase, Word and Chunk entries with provenance.'), play: jump('starred') };
export const ReadyCover = scene({ illustration: 'ready' }, 'Real persisted ready image envelope. The book backdrop uses the local image, not the fallback texture.');
export const FallbackCover = scene({ illustration: 'failed' }, 'Failed generated cover uses the existing /textbook/frogs.png fallback; cards and chapters stay usable.');
export const ReorderedList = scene({ setup: async ({ deck }) => {
  const entries = await getCards(deck!.id);
  const first = entries.find((entry) => entry.occurrence?.section === 'thingsToSay')!;
  const section = entries.filter((entry) => entry.occurrence?.section === 'thingsToSay' && entry.occurrence.groupId === first.occurrence!.groupId);
  const replacements = section.map((entry) => entry.key).reverse();
  const keys = new Set(replacements);
  await updateDeckEntryOrder(deck!.id, entries.map((entry) => keys.has(entry.key) ? replacements.shift()! : entry.key));
} }, 'Persisted reverse order in the first Things to say shelf only; exchange turns and Word families keep their original ordering.');
