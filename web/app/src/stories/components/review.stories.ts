import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fireEvent, userEvent } from 'storybook/test';
import { openReviewPanel } from '../../components/review-panel';
import { getReviewCards, updateDeckOrder } from '../../js/db';
import type { DeckOrder, LibraryEntry } from '../../js/library-types';
import { fixtureEntry, textFixtureEntry } from '../support/fixtures';
import { appStory, getScenario, logScenarioEvent } from '../support/scenario';

const meta = {
  title: 'Components/Review', tags: ['autodocs'], argTypes: {},
  parameters: { docs: { description: { component: 'src/components/review-panel.ts · openReviewPanel. Full-height finite reviewer: swipe horizontally for previous/next, reveal or hold the answer skeleton to peek, toggle direction, and request silent logged speech. The session applies the saved order once. Production body renderers are private and are exercised only via their controller. Empty guard is a direct-controller defensive specimen; the app disables Review without stars. Sheets lack details-style Escape/focus trapping. Interactions/Panels exercises real starred queries, reset and boundaries.' } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
type Sample = 'empty' | 'phrase' | 'word' | 'word-bare' | 'chunk' | 'long' | 'stored';
function review(sample: Sample, order: DeckOrder = 'default'): Story {
  let entries: LibraryEntry[] = [];
  return { ...appStory({ initial: 'textbook', starred: true, setup: async (data) => {
    await updateDeckOrder(data.deck!.id, order);
    data.deck!.order = order;
    if (sample === 'stored') entries = await getReviewCards(data.deck!.id);
    else if (sample === 'empty') entries = [];
    else if (sample === 'long') entries = [textFixtureEntry('long')];
    else {
      const entry = fixtureEntry(sample === 'word-bare' ? 'word' : sample);
      if (sample === 'word-bare') entry.sources = [];
      entries = [entry];
    }
  }, mount(root, data) {
    const random = Math.random;
    let sheet;
    try {
      if (order === 'random') Math.random = () => 0.25;
      sheet = openReviewPanel(root, data.deck!, entries, () => logScenarioEvent('Review dismissed'));
    } finally { Math.random = random; }
    return () => sheet.dispose();
  } }) };
}
async function reveal(): Promise<void> {
  await userEvent.click(getScenario().root.querySelector('[data-action="review/toggle-reveal"]')!);
  expect(getScenario().root.querySelector('.review-card-wrap')).toHaveAttribute('data-revealed', 'true');
}
export const EmptyGuard: Story = review('empty');
export const Phrase: Story = review('phrase');
export const WordWithoutSource: Story = review('word-bare');
export const WordWithSourceDisclosure: Story = { ...review('word'), play: async () => {
  await reveal();
  await userEvent.click(getScenario().root.querySelector('.review-source-examples summary')!);
  expect(getScenario().root.querySelector('.review-source-examples')).toHaveAttribute('open');
} };
export const ChunkMasked: Story = review('chunk');
export const ChunkRevealed: Story = { ...review('chunk'), play: reveal };
export const ChunkReverse: Story = { ...review('chunk'), play: async () => {
  await userEvent.click(getScenario().root.querySelector('[data-action="review/toggle-direction"]')!);
  expect(getScenario().root.querySelector('.review-card-wrap')).toHaveAttribute('data-revealed', 'false');
} };
export const PeekAndRelease: Story = { ...review('chunk'), play: async () => {
  const { root } = getScenario();
  fireEvent.mouseDown(root.querySelector('.review-answer-skeleton')!);
  expect(root.querySelector('.review-card-wrap')).toHaveAttribute('data-revealed', 'true');
  fireEvent.mouseUp(document);
  expect(root.querySelector('.review-card-wrap')).toHaveAttribute('data-revealed', 'false');
  logScenarioEvent('Peek released; hold the skeleton to repeat');
} };
export const DirectionResetsReveal: Story = { ...review('phrase'), play: async () => {
  await reveal();
  await userEvent.click(getScenario().root.querySelector('[data-action="review/toggle-direction"]')!);
  expect(getScenario().root.querySelector('.review-card-wrap')).toHaveAttribute('data-revealed', 'false');
} };
export const DefaultOrder: Story = review('stored');
export const ReverseOrder: Story = review('stored', 'reverse');
export const ControlledRandomOrder: Story = review('stored', 'random');
export const NextPreviousAndFiniteBoundaries: Story = {
  ...review('stored'),
  parameters: { docs: { description: { story: 'Swipe the card horizontally: left advances, right returns, and neither boundary wraps. Executable first/last assertions are in Interactions/Panels/Review.' } } },
};
export const LongScrollingAnswer: Story = { ...review('long'), play: reveal };
