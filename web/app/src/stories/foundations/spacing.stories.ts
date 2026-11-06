import type { Meta, StoryObj } from '@storybook/html-vite';
import { mountedStory } from '../support/mounted-story';
import { renderCardRow } from '../../components/card';
import { renderPaneHeader, headerTitle } from '../../components/pane-header';
import { fixtureEntry } from '../support/fixtures';

function spacing(): HTMLElement {
  return mountedStory((host) => {
    host.className = 'workbench-gallery';
    host.innerHTML = `<h1 class="text-h2">Spacing: shared gaps and local geometry</h1><p class="workbench-caption">Only gap-sm and gap-md are shared spacing tokens. Card, pane and control measurements below remain component-local; they are not a proposed universal scale.</p>${['sm', 'md'].map((size) => `<section><h2 class="text-body-lg">--space-${size} / .gap-${size}</h2><div class="flex gap-${size}" data-spacing=".gap-${size}: utilities.css → variables.css"><span class="bg-accent" style="width:64px;height:32px"></span><span class="bg-accent" style="width:64px;height:32px"></span></div></section>`).join('')}<section data-spacing="Pane header: components.css (local)">${renderPaneHeader({ title: headerTitle('Pane header padding') })}</section><div id="content-pane"><div class="deck-view-list">${renderCardRow(fixtureEntry())}</div></div><label>Field padding<input class="surface-field" value="Local field padding" data-spacing=".surface-field: utilities.css (local)"></label><button class="btn btn-primary" data-spacing=".btn: base.css (local)">Local button padding</button><section data-results><h2 class="text-h2">Computed measurements</h2></section>`;
    const results = host.querySelector('[data-results]')!;
    for (const element of host.querySelectorAll<HTMLElement>('[data-spacing], .pane-header, .deck-view-list, .card-row, .card-term')) {
      const style = getComputedStyle(element);
      const result = document.createElement('p');
      result.className = 'workbench-caption';
      const token = element.classList.contains('gap-sm') ? '--space-sm' : element.classList.contains('gap-md') ? '--space-md' : undefined;
      result.textContent = `${element.dataset.spacing ?? `${element.className}: components.css (local)`}: gap ${style.gap}; padding ${style.padding}; margin ${style.margin}${token ? `; ${token} = ${style.getPropertyValue(token).trim() || 'UNRESOLVED'}` : ''}`;
      results.append(result);
    }
    return () => {};
  });
}
const meta = { title: 'Foundations/Spacing', tags: ['autodocs'], parameters: { docs: { description: { component: 'src/styles/variables.css and utilities.css expose only --space-sm (0.25rem) and --space-md (0.5rem), preserving existing geometry. Production renderCardRow and renderPaneHeader demonstrate component-local spacing without normalizing it.' } } }, render: spacing } satisfies Meta;
export default meta;
type Story = StoryObj;
export const SharedGapsAndLocalSpacing: Story = {};
