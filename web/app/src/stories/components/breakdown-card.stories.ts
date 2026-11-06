import type { Meta, StoryObj } from '@storybook/html-vite';
import type { Lang } from '@catchphrase/card-schema';
import { renderExplanations } from '../../components/phrase-breakdown';
import { breakdownCandidates, cardRequest } from '../../js/phrase-breakdown';
import type { ReadingDisplay } from '../../js/library-types';
import type { DetailsReadyState } from '../../panes/details-pane';
import { breakdownResponse, fixtureDeck, fixtureEntry, FIXTURE_DATE, FIXTURE_LANGUAGES } from '../support/fixtures';
import { mountedStory } from '../support/mounted-story';

type Args = {
  language: Lang;
  readingDisplay: ReadingDisplay;
  showReadings: boolean;
  selection: 'word' | 'chunk' | 'all';
  saveState: 'unstarred' | 'starred' | 'unresolved' | 'pending' | 'error' | 'no-deck';
};

function specimen(args: Args): HTMLElement {
  return mountedStory((host) => {
    host.className = 'workbench-gallery';
    host.style.minHeight = '0';
    const entry = fixtureEntry('phrase', args.language);
    const deck = args.saveState === 'no-deck' ? undefined : fixtureDeck(args.language);
    const breakdown = breakdownResponse(cardRequest(entry, deck));
    const targets: DetailsReadyState['targets'] = {};
    if (args.saveState !== 'unresolved') {
      for (const { identity } of breakdownCandidates(breakdown)) {
        targets[identity] = {
          starredAt: args.saveState === 'starred' ? FIXTURE_DATE : null,
          pending: args.saveState === 'pending',
          ...(args.saveState === 'error' ? { error: 'The learning item could not be saved.' } : {}),
        };
      }
    }
    const state: DetailsReadyState = {
      entry, ...(deck ? { deck } : {}), opener: host,
      readingDisplay: args.readingDisplay, showReadings: args.showReadings, showEnglish: true,
      selectedIndex: args.selection === 'chunk' ? 1 : 0, all: args.selection === 'all',
      requestId: 1, targets, status: 'ready', breakdown, regenerating: false, error: null,
    };
    const shown = state.all ? breakdown.chunks : [breakdown.chunks[state.selectedIndex]!];
    host.innerHTML = `<div id="details-layer" data-details-state="open" style="position:relative;inset:auto;width:100%;max-width:456px;padding:16px;box-sizing:border-box;background:var(--bg-surface)"><div class="details-body"><div id="details-explanations" class="details-explanations" aria-live="polite">${renderExplanations(state, shown)}</div></div></div><output class="workbench-caption" aria-live="polite">${args.saveState === 'no-deck' ? 'No phrasebook: the production renderer omits star controls.' : 'Activate a star to inspect its production action payload. Use Save state in Controls to change the visual state; this isolated renderer does not write to storage.'}</output>`;
    const log = host.querySelector<HTMLOutputElement>('output')!;
    const click = (event: MouseEvent): void => {
      const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-action="details/toggle-target"]') : null;
      if (target && !target.disabled) log.textContent = `${JSON.stringify(target.dataset)} · Action only; no persistence in this renderer specimen.`;
    };
    host.addEventListener('click', click);
    return () => host.removeEventListener('click', click);
  });
}

const meta = {
  title: 'Components/BreakdownCard',
  tags: ['autodocs'],
  args: { language: 'ja', readingDisplay: 'reading', showReadings: true, selection: 'word', saveState: 'unstarred' },
  argTypes: {
    language: { control: 'select', options: FIXTURE_LANGUAGES, description: 'Validated fixture teaching for a phrase in one of the five content languages.' },
    readingDisplay: { control: 'radio', options: ['reading', 'romanization'], description: 'Native ruby or available Word romanization. Production explanation fragments retain their native text in romanization mode.' },
    showReadings: { control: 'boolean', description: 'Show available fragment/Word readings. English teaching remains visible, independently of the source translation setting.' },
    selection: { control: 'radio', options: ['word', 'chunk', 'all'], description: 'Render the primary Word card, the primary Chunk card, or both original explanation cards. Their indexes remain relative to the complete response.' },
    saveState: { name: 'Save state', control: 'select', options: ['unstarred', 'starred', 'unresolved', 'pending', 'error', 'no-deck'], description: 'Typed target-state specimen. Unresolved/pending controls are disabled; no-deck omits controls. This does not exercise a storage success or failure.' },
  },
  parameters: { docs: { story: { inline: false }, description: { component: 'src/components/phrase-breakdown.ts: renderExplanations(DetailsReadyState, chunks). The actual explanation cards from PhraseBreakdown/AllParts, with production #details-layer, .details-body and .details-explanations ancestors, without the source phrase, dialog, app or tools. Only outer workbench positioning/width/padding are supplied. The existing renderer already accepts one or multiple original chunks, so no production extraction or duplicate teaching markup is needed. Validated fixtures include primary Word and Chunk targets with source evidence; teaching is deterministic workbench content, not a language-quality gold label. Native button activation logs the real target identity/kind/chunk/word action payload. Save states are controlled visual specimens, not a second persistence controller; use Components/PhraseBreakdown for live saving, regeneration and modal behavior. English glosses are always part of teaching; the source-only English toggle intentionally is not exposed here.' } } },
  render: specimen,
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;

export const PrimaryWord: Story = {};
export const PrimaryChunk: Story = { args: { selection: 'chunk' } };
export const AllParts: Story = { args: { selection: 'all' } };
export const RomanizedReadings: Story = { args: { readingDisplay: 'romanization' } };
export const HiddenReadings: Story = { args: { showReadings: false, selection: 'all' } };
export const ChineseRuby: Story = { args: { language: 'zh', selection: 'all' } };
export const StarredTargets: Story = { args: { saveState: 'starred', selection: 'all' } };
export const UnresolvedTargets: Story = { args: { saveState: 'unresolved', selection: 'all' } };
export const PendingTargets: Story = { args: { saveState: 'pending', selection: 'all' } };
export const TargetSaveError: Story = { args: { saveState: 'error', selection: 'all' } };
export const NoDeckSavingUnavailable: Story = { args: { saveState: 'no-deck', selection: 'all' } };
