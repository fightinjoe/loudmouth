import type { Meta, StoryObj } from '@storybook/html-vite';
import { renderPhrasebookRow, type PhrasebookRowOptions } from '../../components/phrasebook-row';
import { mountedStory } from '../support/mounted-story';
import { LONG_TEXT, HOSTILE_TEXT } from '../support/fixtures';
import { escapeHTML } from '../../js/utils';

type Args = { title: string; subtitle: string; selected: boolean; leading: string; chevron: boolean; suggestion: boolean };
function row(args: Args): string {
  return renderPhrasebookRow({ ...args, rowAction: 'navigation/select-deck', rowData: { deckId: 'specimen-book', lang: 'ja' }, pill: args.suggestion ? { label: 'View', action: 'navigation/preview', data: { suggestionId: 'specimen-suggestion' } } : null });
}
function mount(html: string): HTMLElement {
  return mountedStory((host) => {
    host.className = 'workbench-gallery';
    host.innerHTML = `${html}<output class="workbench-caption" aria-live="polite">Click a row or pill to inspect the nearest action payload.</output>`;
    const log = (event: Event): void => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null;
      if (target) host.querySelector('output')!.textContent = JSON.stringify(target.dataset);
    };
    host.addEventListener('click', log);
    return () => host.removeEventListener('click', log);
  });
}
const meta = { title: 'Components/PhrasebookRow', tags: ['autodocs'], args: { title: 'At the café', subtitle: 'Japanese · 12 cards', selected: false, leading: '', chevron: true, suggestion: false }, argTypes: {
  title: { control: 'text', description: 'Escaped row title.' }, subtitle: { control: 'text', description: 'Optional escaped secondary line; blank omits it.' }, selected: { control: 'boolean', description: 'Sets the existing data-selected treatment.' }, leading: { control: 'text', description: 'Optional decorative text; always escaped, never HTML.' }, chevron: { control: 'boolean', description: 'Chevron takes precedence over a suggestion pill.' }, suggestion: { control: 'boolean', description: 'Adds a separate View action unless chevron is enabled.' },
}, parameters: { docs: { description: { component: 'src/components/phrasebook-row.ts: renderPhrasebookRow. Navigation/suggestion row with escaped labels and validated camelCase data keys. The div row currently relies on its production owner for keyboard behavior; this visual specimen logs click payloads and does not pretend to navigate.' } } }, render: (args: Args) => mount(row(args)) } satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;
export const Playground: Story = {};
export const Variants: Story = { render: () => {
  const rows: [string, PhrasebookRowOptions][] = [
    ['Plain', { title: 'At the café' }], ['Subtitle', { title: 'At the café', subtitle: 'Japanese · 12 cards' }], ['Selected', { title: 'Current phrasebook', selected: true }], ['Leading text', { title: 'Japanese', leading: 'JA' }], ['Chevron', { title: 'All saved cards', chevron: true }], ['Suggestion pill', { title: 'Meeting friends', pill: { label: 'View', action: 'navigation/preview', data: { suggestionId: 'friends' } } }], ['Chevron wins over pill', { title: 'One trailing affordance', chevron: true, pill: { label: 'Hidden View', action: 'navigation/preview' } }], ['Long title and subtitle', { title: LONG_TEXT, subtitle: LONG_TEXT }], ['Hostile literal text and payload', { title: HOSTILE_TEXT, subtitle: HOSTILE_TEXT, leading: '<JA>', rowAction: 'navigation/select-deck', rowData: { deckId: HOSTILE_TEXT } }],
  ];
  return mount(rows.map(([label, options]) => `<section><h2 class="workbench-caption">${escapeHTML(label)}</h2>${renderPhrasebookRow({ rowAction: 'navigation/select-deck', rowData: { deckId: 'example' }, ...options })}</section>`).join(''));
} };
export const SuggestionPill: Story = { args: { chevron: false, suggestion: true } };
export const ChevronPrecedence: Story = { args: { chevron: true, suggestion: true } };
export const LongAndHostileText: Story = { args: { title: LONG_TEXT, subtitle: HOSTILE_TEXT } };
