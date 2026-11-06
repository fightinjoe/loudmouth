import type { Meta, StoryObj } from '@storybook/html-vite';
import { icon } from '../../components/icon';
import { escapeHTML } from '../../js/utils';
import { mountedStory } from '../support/mounted-story';
import { LONG_TEXT } from '../support/fixtures';

type Args = { label: string; disabled: boolean; emphasis: 'primary' | 'secondary'; focus: boolean };
function controls(args: Args): HTMLElement {
  return mountedStory((host) => {
    host.className = 'workbench-gallery';
    const disabled = args.disabled ? ' disabled' : '';
    host.innerHTML = `<h1 class="text-h2">Production CSS controls</h1><section><button class="btn btn-${args.emphasis}"${disabled} data-main>${escapeHTML(args.label)}</button><button class="btn btn-secondary"${disabled}>Secondary action</button><button class="icon-button" aria-label="Settings"${disabled}>${icon('settings')}</button></section><fieldset class="flex-col gap-md" style="border:0"><legend class="section-label">Grouped fields</legend><label class="flex-col gap-sm">Phrasebook name<input class="surface-field" value="At the café"${disabled}></label><label class="flex-col gap-sm">Language<select class="surface-field"${disabled}><option>Japanese</option><option>Chinese</option><option>Czech</option></select></label><label class="flex-col gap-sm">Situation<textarea class="surface-field text-area" rows="3"${disabled}>Ordering tea with friends</textarea></label><label class="flex-col gap-sm">Fixed-height note<textarea class="surface-field text-area-fixed" rows="2"${disabled}>Existing non-resizable field variant</textarea></label></fieldset><p class="workbench-caption">Tab through controls for the actual :focus-visible treatment. Disabled is native behavior; the shared .btn CSS does not currently dim every disabled button.</p><output class="workbench-caption" aria-live="polite">No control events yet.</output>`;
    const log = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches('button,input,select,textarea')) return;
      host.querySelector('output')!.textContent = `${event.type}: ${target.getAttribute('aria-label') ?? target.closest('label')?.textContent?.trim() ?? target.textContent?.trim()}`;
    };
    host.addEventListener('click', log);
    host.addEventListener('change', log);
    if (args.focus) host.querySelector<HTMLButtonElement>('[data-main]')!.focus({ preventScroll: true });
    return () => { host.removeEventListener('click', log); host.removeEventListener('change', log); };
  });
}
const meta = { title: 'Components/Controls', tags: ['autodocs'], args: { label: 'Continue', disabled: false, emphasis: 'primary', focus: false }, argTypes: {
  label: { control: 'text', description: 'Literal button label; escaped before rendering.' }, disabled: { control: 'boolean', description: 'Native disabled attribute on all specimen controls.' }, emphasis: { control: 'radio', options: ['primary', 'secondary'], description: 'Existing .btn-primary / .btn-secondary variants.' }, focus: { control: 'boolean', description: 'Focuses the first button after mounting; Tab reveals keyboard focus styling.' },
}, parameters: { docs: { description: { component: 'CSS-only primitives from src/styles/base.css (.btn), utilities.css (.surface-field, .text-area) and components.css (.icon-button). Minimal specimen markup, not a replacement application form. Change/click events are logged locally; no persistence or submission is implied.' } } }, render: controls } satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;
export const NormalAndGroupedFields: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const Focus: Story = { args: { focus: true } };
export const LongLabel: Story = { args: { label: LONG_TEXT } };
