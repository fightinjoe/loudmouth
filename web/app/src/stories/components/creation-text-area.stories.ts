import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, userEvent, within } from 'storybook/test';
import { bindCreationTextArea, renderCreationTextArea } from '../../components/creation-text-area';
import { headerIconButton } from '../../components/pane-header';
import { mountedStory } from '../support/mounted-story';
import { HOSTILE_TEXT, LONG_TEXT } from '../support/fixtures';

type Args = { value: string };
const meta = {
  title: 'Components/Textarea',
  tags: ['autodocs'],
  args: { value: '' },
  argTypes: { value: { control: 'text', description: 'Untrimmed situation text. Submission and request ownership remain in the creation controller.' } },
  parameters: { docs: { description: { component: 'src/components/creation-text-area.ts: renderCreationTextArea and bindCreationTextArea. The actual guided-creation situation field: auto-growing textarea labelled by its "What are you preparing for?" placeholder, the round submit control and the header clear control, both shown only once text is typed. Enter submits; Shift+Enter adds a line. Shares production input, clear and submit behavior with Creation; no sheet, language selector or API requests. One instance per iframe because the field uses a production ID. Whitespace is retained here; the parent creation controller trims on submission.' } } },
  render: ({ value }: Args) => mountedStory(host => {
    host.className = 'workbench-gallery';
    host.style.minHeight = '0';
    host.innerHTML = `<div class="creation-panel" style="max-width:480px;background:white"><section class="creation-lookup flex-col" data-has-value="${value.length > 0}"><div class="pane-header flex items-center"><span class="pane-header-spacer"></span>${headerIconButton('close', { action: 'creation/clear', label: 'Clear situation', className: 'creation-clear' })}</div><div class="creation-term flex">${renderCreationTextArea(value)}</div></section></div><output class="workbench-caption" aria-live="polite">Type, submit or clear the situation to inspect changes.</output>`;
    const output = host.querySelector('output')!;
    return bindCreationTextArea(host.querySelector<HTMLElement>('.creation-lookup')!, {
      value,
      onInput: next => { output.textContent = `input: ${JSON.stringify(next)}`; },
      onClear: () => { output.textContent = 'clear: empty value; focus returned to textarea'; },
      onSubmit: next => { output.textContent = `submit: ${JSON.stringify(next)}`; },
    });
  }),
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;
export const Empty: Story = {};
export const Filled: Story = { args: { value: 'Ordering lunch at a neighborhood café' } };
export const Focused: Story = { play: async ({ canvasElement }) => { await userEvent.click(within(canvasElement).getByRole('textbox')); } };
export const LongText: Story = { args: { value: LONG_TEXT } };
export const Multilingual: Story = { args: { value: '日本の喫茶店で注文する\n在咖啡馆点餐\nUn café, por favor.\nProsím jednu kávu.\nКаву, будь ласка.' } };
export const HostileLiteral: Story = { args: { value: HOSTILE_TEXT } };
export const TypeAndClear: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox');
    const clear = canvasElement.querySelector<HTMLButtonElement>('[data-action="creation/clear"]')!;
    await expect(clear).not.toBeVisible();
    await userEvent.type(input, 'Ordering tea at a café');
    await expect(input).toHaveValue('Ordering tea at a café');
    await expect(clear).toBeVisible();
    await userEvent.click(clear);
    await expect(input).toHaveValue('');
    await expect(clear).not.toBeVisible();
    await expect(input).toHaveFocus();
  },
};
