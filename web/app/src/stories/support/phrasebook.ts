import { expect, waitFor } from 'storybook/test';
import type { StarredTab } from '../../js/phrasebook-chapters';
import { getScenario } from './scenario';

/** Production content owner with a stored or preview phrasebook landing mounted. */
export async function phrasebookLanding(): Promise<HTMLElement> {
  let reader: HTMLElement | null = null;
  await waitFor(() => {
    reader = getScenario().root.querySelector<HTMLElement>('#content-pane [data-region="textbook-reader"]');
    expect(reader?.querySelector('.chapter-card')).toBeTruthy();
  });
  return reader!;
}

/** The visible (non-inert) page of the open chapter sheet. */
export function activeChapterPage(): HTMLElement {
  const page = getScenario().root.querySelector<HTMLElement>('[data-region="chapter-pager"] .chapter-page:not([inert])');
  if (!page) throw new Error('No open chapter page');
  return page;
}

/** Waits until the chapter sheet is open and settled (its slide transition ends). */
export async function settledChapterSheet(): Promise<HTMLElement> {
  const { root } = getScenario();
  await waitFor(() => {
    expect(root.querySelector('#content-pane')).toHaveAttribute('data-chapter-open');
    const sheet = root.querySelector<HTMLElement>('[data-region="chapter-sheet"]')!;
    expect(getComputedStyle(sheet).transform).toBe('none');
  });
  return activeChapterPage();
}

/** Opens a chapter ("category:<c>", "starred" or a collection) through the production
 * transition. Journeys that test the opening controls click them instead. */
export async function openChapter(chapterKey: string, tab?: StarredTab): Promise<HTMLElement> {
  await phrasebookLanding();
  getScenario().app.ui.transition('content/open-chapter', { chapterKey, ...(tab ? { tab } : {}) });
  await waitFor(() => expect(getScenario().app.ui.get('content').chapterKey).toBe(chapterKey));
  return settledChapterSheet();
}
