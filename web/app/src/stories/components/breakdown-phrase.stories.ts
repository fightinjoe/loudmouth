import type { Meta, StoryObj } from '@storybook/html-vite';
import type { Lang } from '@catchphrase/card-schema';
import { renderSource } from '../../components/phrase-breakdown';
import { cardRequest } from '../../js/phrase-breakdown';
import { speak, ttsText } from '../../js/tts';
import type { ReadingDisplay } from '../../js/library-types';
import type { DetailsState } from '../../panes/details-pane';
import { breakdownResponse, fixtureEntry, FIXTURE_LANGUAGES } from '../support/fixtures';
import { mountedStory } from '../support/mounted-story';

type Args = {
  language: Lang;
  readingDisplay: ReadingDisplay;
  showReadings: boolean;
  showEnglish: boolean;
  selection: 'word' | 'chunk' | 'all';
  status: 'ready' | 'loading' | 'error';
};

function specimen(args: Args): HTMLElement {
  return mountedStory((host) => {
    host.className = 'workbench-gallery';
    host.style.minHeight = '0';
    const entry = fixtureEntry('phrase', args.language);
    const breakdown = breakdownResponse(cardRequest(entry));
    const common = {
      entry, opener: host, readingDisplay: args.readingDisplay,
      showReadings: args.showReadings, showEnglish: args.showEnglish,
      selectedIndex: args.selection === 'chunk' ? 1 : 0, all: args.selection === 'all',
      requestId: 1, targets: {}, regenerating: false as const,
    };
    let state: DetailsState = args.status === 'ready'
      ? { ...common, status: 'ready', breakdown, error: null }
      : args.status === 'loading'
        ? { ...common, status: 'loading', breakdown: null, error: null }
        : { ...common, status: 'error', breakdown: null, error: 'Breakdown unavailable. Source-only state specimen.' };
    host.innerHTML = '<div id="details-layer" data-details-state="open" style="position:relative;inset:auto;width:100%;max-width:456px;padding:16px;box-sizing:border-box;background:var(--bg-surface)"><div class="details-source"></div><div id="details-explanations" hidden></div></div><output class="workbench-caption" aria-live="polite">Select a phrase part with click, Enter or Space. Audio records a silent speech request. No explanation cards or dialog are mounted.</output>';
    const source = host.querySelector<HTMLElement>('.details-source')!;
    const log = host.querySelector<HTMLOutputElement>('output')!;
    const render = (): void => { source.innerHTML = renderSource(state); };
    const activate = (target: HTMLElement): void => {
      log.textContent = JSON.stringify(target.dataset);
      if (target.dataset.action === 'details/play-audio') {
        const text = ttsText(entry.card);
        speak(text, entry.card.lang);
        log.textContent = `${JSON.stringify(target.dataset)} · Silent speech: ${entry.card.lang} · ${text}`;
      } else if (target.dataset.action === 'details/select-part' && state.status === 'ready') {
        const index = Number(target.dataset.index);
        state = { ...state, selectedIndex: index, all: false };
        const focused = document.activeElement === target;
        render();
        if (focused) source.querySelector<HTMLElement>(`[data-index="${index}"]`)?.focus();
      }
    };
    const click = (event: MouseEvent): void => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null;
      if (target && source.contains(target)) activate(target);
    };
    const keydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action="details/select-part"]') : null;
      if (!target || !source.contains(target)) return;
      event.preventDefault();
      activate(target);
    };
    render();
    source.addEventListener('click', click);
    source.addEventListener('keydown', keydown);
    return () => {
      source.removeEventListener('click', click);
      source.removeEventListener('keydown', keydown);
    };
  });
}

const meta = {
  title: 'Components/BreakdownPhrase',
  tags: ['autodocs'],
  args: { language: 'ja', readingDisplay: 'reading', showReadings: true, showEnglish: true, selection: 'word', status: 'ready' },
  argTypes: {
    language: { control: 'select', options: FIXTURE_LANGUAGES, description: 'Validated source phrase fixture in one of the five content languages.' },
    readingDisplay: { control: 'radio', options: ['reading', 'romanization'], description: 'Native ruby or available romanization. Missing readings are not fabricated.' },
    showReadings: { control: 'boolean', description: 'Show source reading annotations.' },
    showEnglish: { control: 'boolean', description: 'Show the source English translation.' },
    selection: { control: 'radio', options: ['word', 'chunk', 'all'], description: 'Initial highlighted part(s). Manual activation selects one part locally; changing Controls resets the specimen.' },
    status: { control: 'radio', options: ['ready', 'loading', 'error'], description: 'Only ready sources have interactive breakdown segments. Loading/error preserve the source without displaying the separate dialog notice.' },
  },
  parameters: { docs: { story: { inline: false }, description: { component: 'src/components/phrase-breakdown.ts: renderSource(DetailsState). The source phrase from PhraseBreakdown/AllParts, isolated in its production #details-layer and .details-source ancestors. Only outer positioning/width/padding are supplied for the workbench; no dialog, scrim, app or teaching templates are copied. Uses validated request-specific fixture teaching. Click/keyboard selection updates this local renderer specimen and logs the actual production action payload; audio uses the silent Storybook speech adapter. Loading/error are typed visual states, not requests. The empty hidden controlled region retains the renderer’s aria-controls reference without adding explanation cards. Use Components/PhraseBreakdown for the full controller, focus management and persistence.' } } },
  render: specimen,
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;

export const PrimaryWordSelected: Story = {};
export const PrimaryChunkSelected: Story = { args: { selection: 'chunk' } };
export const AllParts: Story = { args: { selection: 'all' } };
export const RomanizedReadings: Story = { args: { readingDisplay: 'romanization' } };
export const HiddenReadings: Story = { args: { showReadings: false } };
export const HiddenEnglish: Story = { args: { showEnglish: false } };
export const ChineseRuby: Story = { args: { language: 'zh', selection: 'all' } };
export const SourceLoading: Story = { args: { status: 'loading' } };
export const SourceError: Story = { args: { status: 'error' } };
