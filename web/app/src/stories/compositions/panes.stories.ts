import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, waitFor } from 'storybook/test';
import type { ActionOpen } from '../../panes/action-pane';
import { toImportJson } from '../../components/json-panel';
import { getReviewCards } from '../../js/db';
import { entryChapterKey } from '../../js/phrasebook-chapters';
import { appStory, getScenario } from '../support/scenario';
import { fixtureSuggestion, type SeededLibrary } from '../support/fixtures';
import { activeChapterPage, openChapter, phrasebookLanding } from '../support/phrasebook';

const meta = {
  title: 'Compositions/PaneStack', tags: ['autodocs'], argTypes: {},
  parameters: { layout: 'fullscreen', docs: { description: { component: 'src/panes/app.ts: mountApp owns the production navigation/content/details/action stack. These are real owners, not copied shells. Action sheets currently lack details-style Escape handling and focus trapping; this catalog preserves that limitation.' } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const base = () => appStory({ initial: 'textbook', library: 'single', starred: true });
async function loaded() {
  await phrasebookLanding();
  return getScenario();
}
function action(open: (data: SeededLibrary) => ActionOpen | Promise<ActionOpen>): Story {
  return { ...base(), play: async () => { const { app, data } = await loaded(); app.ui.transition('action/open', await open(data)); } };
}
/** Details open over its real opener: the entry's row in its open chapter. */
async function showDetails(): Promise<void> {
  const { data } = await loaded();
  const entry = data.entries.find((item) => item.card.type === 'phrase')!;
  await openChapter(entryChapterKey(entry));
  const opener = activeChapterPage().querySelector<HTMLElement>(`[data-action="content/open-card"][data-entry-key="${CSS.escape(entry.key)}"]`)!;
  getScenario().app.ui.transition('details/open', { entry, deck: data.deck, group: data.groups.find((group) => group.id === entry.occurrence?.groupId), opener });
}
export const ContentForeground: Story = { ...base() };
export const ContentWithOpenChapter: Story = { ...base(), play: async () => { await openChapter('category:phrases'); } };
export const LibraryForeground: Story = { ...base(), play: async () => { const { app } = await loaded(); app.ui.transition('shell/open'); } };
export const ContentAndDetails: Story = { ...base(), play: showDetails };
export const SettingsAction = action(({ deck, entries }) => ({ kind: 'settings', payload: { deck: deck!, cards: entries } }));
export const ReviewAction = action(async ({ deck }) => ({ kind: 'review', payload: { deck: deck!, cards: await getReviewCards(deck!.id) } }));
export const CreationAction = action(() => ({ kind: 'creation', payload: { lang: 'ja', seed: 'Ordering at a café' } }));
export const SuggestionConfirmationAction = action(() => ({ kind: 'new-phrasebook', payload: { suggestion: fixtureSuggestion() } }));
export const JsonAction = action(({ deck, entries }) => ({ kind: 'json', payload: { title: deck!.name, jsonString: toImportJson(entries) } }));
export const DetailsToActionExclusivity: Story = {
  ...base(),
  parameters: { docs: { description: { story: 'A typed settings action replaces the active details owner. Only the action remains active; the production details dismissal lifecycle releases its focus ownership.' } } },
  play: async () => {
    await showDetails();
    const { app, data } = getScenario();
    app.ui.transition('action/open', { kind: 'settings', payload: { deck: data.deck!, cards: data.entries } });
    await waitFor(() => expect(app.ui.get('details')).toBeNull());
  },
};
export const ShortViewportIndependentScroll: Story = {
  ...base(), globals: { viewport: { value: 'narrow', isRotated: true } },
  parameters: { docs: { description: { story: 'Short rotated 320×640 viewport: scroll the phrasebook landing separately from the navigation shelves, then open a topic or action sheet and inspect its independently scrolling body. Production viewport sizing remains unchanged.' } } },
};
