import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { openJsonPanel, toImportJson, type JsonPanelHandle } from '../../components/json-panel';
import { fixtureEntry, FIXTURE_LANGUAGES, textFixtureEntry } from '../support/fixtures';
import { appStory, getScenario, logScenarioEvent, onScenarioCleanup, replaceScenarioProperty, trackScenarioWork } from '../support/scenario';

const meta = {
  title: 'Components/JsonPanel', tags: ['autodocs'], argTypes: {},
  parameters: { docs: { description: { component: 'src/components/json-panel.ts · openJsonPanel and toImportJson. Read-only current-schema export deduplicates cards and Word evidence; membership metadata is excluded. Actual textarea rendering treats hostile text literally. Clipboard variants replace only browser API descriptors in this iframe and log requested bytes; they never write the system clipboard. Back uses production close animation/fallback; owner disposal is immediate.' } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
type Clipboard = 'success' | 'error' | 'fallback' | 'pending';
function json(sample: 'short' | 'long' | 'unicode' | 'hostile' | 'evidence' = 'short', clipboard: Clipboard = 'success', early = false): Story {
  let panel: JsonPanelHandle;
  let settle: (() => void) | undefined;
  const story: Story = { ...appStory({ library: 'empty', setup() {
    if (clipboard === 'fallback') {
      replaceScenarioProperty(navigator, 'clipboard', { value: undefined });
      replaceScenarioProperty(document, 'execCommand', { value: (command: string) => { logScenarioEvent('Legacy clipboard request', command); return true; } });
    } else {
      replaceScenarioProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => {
        logScenarioEvent('Clipboard write requested', `${text.length} characters`);
        if (clipboard === 'error') throw new Error('Fixture clipboard permission denied');
        if (clipboard === 'pending') await trackScenarioWork(new Promise<void>((resolve) => { settle = resolve; }));
      } } });
    }
    onScenarioCleanup(() => settle?.());
  }, mount(root) {
    const word = fixtureEntry('word');
    const entries = sample === 'unicode' ? FIXTURE_LANGUAGES.map((lang) => fixtureEntry('phrase', lang))
      : sample === 'evidence' ? [word, structuredClone(word), fixtureEntry('chunk')]
        : [sample === 'long' || sample === 'hostile' ? textFixtureEntry(sample) : fixtureEntry()];
    panel = openJsonPanel(root, 'Export JSON', toImportJson(entries), () => logScenarioEvent('JSON dismissed'));
    if (early) panel.close();
    return () => panel.dispose();
  } }) };
  if (clipboard === 'pending') story.play = async () => {
    const { root } = getScenario();
    await userEvent.click(root.querySelector('#btn-copy-json')!);
    panel.dispose();
    settle?.();
    await waitFor(() => expect(root.querySelector('.json-panel')).toBeNull());
    logScenarioEvent('Disposed during pending copy; late completion ignored');
  };
  return story;
}
export const Short: Story = json();
export const Long: Story = json('long');
export const Unicode: Story = json('unicode');
export const HostileLiteral: Story = json('hostile');
export const DeduplicatedEvidence: Story = { ...json('evidence'), play: async () => {
  const text = getScenario().root.querySelector<HTMLTextAreaElement>('.json-pane-textarea')!.value;
  const value = JSON.parse(text);
  expect(value.cards).toHaveLength(2);
  expect(value.cards[0].sources).toHaveLength(1);
  expect(value.cards[0]).not.toHaveProperty('membership');
} };
export const CopySuccessAndReset: Story = { ...json(), play: async () => {
  const { root } = getScenario();
  await userEvent.click(root.querySelector('#btn-copy-json')!);
  await waitFor(() => expect(root.querySelector('#btn-copy-json')).toHaveTextContent('Copied!'));
  await waitFor(() => expect(root.querySelector('#btn-copy-json')!.textContent).toBe('Copy'), { timeout: 2200 });
} };
export const CopyRejected: Story = { ...json('short', 'error'), play: async () => {
  const { root } = getScenario();
  await userEvent.click(root.querySelector('#btn-copy-json')!);
  await waitFor(() => expect(root.querySelector('#btn-copy-json')).toHaveTextContent('Copy failed'));
} };
export const LegacyClipboardFallback: Story = { ...json('unicode', 'fallback'), play: async () => {
  const { root } = getScenario();
  await userEvent.click(root.querySelector('#btn-copy-json')!);
  await waitFor(() => expect(root.querySelector('#btn-copy-json')).toHaveTextContent('Copied!'));
  expect(root.querySelector('.json-pane-textarea')).toHaveAttribute('readonly');
} };
export const Back: Story = { ...json(), play: async () => {
  const { root } = getScenario();
  await userEvent.click(root.querySelector('.json-pane-back')!);
  await waitFor(() => expect(root.querySelector('.json-panel')).toBeNull());
} };
export const EarlyClose: Story = { ...json('short', 'success', true), play: async () => {
  expect(getScenario().root.querySelector('.json-panel')).toBeNull();
} };
export const PendingCopyOwnerDisposal: Story = json('short', 'pending');
