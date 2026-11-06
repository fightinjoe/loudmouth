import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { db, updateDeckName } from '../../js/db';
import { appStory, getScenario, logScenarioEvent, replaceScenarioProperty } from '../support/scenario';
import { LONG_TITLE } from '../support/fixtures';

const meta = {
  title: 'Components/Settings', tags: ['autodocs'], argTypes: {},
  parameters: { docs: { description: { component: 'src/components/deck-settings.ts · openDeckSettings, mounted through the real action owner. All operations use the sandbox Dexie database. Current labels, mode/order/reading cycles, native rename/confirmation, export replacement and deletion are unchanged. The default uses real native dialogs; named scripted variants replace browser APIs only in this iframe and restore descriptors on teardown. Existing persistence errors have no inline error UI; action sheets lack details-style Escape/focus trapping.' } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
function settings(promptAnswer?: string | null, confirmation?: boolean, long = false): Story {
  return { ...appStory({ initial: 'textbook', setup: async (data) => {
    if (promptAnswer !== undefined) replaceScenarioProperty(window, 'prompt', { value: () => promptAnswer });
    if (confirmation !== undefined) replaceScenarioProperty(window, 'confirm', { value: () => confirmation });
    if (long) { await updateDeckName(data.deck!.id, LONG_TITLE); data.deck!.name = LONG_TITLE; }
  }, mount(_root, data, app) {
    app.ui.transition('action/open', { kind: 'settings', payload: { deck: data.deck!, cards: data.entries } });
  } }) };
}
export const CurrentLabels: Story = settings();
export const LongName: Story = settings(undefined, undefined, true);
export const RenameAccepted: Story = { ...settings('  Café with friends  '), play: async () => {
  const { root, data } = getScenario();
  await userEvent.click(root.querySelector('#ds-name-row')!);
  await waitFor(async () => expect((await db.decks.get(data.deck!.id))!.name).toBe('Café with friends'));
  expect(root.querySelector('#ds-name-value')).toHaveTextContent('Café with friends');
} };
function unchangedRename(answer: string | null): Story {
  return { ...settings(answer), play: async () => {
    const { root, data } = getScenario();
    await userEvent.click(root.querySelector('#ds-name-row')!);
    expect((await db.decks.get(data.deck!.id))!.name).toBe(data.deck!.name);
  } };
}
export const RenameCancelled: Story = unchangedRename(null);
export const RenameBlank: Story = unchangedRename('   ');
export const ModeOrderReadingCycles: Story = { ...settings(), play: async () => {
  const { root, data } = getScenario();
  for (const mode of ['review', 'reverse', 'study']) {
    await userEvent.click(root.querySelector('#ds-mode-row')!);
    await waitFor(async () => expect((await db.decks.get(data.deck!.id))!.mode).toBe(mode));
  }
  for (const order of ['random', 'reverse', 'default']) {
    await userEvent.click(root.querySelector('#ds-order-row')!);
    await waitFor(async () => expect((await db.decks.get(data.deck!.id))!.order).toBe(order));
  }
  for (const readingDisplay of ['romanization', 'reading']) {
    await userEvent.click(root.querySelector('#ds-reading-display-row')!);
    await waitFor(async () => expect((await db.decks.get(data.deck!.id))!.readingDisplay).toBe(readingDisplay));
  }
  logScenarioEvent('Settings cycles persisted');
} };
export const ExportReplacesSettings: Story = { ...settings(), play: async () => {
  const { root } = getScenario();
  await userEvent.click(root.querySelector('#ds-export-row')!);
  await waitFor(() => expect(root.querySelector('.json-pane-textarea')).not.toBeNull());
  await waitFor(() => expect(root.querySelector('.deck-settings-panel')).toBeNull());
} };
export const DeleteCancelled: Story = { ...settings(undefined, false), play: async () => {
  const { root, data } = getScenario();
  await userEvent.click(root.querySelector('#ds-delete-row')!);
  expect(await db.decks.get(data.deck!.id)).toBeDefined();
} };
export const DeleteConfirmed: Story = { ...settings(undefined, true), play: async () => {
  const { root, data } = getScenario();
  await userEvent.click(root.querySelector('#ds-delete-row')!);
  await waitFor(async () => expect(await db.decks.get(data.deck!.id)).toBeUndefined());
  expect(await db.cards.count()).toBeGreaterThan(0);
  logScenarioEvent('Deleted phrasebook; saved cards retained');
} };
