import type { Meta, StoryObj } from '@storybook/html-vite';
import { mountedStory } from '../support/mounted-story';
import { escapeHTML } from '../../js/utils';
import './colors.css';

type Palette = 'primitive' | 'semantic' | 'textbook' | 'phrasebook';
const palettes: { id: Palette; title: string; families: [string, string[]][] }[] = [
  { id: 'primitive', title: 'Primitives', families: [
    ['Neutrals', ['white', 'beige-100', 'beige-400']],
    ['Gray', ['gray-50', 'gray-100', 'gray-200', 'gray-200-tint', 'gray-300', 'gray-400', 'gray-500', 'gray-900']],
    ['Blue', ['blue-100', 'blue-200', 'blue-300', 'blue-500']],
    ['Red', ['red-500']],
    ['Yellow', ['yellow-100', 'yellow-500']],
  ] },
  { id: 'semantic', title: 'Semantic', families: [
    ['Foreground · fg-*', ['fg-body', 'fg-secondary', 'fg-tertiary', 'fg-caption', 'fg-reading']],
    ['Background · bg-*', ['bg-primary', 'bg-secondary', 'bg-surface', 'bg-blue', 'bg-blue-tint', 'bg-speaker', 'bg-red', 'bg-yellow']],
    ['Border', ['border-default']],
    ['Actions', ['accent', 'danger']],
  ] },
  { id: 'textbook', title: 'Textbook', families: [
    ['Paper', ['textbook-paper']],
    ['Green', ['textbook-green', 'textbook-green-soft']],
    ['Blue', ['textbook-blue', 'textbook-blue-soft']],
  ] },
  { id: 'phrasebook', title: 'Phrasebook accent', families: [
    ['Accent', ['phrasebook-accent', 'phrasebook-accent-2', 'phrasebook-accent-soft', 'phrasebook-accent-wash']],
    ['Starred', ['phrasebook-star-bg', 'phrasebook-star-line']],
    ['Title bubble', ['phrasebook-bubble-top', 'phrasebook-bubble-bottom']],
  ] },
];

// Computed colors serialize as sRGB or, for color-mix tokens, in their mixing
// space; a canvas pixel normalizes both to sRGB. Inspection metadata derives from
// that final color rather than duplicating authored token values.
const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
function toRgb(color: string): string {
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}
function toHsl(rgb: string): string {
  const [r, g, b] = rgb.match(/[\d.]+/g)!.slice(0, 3).map(value => Number(value) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  if (delta) {
    hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  const rounded = (value: number) => Number(value.toFixed(1));
  return `hsl(${rounded(hue)} ${rounded(saturation * 100)}% ${rounded(lightness * 100)}%)`;
}

function palette(selection: Palette | 'all'): HTMLElement {
  return mountedStory((host) => {
    host.className = 'workbench-colors';
    for (const { id, title, families } of palettes) {
      if (selection !== 'all' && selection !== id) continue;
      const section = document.createElement('section');
      section.className = 'workbench-color-section';
      section.innerHTML = `<h2>${title}</h2><div class="workbench-color-families"></div>`;
      host.append(section);
      const groups = section.querySelector('.workbench-color-families')!;
      for (const [family, tokens] of families) {
        const group = document.createElement('section');
        group.className = 'workbench-color-family';
        group.innerHTML = `<h3>${escapeHTML(family)}</h3><div class="workbench-color-swatches"></div>`;
        groups.append(group);
        const swatches = group.querySelector('.workbench-color-swatches')!;
        group.style.width = `${Math.min(tokens.length, 4) * 104 + 20}px`;
        for (const name of tokens) {
          const card = document.createElement('article');
          card.className = 'workbench-color-token';
          card.dataset.token = `--${name}`;
          const expression = id === 'primitive' ? `hsl(var(--${name}))` : `var(--${name})`;
          card.innerHTML = `<div class="workbench-color-swatch" style="background-color:${expression}"></div><code>--${name}</code>`;
          swatches.append(card);
          const swatch = card.querySelector<HTMLElement>('.workbench-color-swatch')!;
          const computed = getComputedStyle(swatch);
          const value = computed.getPropertyValue(`--${name}`).trim();
          const resolved = id === 'primitive' ? `hsl(${value})` : value;
          if (value && CSS.supports('color', resolved)) {
            card.dataset.rgb = toRgb(computed.backgroundColor);
            card.dataset.hsl = toHsl(card.dataset.rgb);
          } else {
            card.dataset.invalid = 'true';
            const error = document.createElement('strong');
            error.textContent = 'Unresolved color';
            card.append(error);
          }
        }
      }
    }
    return () => {};
  });
}
const meta = { title: 'Foundations/Colors', tags: ['autodocs'], parameters: { docs: { description: { component: 'src/styles/variables.css and textbook.css. Sibling tokens are grouped in compact swatches using the final production cascade, including textbook overrides and the --phrasebook-* accent family derived from --phrasebook-accent with color-mix. Inspect each [data-token] element for computed data-rgb and data-hsl values. Primitive triplets use hsl(); semantic, textbook and phrasebook tokens use var() directly. No color values are duplicated in the catalog.' } } }, render: () => palette('all') } satisfies Meta;
export default meta;
type Story = StoryObj;
export const FinalTheme: Story = {};
export const PrimitiveTriplets: Story = { render: () => palette('primitive') };
export const SemanticRoles: Story = { render: () => palette('semantic') };
export const TextbookOverrides: Story = { render: () => palette('textbook') };
export const PhrasebookAccent: Story = { render: () => palette('phrasebook') };
