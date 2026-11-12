import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { getCards, getDecks } from '../../js/db';
import { appStory, getScenario, logScenarioEvent } from '../support/scenario';
import { requests } from '../support/transport';

const meta = {
  title: 'Interactions/Library', tags: ['autodocs'], argTypes: {},
  parameters: { layout: 'fullscreen', docs: { description: { component: 'Executable journeys through src/panes/nav-pane.ts and content-pane.ts, mounted by appStory/mountApp with real sandbox persistence. No live generation or speech. Reset scenario restores fixture state; resulting scenes remain interactive.' } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const element = (selector: string): HTMLElement => {
  const result = getScenario().root.querySelector<HTMLElement>(selector);
  if (!result) throw new Error(`Missing library journey element: ${selector}`);
  return result;
};
async function click(selector: string): Promise<void> {
  await waitFor(() => expect(getScenario().root.querySelector(selector)).not.toBeNull());
  await userEvent.click(element(selector));
}

export const ExampleSelectionSeedsWithoutRequest: Story = {
  ...appStory({ library: 'empty' }),
  parameters: { docs: { description: { story: 'Click an actual empty-library example; choose a language and advance to the seeded topic. No generation endpoint is called merely by selecting the example or language.' } } },
  play: async () => {
    const seed = element('.nav-example').dataset.seed!;
    await click('.nav-example');
    await click('[data-action="creation/language"][value="ja"]');
    await expect(requests).toHaveLength(0);
    await click('[data-action="creation/next-language"]');
    await waitFor(() => expect(element('.creation-input-field')).toHaveValue(seed));
    await expect(await getDecks()).toHaveLength(0);
    await expect(requests).toHaveLength(0);
    logScenarioEvent('Example selection preserved seed without generation', seed);
  },
};

export const MenuLanguageBrowseAndBack: Story = {
  ...appStory({ library: 'multiple', initial: 'textbook' }),
  play: async () => {
    await click('[data-action="content/menu"]');
    await waitFor(() => expect(getScenario().app.ui.get('shell').exposed).toBe('background'));
    await click('[data-action="nav/browse-lang"][data-lang="ja"]');
    await waitFor(() => expect(element('[data-region="browse-list"]')).toHaveTextContent('All saved cards'));
    await expect(getScenario().app.ui.get('shell').exposed).toBe('foreground');
    await click('[data-action="content/browse-back"]');
    await waitFor(() => expect(getScenario().root.querySelector('[data-region="textbook-reader"]')).not.toBeNull());
    await expect(getScenario().app.ui.get('content').browse).toBeNull();
    await click('[data-action="content/menu"]');
    await click('[data-action="nav/browse-lang"][data-lang="ja"]');
    await click('[data-action="content/browse-select"][data-deck-id="lang:ja"]');
    await waitFor(() => expect(element('[data-region="card-list"]')).toHaveTextContent('Chunks'));
    await expect(getScenario().root.querySelectorAll('.card-star')).toHaveLength(0);
    await expect(getScenario().root.querySelector('[data-action="content/review"]')).toBeNull();
    await expect(requests).toHaveLength(0);
    logScenarioEvent('Menu, language browse, Back and read-only saved cards completed');
  },
};

export const ShelfKeyboardAndStoredBookOrdering: Story = {
  ...appStory({ library: 'multiple' }),
  globals: { viewport: { value: 'narrow', isRotated: false } },
  play: async () => {
    await waitFor(() => expect(getScenario().root.querySelectorAll('.nav-book')).toHaveLength(6));
    for (const selector of ['.nav-book-shelf', '.nav-language-shelf']) {
      const shelf = element(selector);
      shelf.focus();
      await userEvent.keyboard('{End}');
      await expect(shelf.scrollLeft).toBeGreaterThan(0);
      await userEvent.keyboard('{Home}');
      await expect(shelf.scrollLeft).toBe(0);
      await userEvent.keyboard('{ArrowRight}');
      await expect(shelf.scrollLeft).toBeGreaterThan(0);
      await userEvent.keyboard('{ArrowLeft}');
      await expect(shelf.scrollLeft).toBe(0);
    }
    const books = [...getScenario().root.querySelectorAll<HTMLElement>('.nav-book')];
    const chosen = books[books.length - 1];
    const id = chosen.dataset.deckId!;
    const count = new Set((await getCards(id)).map((entry) => entry.cardId)).size;
    await expect(chosen).toHaveTextContent(`${count} saved cards`);
    await userEvent.click(chosen);
    await waitFor(() => expect(getScenario().app.ui.get('content').deck?.id).toBe(id));
    await click('[data-action="content/menu"]');
    await waitFor(() => expect(element('.nav-book').dataset.deckId).toBe(id));
    await expect(element('.nav-book')).toHaveTextContent(`${count} saved cards`);
    logScenarioEvent('Shelf keyboard and most-recent ordering preserved', id);
  },
};

export const ManualMotionPause: Story = {
  ...appStory({ library: 'empty' }),
  globals: { viewport: { value: 'narrow', isRotated: false } },
  parameters: { docs: { description: { story: 'Keyboard interaction permanently pauses the current empty-library example motion, even after focus leaves. Actual reduced-motion preference is logged; no animation CSS is replaced.' } } },
  play: async () => {
    const examples = element('.nav-examples');
    examples.focus();
    await userEvent.keyboard('{ArrowDown}');
    examples.blur();
    const top = examples.scrollTop;
    await new Promise<void>((resolve) => setTimeout(resolve, 160));
    await expect(examples.scrollTop).toBe(top);
    logScenarioEvent('Manual example motion paused', `reduced-motion=${matchMedia('(prefers-reduced-motion: reduce)').matches}`);
  },
};
