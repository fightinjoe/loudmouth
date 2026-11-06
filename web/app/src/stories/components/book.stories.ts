import type { Meta, StoryObj } from '@storybook/html-vite';
import type { Lang } from '@catchphrase/card-schema';
import { expect, waitFor } from 'storybook/test';
import { renderBook, handleBookImageError } from '../../components/book';
import { CONTENT_LANGUAGES, LANG_NAMES } from '../../js/lang';
import { fixtureDeck, FIXTURE_TITLE, imageResponse, LONG_TITLE, HOSTILE_TEXT } from '../support/fixtures';
import { mountedStory } from '../support/mounted-story';

type Args = {
  title: string;
  subtitle: string;
  lang: Lang;
  artwork: 'absent' | 'pending' | 'failed' | 'ready' | 'broken';
};

function book(args: Args): string {
  const deck = fixtureDeck(args.lang);
  deck.name = args.title;
  if (args.artwork === 'ready' || args.artwork === 'broken') {
    const image = imageResponse().image;
    deck.illustration = {
      state: 'ready', requestId: 'storybook-book-art', prompt: 'Local artwork specimen',
      image: args.artwork === 'broken' ? { ...image, dataUrl: 'data:image/png;base64,AA==' } : image,
    };
  } else if (args.artwork !== 'absent') {
    deck.illustration = { state: args.artwork, requestId: 'storybook-book-art', prompt: 'Local artwork specimen' };
  }
  return renderBook({ deck, subtitle: args.subtitle });
}

function mount(html: string): HTMLElement {
  return mountedStory((host) => {
    host.className = 'workbench-gallery';
    host.style.minHeight = '0';
    // Keep the production two-row shelf geometry and tile selectors, without mounting an app shell.
    host.innerHTML = `<section class="nav-pane" style="width:100%;max-width:480px;min-width:0;background:var(--textbook-paper);color:var(--fg-body)">
      <div class="nav-book-shelf" role="region" aria-label="Phrasebook tile specimens">${html}</div>
    </section><output class="workbench-caption" aria-live="polite">Click a book to inspect its navigation payload.</output>`;
    const log = (event: Event): void => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null;
      if (target) host.querySelector('output')!.textContent = JSON.stringify(target.dataset);
    };
    host.addEventListener('click', log);
    host.addEventListener('error', handleBookImageError, true);
    return () => {
      host.removeEventListener('click', log);
      host.removeEventListener('error', handleBookImageError, true);
    };
  });
}

const meta = {
  title: 'Components/Phrasebook',
  tags: ['autodocs'],
  args: { title: FIXTURE_TITLE, subtitle: '12 saved cards', lang: 'ja', artwork: 'absent' },
  argTypes: {
    title: { control: 'text', description: 'Escaped phrasebook title, supplied as deck.name.' },
    subtitle: { control: 'text', description: 'Escaped saved-card count supplied by navigation; blank keeps the existing empty line.' },
    lang: { control: 'select', options: CONTENT_LANGUAGES, description: 'Content language; flag and language name come from the production registry.' },
    artwork: { control: 'select', options: ['absent', 'pending', 'failed', 'ready', 'broken'], description: 'Missing, pending and failed art use the existing frog thumbnail. Broken PNG bytes exercise the actual decode-error handler.' },
  },
  parameters: { docs: { story: { inline: false }, description: { component: 'src/components/book.ts: renderBook and handleBookImageError, reused by nav-pane.ts. A single selectable phrasebook tile in its real .nav-pane / .nav-book-shelf ancestors, at the production shelf width. The empty second shelf row is intentional production geometry. Titles, language labels and subtitles are escaped; artwork is decorative. Clicks log nav/open-deck and the fixture deck ID rather than navigating or writing storage. The production capture-phase image-error handler reveals the CSS fallback on a real decode failure. Library sorting, create-cell placement and shelf keyboard navigation belong to Compositions/Library, not this isolated tile.' } } },
  render: (args: Args) => mount(book(args)),
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;

export const Playground: Story = {};
export const ReadyArtwork: Story = { args: { artwork: 'ready' }, parameters: { docs: { description: { story: 'Uses the existing validated local PNG fixture; no generated-image service or network artwork request.' } } } };
export const PendingArtwork: Story = { args: { artwork: 'pending' } };
export const FailedArtwork: Story = { args: { artwork: 'failed' } };
export const BrokenArtwork: Story = {
  args: { artwork: 'broken' },
  parameters: { docs: { description: { story: 'Deliberately invalid local PNG bytes trigger the shared production image-error handler. The thumbnail falls back without changing the title, payload or selectable button.' } } },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('.nav-book-art')).toHaveAttribute('data-failed', 'true'));
  },
};
export const AllLanguages: Story = {
  render: (args) => mount(CONTENT_LANGUAGES.map((lang) => book({ ...args, lang, title: `${FIXTURE_TITLE} · ${LANG_NAMES[lang]}` })).join('')),
};
export const LongTitleAndSubtitle: Story = { args: { title: LONG_TITLE, subtitle: '128 saved cards · A longer library subtitle that wraps without changing the thumbnail width.' } };
export const HostileText: Story = { args: { title: HOSTILE_TEXT, subtitle: HOSTILE_TEXT } };
export const EmptySubtitle: Story = { args: { subtitle: '' } };
