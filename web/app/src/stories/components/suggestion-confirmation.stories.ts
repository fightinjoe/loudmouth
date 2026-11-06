import type { Meta, StoryObj } from '@storybook/html-vite';
import type { Lang } from '@catchphrase/card-schema';
import { expect, userEvent, waitFor } from 'storybook/test';
import { openNewPhrasebookPanel } from '../../components/new-phrasebook-panel';
import { setLastAbility } from '../../js/preferences';
import { ABILITIES, type Ability } from '../../js/ability';
import { FIXTURE_LANGUAGES, fixtureSuggestion, LONG_TEXT } from '../support/fixtures';
import { appStory, getScenario, logScenarioEvent } from '../support/scenario';

const meta = {
  title: 'Components/SuggestionConfirmation', tags: ['autodocs'], argTypes: {},
  parameters: { docs: { description: { component: 'src/components/new-phrasebook-panel.ts · openNewPhrasebookPanel. Retained suggested-phrasebook confirmation, separate from guided creation. Native selects offer five languages and three abilities; each language restores its remembered ability. This component logs confirmation without saving. The real suggested-preview journey is in Interactions/Panels: changing this selector does not translate the static Japanese preview (existing limitation). Sheets lack details-style Escape/focus trapping.' } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
function confirmation(lang: Lang = 'ja', ability?: Ability, long = false): Story {
  let confirmations = 0;
  return { ...appStory({ library: 'empty', setup() {
    confirmations = 0;
    if (ability) setLastAbility(lang, ability);
  }, mount(root) {
    const suggestion = fixtureSuggestion();
    const sheet = openNewPhrasebookPanel(root, () => logScenarioEvent('Suggestion dismissed'),
      { ...suggestion, lang, title: long ? LONG_TEXT : suggestion.title },
      (value) => { confirmations += 1; logScenarioEvent('Suggestion confirmed', JSON.stringify({ ...value, confirmations })); });
    return () => sheet.dispose();
  } }) };
}
export const Japanese: Story = confirmation('ja');
export const Chinese: Story = confirmation('zh');
export const Spanish: Story = confirmation('es');
export const Czech: Story = confirmation('cs');
export const Ukrainian: Story = confirmation('uk');
export const NoPriorAbility: Story = confirmation('ja', 'none');
export const Basics: Story = confirmation('ja', 'basics');
export const RememberedConversational: Story = { ...confirmation('ja', 'conversational'), play: async () => {
  expect(getScenario().root.querySelector<HTMLSelectElement>('[data-action="new-phrasebook/ability"]')!.value).toBe('conversational');
} };
export const LanguageAndAbilityChoices: Story = { ...confirmation(), play: async () => {
  const { root } = getScenario();
  setLastAbility('cs', 'conversational');
  for (const lang of FIXTURE_LANGUAGES) {
    await userEvent.selectOptions(root.querySelector('select[data-action="new-phrasebook/lang"]')!, lang);
    expect(root.querySelector<HTMLSelectElement>('[data-action="new-phrasebook/lang"]')!.value).toBe(lang);
    expect(root.querySelector<HTMLSelectElement>('[data-action="new-phrasebook/ability"]')!.value).toBe(lang === 'cs' ? 'conversational' : 'basics');
    for (const ability of ABILITIES) {
      await userEvent.selectOptions(root.querySelector('select[data-action="new-phrasebook/ability"]')!, ability);
      expect(root.querySelector<HTMLSelectElement>('[data-action="new-phrasebook/ability"]')!.value).toBe(ability);
    }
  }
} };
export const DoubleConfirmGuard: Story = { ...confirmation(), play: async () => {
  const button = getScenario().root.querySelector<HTMLButtonElement>('[data-action="new-phrasebook/create"]')!;
  await userEvent.dblClick(button);
  expect(button).toBeDisabled();
  const log = document.querySelector('.workbench-log')!;
  await waitFor(() => expect(log).toHaveTextContent('"confirmations":1'));
  expect(log.textContent).not.toContain('"confirmations":2');
} };
export const LongTitle: Story = confirmation('ja', undefined, true);
export const Dismissal: Story = { ...confirmation(), play: async () => {
  const { root } = getScenario();
  await userEvent.click(root.querySelector('.new-phrasebook-scrim')!);
  await waitFor(() => expect(root.querySelector('.new-phrasebook-panel')).toBeNull());
} };
