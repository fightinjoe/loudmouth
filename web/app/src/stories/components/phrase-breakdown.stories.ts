import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, waitFor } from 'storybook/test';
import { validateBreakdownRequest, validateBreakdownResponse } from '@catchphrase/card-schema';
import type { ReadingDisplay } from '../../js/library-types';
import type { DetailsReadyState } from '../../panes/details-pane';
import { appStory, getScenario, logScenarioEvent, type ScenarioOptions } from '../support/scenario';
import { breakdownResponse } from '../support/fixtures';
import { setOutcome, setResponseFactory, type Outcome } from '../support/transport';

type Args = { readingDisplay: ReadingDisplay; showReadings: boolean; showEnglish: boolean };
const defaults: Args = { readingDisplay: 'reading', showReadings: true, showEnglish: true };
const meta = {
  title: 'Components/PhraseBreakdown',
  tags: ['autodocs'],
  args: defaults,
  argTypes: {
    readingDisplay: { control: 'radio', options: ['reading', 'romanization'], description: 'Native ruby or romanization; only available readings are rendered.' },
    showReadings: { control: 'boolean', description: 'Show source and teaching readings without changing the request/cache identity.' },
    showEnglish: { control: 'boolean', description: 'Show the source English translation. Teaching glosses remain visible.' },
  },
  parameters: { layout: 'fullscreen', docs: { story: { inline: false }, description: { component: 'src/components/phrase-breakdown.ts: renderSource, renderExplanations, renderReadyBody, composed by the real src/panes/details-pane.ts owner. Mounted textbook cards supply real opener geometry; the owner fills count, selection and toggle labels, manages focus and uses validated request-specific transport fixtures. Controls remount the owner without resetting sandbox storage. Target failure/pending/unresolved specimens use the existing typed pane slice, not an exercised storage failure. Unlike action sheets, this dialog traps focus and supports Escape. Use Reset scenario to discard saved stars/cache.' } } },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;
type Variant = { outcome?: Outcome; all?: boolean; selected?: number; noDeck?: boolean; target?: 'unresolved' | 'pending' | 'error'; regeneration?: Outcome; single?: boolean; starred?: boolean; lang?: ScenarioOptions['lang'] };

function specimen(variant: Variant = {}): Story {
  let controls = defaults;
  const scenario = appStory({
    library: 'single', initial: 'textbook', lang: variant.lang, starred: variant.starred,
    outcomes: { '/phrase-breakdown': variant.outcome ?? 'success' },
    setup() {
      if (variant.single) setResponseFactory('/phrase-breakdown', (body) => {
        const request = validateBreakdownRequest(body);
        const response = breakdownResponse(request);
        const { snapshot } = request.source;
        const first = response.chunks[0]!;
        const role = 'Complete request';
        const explanation = 'A single learning chunk covering this complete source phrase.';
        return validateBreakdownResponse({ ...response, chunks: [{ ...first,
          start: 0, end: snapshot.text.length, text: snapshot.text, gloss: snapshot.translation, role, explanation,
          target: { kind: 'chunk', card: { type: 'chunk', lang: snapshot.lang, text: snapshot.text,
            translation: snapshot.translation, source: { ...request.source, span: { start: 0, end: snapshot.text.length } }, role, explanation } },
        }] }, request);
      });
    },
    mount(root, data, app) {
      let opened = false;
      let decorated = false;
      const open = (): void => {
        if (opened) return;
        const content = app.ui.get('content');
        const entry = content.cards.find((candidate) => candidate.card.type === 'phrase');
        if (!entry) return;
        const row = [...root.querySelectorAll<HTMLElement>('[data-action="content/open-card"]')].find((element) => element.dataset.entryKey === entry.key);
        const opener = row?.querySelector<HTMLElement>('.card-term');
        if (!opener) return;
        opened = true;
        const group = content.groups.find((candidate) => candidate.id === entry.occurrence?.groupId);
        app.ui.transition('details/open', { entry, opener, ...controls,
          ...(!variant.noDeck && data.deck ? { deck: data.deck } : {}),
          ...(!variant.noDeck && group ? { group } : {}),
        });
      };
      const unsubscribeDetails = app.ui.subscribe('details', (next) => {
        if (decorated || next?.status !== 'ready' || Object.keys(next.targets).length === 0) return;
        decorated = true;
        if (variant.target) {
          const targets: DetailsReadyState['targets'] = variant.target === 'unresolved' ? {} : Object.fromEntries(
            Object.entries(next.targets).map(([identity, target]) => [identity, { ...target,
              pending: variant.target === 'pending',
              ...(variant.target === 'error' ? { error: 'The learning item could not be saved. State specimen; no database failure injected.' } : {}),
            }]),
          );
          app.ui.setNs('details', { ...next, targets });
        }
        if (variant.all) app.ui.transition('details/toggle-all');
        else if (variant.selected !== undefined) app.ui.transition('details/select-part', { index: variant.selected });
        if (variant.regeneration) {
          setOutcome('/phrase-breakdown', variant.regeneration);
          app.ui.transition('details/regenerate');
        }
      });
      const unsubscribeContent = app.ui.subscribe('content', open);
      open();
      return () => { unsubscribeContent(); unsubscribeDetails(); };
    },
  });
  return {
    ...scenario,
    render(args) { controls = args; return scenario.render(); },
    play: async () => {
      await waitFor(() => expect(getScenario().root.querySelector('[role="dialog"]')).toBeVisible());
      await waitFor(() => expect(getScenario().root.querySelector('[data-region="details-source"]')?.textContent?.trim()).toBeTruthy());
      if (variant.outcome !== 'pending') {
        await waitFor(() => expect(getScenario().app.ui.get('details')?.status).toBe(variant.outcome === 'error' || variant.outcome === 'invalid' ? 'error' : 'ready'));
      }
      logScenarioEvent('Breakdown specimen ready', variant.target ? `${variant.target} target state specimen` : 'Production details owner');
    },
  };
}

export const SelectedPrimaryWord: Story = specimen();
export const SelectedPrimaryChunk: Story = specimen({ selected: 1 });
export const AllParts: Story = specimen({ all: true });
export const SingleChunk: Story = specimen({ single: true });
export const NativeReadings: Story = specimen();
export const RomanizedReadings: Story = { ...specimen(), args: { readingDisplay: 'romanization' } };
export const HiddenReadings: Story = { ...specimen(), args: { showReadings: false } };
export const HiddenSourceEnglish: Story = { ...specimen(), args: { showEnglish: false } };
export const ChineseRuby: Story = specimen({ lang: 'zh', all: true });
export const SourceLoading: Story = specimen({ outcome: 'pending' });
export const SourceHttpError: Story = specimen({ outcome: 'error' });
export const SourceMalformedResponse: Story = specimen({ outcome: 'invalid' });
export const UnresolvedTargets: Story = specimen({ target: 'unresolved', all: true });
export const PendingTargets: Story = specimen({ target: 'pending', all: true });
export const TargetSaveError: Story = specimen({ target: 'error', all: true });
export const StarredTarget: Story = specimen({ starred: true });
export const NoDeckSavingUnavailable: Story = specimen({ noDeck: true, all: true });
export const RegeneratingRetainsTeaching: Story = specimen({ regeneration: 'pending', all: true });
export const RegenerationFailureRetainsTeaching: Story = specimen({ regeneration: 'error', all: true });
export const RegeneratedTeaching: Story = specimen({ regeneration: 'success', all: true });
