import type { Meta, StoryObj } from '@storybook/html-vite';
import { renderRadioList, renderChecklistItem } from '../../components/creation-choices';
import { CONTENT_LANGUAGES, LANG_NAMES } from '../../js/lang';
import { ABILITIES, ABILITY_LABELS } from '../../js/ability';
import { LONG_TEXT, HOSTILE_TEXT } from '../support/fixtures';
import { mountedStory } from '../support/mounted-story';

type Args = { group: 'language' | 'ability'; selected: string; checked: boolean; checklistLabel: string };
function radio(args: Args): string {
  return args.group === 'language'
    ? renderRadioList(CONTENT_LANGUAGES, { name: 'specimen-language', action: 'creation/language', selected: args.selected, label: (lang) => LANG_NAMES[lang] })
    : renderRadioList(ABILITIES, { name: 'specimen-ability', action: 'creation/answer', selected: args.selected, label: (ability) => ABILITY_LABELS[ability] });
}
function specimen(html: string): HTMLElement {
  return mountedStory((host) => {
    host.className = 'workbench-gallery';
    host.innerHTML = `<div class="creation-panel-inner">${html}</div><output class="workbench-caption" aria-live="polite">Select a native radio or activate a checklist item to inspect its payload. Checklist state is a renderer specimen: use Controls to change it.</output>`;
    const log = (event: Event): void => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null;
      if (target) host.querySelector('output')!.textContent = `${event.type}: ${JSON.stringify(target.dataset)}${target instanceof HTMLInputElement ? `; value=${target.value}` : ''}`;
    };
    host.addEventListener('click', log);
    host.addEventListener('change', log);
    return () => { host.removeEventListener('click', log); host.removeEventListener('change', log); };
  });
}
const meta = { title: 'Components/CreationChoices', tags: ['autodocs'], args: { group: 'language', selected: '', checked: true, checklistLabel: 'Ordering drinks' }, argTypes: {
  group: { control: 'radio', options: ['language', 'ability'], description: 'Production content-language or ability option set.' }, selected: { control: 'select', options: ['', ...CONTENT_LANGUAGES, ...ABILITIES], description: 'Matching option value checks one radio; blank or an option from the other set leaves all unselected.' }, checked: { control: 'boolean', description: 'Static checklist pressed/checkmark state.' }, checklistLabel: { control: 'text', description: 'Escaped literal checklist label.' },
}, parameters: { docs: { description: { component: 'src/components/creation-choices.ts: renderRadioList and renderChecklistItem, extracted without markup changes from openCreationPanel. Labels and values are escaped; extra is trusted internal HTML only. Native radio behavior is live, while checklist state and Next/Other answer semantics belong to the production creation controller, not this specimen.' } } }, render: (args: Args) => specimen(`<section><h2 class="workbench-caption">${args.group} choices</h2>${radio(args)}</section><section><h2 class="workbench-caption">Checklist</h2>${renderChecklistItem({ label: args.checklistLabel, checked: args.checked }, 0)}</section>`) } satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;
export const Playground: Story = {};
export const AllLanguagesUnselected: Story = { args: { selected: '' } };
export const SelectedLanguage: Story = { args: { selected: 'uk' } };
export const AbilityOptions: Story = { args: { group: 'ability', selected: 'basics' } };
export const CheckedAndUnchecked: Story = { render: () => specimen(`<section><h2 class="workbench-caption">Checked</h2>${renderChecklistItem({ label: 'Ordering drinks', checked: true }, 0)}</section><section><h2 class="workbench-caption">Unchecked</h2>${renderChecklistItem({ label: 'Paying the bill', checked: false }, 1)}</section>`) };
export const LongAndHostileLabels: Story = { render: () => specimen(renderRadioList([LONG_TEXT, HOSTILE_TEXT], { name: 'long-labels', action: 'creation/answer', selected: HOSTILE_TEXT }) + renderChecklistItem({ label: LONG_TEXT, checked: true }, 0) + renderChecklistItem({ label: HOSTILE_TEXT, checked: false }, 1)) };
export const OtherSlot: Story = { render: () => specimen(`<p class="workbench-caption">The extra slot accepts trusted internal HTML. This minimal Other field demonstrates slot layout, not the creation controller’s answer/Enter/trim semantics. The live controller retains its current “Tell us a little more…” placeholder wording.</p>${renderRadioList(['Friends', 'Family'], { name: 'other-slot', action: 'creation/answer', extra: '<label class="creation-other-label">Other<input class="creation-other-input" aria-label="Other specimen answer" placeholder="Tell us a little more…"></label>' })}`) };
