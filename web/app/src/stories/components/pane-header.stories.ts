import type { Meta, StoryObj } from '@storybook/html-vite';
import { renderPaneHeader, headerIconButton, headerTitle, headerSpacer } from '../../components/pane-header';
import { openReviewPanel } from '../../components/review-panel';
import { mountedStory } from '../support/mounted-story';
import { fixtureDeck, fixtureEntry, LONG_TEXT, HOSTILE_TEXT } from '../support/fixtures';

type Args = { title: string; actionable: boolean; leading: 'back' | 'close' | 'empty'; trailing: 'settings' | 'empty' };
function header(args: Args): string {
  return renderPaneHeader({ leading: args.leading === 'empty' ? headerSpacer() : headerIconButton(args.leading, { action: `header/${args.leading}`, label: args.leading === 'back' ? 'Back' : 'Close' }), title: headerTitle(args.title, args.actionable ? { action: 'header/title' } : {}), trailing: args.trailing === 'empty' ? '' : headerIconButton('settings', { action: 'header/settings', label: 'Settings' }) });
}
function specimen(html: string): HTMLElement {
  return mountedStory((host) => {
    host.className = 'workbench-gallery';
    host.innerHTML = `${html}<output class="workbench-caption" aria-live="polite">Activate a header action to inspect its payload.</output>`;
    const log = (event: Event): void => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null;
      if (target) host.querySelector('output')!.textContent = JSON.stringify(target.dataset);
    };
    host.addEventListener('click', log);
    return () => host.removeEventListener('click', log);
  });
}
const meta = { title: 'Components/PaneHeader', tags: ['autodocs'], args: { title: 'Phrasebook', actionable: false, leading: 'back', trailing: 'settings' }, argTypes: {
  title: { control: 'text', description: 'Escaped literal title; no HTML accepted.' }, actionable: { control: 'boolean', description: 'Use headerTitle action to render a real button rather than a span.' }, leading: { control: 'radio', options: ['back', 'close', 'empty'], description: 'Leading icon or explicit headerSpacer().' }, trailing: { control: 'radio', options: ['settings', 'empty'], description: 'Action icon or automatically balanced empty slot.' },
}, parameters: { docs: { description: { component: 'src/components/pane-header.ts: renderPaneHeader, headerIconButton, headerTitle and headerSpacer. Slots accept trusted internal HTML; text helpers escape user content. Empty side slots reserve 44px. This does not guarantee exact centering when an actual Review direction control is wider.' } } }, render: (args: Args) => specimen(header(args)) } satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;
export const Playground: Story = {};
export const BalancedAndEmptySlots: Story = { render: () => specimen(`<section><p class="workbench-caption">Balanced actions</p>${header({ title: 'Balanced', actionable: false, leading: 'back', trailing: 'settings' })}</section><section><p class="workbench-caption">Both empty slots</p>${renderPaneHeader({ title: headerTitle('Inert title') })}</section><section><p class="workbench-caption">No title or actions</p>${renderPaneHeader()}</section><section><p class="workbench-caption">Close with automatic trailing spacer</p>${header({ title: 'Close', actionable: false, leading: 'close', trailing: 'empty' })}</section>`) };
export const ActionableTitle: Story = { args: { actionable: true } };
export const LongTitle: Story = { args: { title: LONG_TEXT } };
export const HostileTitle: Story = { args: { title: HOSTILE_TEXT } };
export const ReviewDirectionWidth: Story = { render: () => mountedStory((host) => {
  const panel = openReviewPanel(host, fixtureDeck('uk'), [fixtureEntry('phrase', 'uk')], () => {});
  return () => panel.dispose();
}), parameters: { docs: { description: { story: 'The actual openReviewPanel controller supplies its private header, including the wider direction control. Toggle direction to compare language labels. The surrounding reviewer is intentionally retained rather than copying its private markup.' } } } };
