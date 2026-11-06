import type { Meta, StoryObj } from '@storybook/html-vite';
import { mountedStory } from '../support/mounted-story';
import { openBottomSheet, type BottomSheetHandle } from '../../components/bottom-sheet';
import { renderPaneHeader, headerTitle, headerIconButton } from '../../components/pane-header';

function surfaces(): HTMLElement {
  return mountedStory((host) => {
    host.className = 'workbench-gallery';
    host.innerHTML = `<h1 class="text-h2">Surfaces, focus and motion</h1>${['radius', 'radius-sm', 'radius-pill'].map((token) => `<section class="workbench-specimen"><div class="bg-surface" data-token="${token}" style="padding:24px;border-radius:var(--${token})">--${token}</div><p class="workbench-caption" data-value="${token}"></p></section>`).join('')}<section class="bg-surface" style="padding:24px;box-shadow:var(--shadow-float)" data-shadow>Floating surface · --shadow-float</section><label>Surface field and real focus treatment<input class="surface-field" value="Tab here to inspect focus"></label><section class="scrim-visible" style="padding:24px"><span class="bg-surface">.scrim-visible (local overlay color)</span></section><section class="bg-surface" style="padding:16px"><div class="sheet-handle"></div><p class="workbench-caption">Production .sheet-handle</p></section><p class="workbench-caption" data-motion></p><button class="btn btn-primary" data-open>Open actual animated sheet</button><div id="details-layer" data-details-state="closed"><div class="details-reveal"></div></div><p class="workbench-caption" data-detail-motion></p><p class="workbench-caption">Activate Reduce motion in your OS or browser rendering tools. Details transitions are disabled by the real media query; action sheets retain their existing transition. This specimen does not override either behavior. Sheets currently lack the details panel’s Escape handling and focus trap.</p><output class="workbench-caption" aria-live="polite"></output>`;
    for (const sample of host.querySelectorAll<HTMLElement>('[data-token]')) {
      host.querySelector(`[data-value="${sample.dataset.token}"]`)!.textContent = `Computed border-radius: ${getComputedStyle(sample).borderRadius}; source: variables.css`;
    }
    const shadow = host.querySelector<HTMLElement>('[data-shadow]')!;
    shadow.append(document.createTextNode(` · ${getComputedStyle(shadow).boxShadow}`));
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = (): void => {
      host.querySelector('[data-motion]')!.textContent = `Actual prefers-reduced-motion: ${media.matches ? 'reduce' : 'no-preference'}`;
      host.querySelector('[data-detail-motion]')!.textContent = `Details .details-reveal computed transition: ${getComputedStyle(host.querySelector('.details-reveal')!).transition}`;
    };
    updateMotion();
    media.addEventListener('change', updateMotion);
    let sheet: BottomSheetHandle | undefined;
    const open = (): void => {
      sheet?.dispose();
      sheet = openBottomSheet(host, { kind: 'settings', size: 'hug', bodyHTML: renderPaneHeader({ leading: headerIconButton('close', { action: 'specimen/close', label: 'Close surface sample' }), title: headerTitle('Sheet surface') }), onMount: (panel, _scrim, close) => { panel.querySelector('button')!.addEventListener('click', close); }, onClose: () => { host.querySelector('output')!.textContent = 'Sheet dismissed'; } });
      host.querySelector('output')!.textContent = `Sheet computed transition: ${getComputedStyle(sheet.panel).transition}`;
    };
    host.querySelector('[data-open]')!.addEventListener('click', open);
    return () => { sheet?.dispose(); media.removeEventListener('change', updateMotion); host.querySelector('[data-open]')?.removeEventListener('click', open); };
  });
}
const meta = { title: 'Foundations/Surfaces', tags: ['autodocs'], parameters: { docs: { description: { component: 'src/styles/variables.css, utilities.css, base.css and phrase-breakdown.css; openBottomSheet in components/bottom-sheet.ts supplies the real sheet. Radius/shadow values are computed, not copied. Motion follows actual prefers-reduced-motion and deliberately exposes the current details/sheet inconsistency.' } } }, render: surfaces } satisfies Meta;
export default meta;
type Story = StoryObj;
export const SurfacesAndFocus: Story = {};
export const ActualMotionPreference: Story = { parameters: { docs: { description: { story: 'Use the Open actual animated sheet control with browser/system reduced motion enabled and disabled. The current preference and both computed transition declarations remain visible.' } } } };
