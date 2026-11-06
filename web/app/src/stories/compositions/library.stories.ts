import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, waitFor } from 'storybook/test';
import { db, updateDeckName } from '../../js/db';
import { appStory, getScenario, logScenarioEvent, type ScenarioOptions } from '../support/scenario';
import { LONG_TITLE } from '../support/fixtures';

const meta = {
  title: 'Compositions/Library', tags: ['autodocs'], argTypes: {},
  parameters: { layout: 'fullscreen', docs: { description: { component: 'src/panes/nav-pane.ts: actual navigation owner inside mountApp. Real sandbox books and canonical saved-card counts; shelves retain native scrolling and keyboard controls. Artwork pending/failed intentionally uses the existing blank thumbnail. No alternate dark theme or copied navigation template.' } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const scene = (options: ScenarioOptions, description: string): Story => ({
  ...appStory({ initial: 'library', ...options }),
  parameters: { docs: { description: { story: description } } },
});

export const EmptyLanding = scene({ library: 'empty' }, 'First-use landing and animated situation examples. Selecting an example opens guided creation with a seed, not an API request.');
export const OneBook = scene({ library: 'single' }, 'A stored book, its canonical-card count and its language shelf.');
export const ManyBooksAndAllLanguages = scene({ library: 'multiple' }, 'Japanese, Chinese, Spanish, Czech and Ukrainian shelves, with two independently owned Japanese books. Most recently accessed books come first.');
export const LanguageOnlySavedCards = scene({ library: 'language-only' }, 'Saved Phrase, Word and Chunk records without any phrasebook; language browsing remains available.');
export const ReadyArtwork = scene({ library: 'multiple', illustration: 'ready' }, 'Validated local PNG artwork in real saved books.');
export const PendingArtwork = scene({ illustration: 'pending' }, 'Persisted pending artwork uses the production thumbnail fallback; no request is fabricated on mount.');
export const FailedArtwork = scene({ illustration: 'failed' }, 'Persisted failed artwork is nonfatal and preserves access to the book.');
export const BrokenArtwork: Story = {
  ...scene({ illustration: 'ready', setup: async ({ deck }) => {
    if (deck?.illustration?.state !== 'ready') throw new Error('Ready artwork fixture required');
    await db.decks.update(deck.id, { illustration: { ...deck.illustration, image: { ...deck.illustration.image, dataUrl: 'data:image/png;base64,AA==' } } });
  } }, 'Image-decode failure specimen: deliberately invalid local PNG bytes exercise the actual image error handler without a missing network asset. The stored book remains selectable.'),
  play: async () => {
    await waitFor(() => expect(getScenario().root.querySelector('.nav-book-art')).toHaveAttribute('data-failed', 'true'));
  },
};
export const LongNames = scene({ library: 'multiple', setup: async ({ decks }) => {
  for (const deck of decks) await updateDeckName(deck.id, LONG_TITLE);
} }, 'Long persisted names wrap in the actual two-row shelf; labels are not shortened in fixture data.');
export const LibraryErrorSpecimen: Story = {
  ...scene({ library: 'single' }, 'Visual error specimen only, not a simulated IndexedDB failure: sets the existing navigation error region after loading. Reload library uses the real controller and clears this specimen.'),
  play: async () => {
    const { root } = getScenario();
    await waitFor(() => expect(root.querySelectorAll('.nav-book').length).toBeGreaterThan(0));
    root.querySelector<HTMLElement>('[data-region="nav-error"]')!.textContent = 'Workbench library error specimen';
    root.querySelector<HTMLElement>('#nav-pane')!.dataset.error = 'true';
    logScenarioEvent('Library error visual specimen');
  },
};
export const ReducedMotionExamples: Story = {
  ...scene({ library: 'empty' }, 'Activate prefers-reduced-motion in browser/system settings to inspect static examples. This story reports the actual preference; it does not override production animation CSS. Focus, touch, wheel or keyboard also pauses example motion.'),
  play: async () => { logScenarioEvent('Actual reduced-motion preference', String(matchMedia('(prefers-reduced-motion: reduce)').matches)); },
};
