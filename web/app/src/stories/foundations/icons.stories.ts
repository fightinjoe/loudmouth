import type { Meta, StoryObj } from '@storybook/html-vite';
import { icon, iconNames } from '../../components/icon';
import { escapeHTML } from '../../js/utils';
import './icons.css';

type Args = { color: 'fg-body' | 'fg-secondary' | 'fg-accent' | 'fg-danger'; };
const colors = ['fg-body', 'fg-secondary', 'fg-tertiary', 'fg-caption', 'fg-accent', 'fg-danger'];
const families: [string, RegExp][] = [
  ['Navigation', /^(back|next|menu|more|close|unfold-more|open-in-full|swap(?:-vert)?)$/],
  ['Books & review', /^(book-|cards-|web-stories$|review$)/],
  ['Stars', /^star(?:-fill)?$/],
  ['Audio & reading', /^(sound|hearing|visibility(?:-off)?|text-fields|notes)$/],
  ['Actions & settings', /^(add(?:-box)?|check|edit|delete|reorder|settings)$/],
];

function gallery(variants: (name: string) => string, comparison = false): string {
  const groups = new Map<string, string[]>();
  for (const name of iconNames()) {
    const family = families.find(([, pattern]) => pattern.test(name))?.[0] ?? 'Other';
    const names = groups.get(family) ?? [];
    names.push(name);
    groups.set(family, names);
  }
  const order = [...families.map(([title]) => title), 'Other'];
  return `<div class="workbench-icons${comparison ? ' workbench-icons--colors' : ''}">${order.filter(title => groups.has(title)).map(title => `<section class="workbench-icon-family"><h2>${escapeHTML(title)}</h2><div class="workbench-icon-grid">${groups.get(title)!.map(name => `<article class="workbench-icon-token" data-icon="${escapeHTML(name)}"><div class="workbench-icon-variants">${variants(name)}</div><code>${escapeHTML(name)}</code></article>`).join('')}</div></section>`).join('')}</div>`;
}

const meta = {
  title: 'Foundations/Icons', tags: ['autodocs'],
  args: { color: 'fg-accent' },
  argTypes: { color: { control: 'select', options: ['fg-body', 'fg-secondary', 'fg-accent', 'fg-danger'], description: 'Production semantic foreground class. Icons inherit currentColor.' } },
  parameters: { docs: { description: { component: 'src/components/icon.ts: iconNames() and icon(). Compact sibling groups generated from the complete runtime registry, not a second SVG inventory. Registry tiles show small, default and large production sizes left to right. Color tiles compare body, secondary, tertiary, caption, accent and danger left to right. Inspect data-icon on tiles and data-size / data-color on variants. Decorative SVGs need an accessible label on their interactive owner.' } } },
  render: ({ color }: Args) => gallery(name => `<span class="${color}" data-size="sm" data-color="${color}" title="Small">${icon(name, { size: 'sm' })}</span><span class="${color}" data-size="default" data-color="${color}" title="Default">${icon(name)}</span><span class="${color}" data-size="lg" data-color="${color}" title="Large">${icon(name, { size: 'lg' })}</span>`),
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;
export const RegistryAndSizes: Story = {};
export const SemanticColors: Story = { render: () => gallery(name => colors.map(color => `<span class="${color}" data-color="${color}" data-size="default" title="${color}">${icon(name)}</span>`).join(''), true) };
