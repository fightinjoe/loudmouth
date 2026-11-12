import type { Meta, StoryObj } from '@storybook/html-vite';
import { icon } from '../../components/icon';
import { headerIconButton } from '../../components/pane-header';
import { renderPhrasebookTitle } from '../../components/phrasebook-title';
import { renderIllustration } from '../../panes/content-pane-render';
import { escapeHTML } from '../../js/utils';
import { FIXTURE_TITLE, HOSTILE_TEXT, LONG_TITLE } from '../support/fixtures';
import { mountedStory } from '../support/mounted-story';

type Controls = 'stored' | 'preview' | 'none';
type Args = { title: string; collapsed: boolean; controls: Controls };

/** The pane-owned controls renderDeckBody passes in: Library left; Settings (stored) or Save (preview) right. */
function controls(kind: Controls): { leading: string; trailing: string } {
  if (kind === 'none') return { leading: '', trailing: '' };
  return {
    leading: headerIconButton('menu', { action: 'content/menu', label: 'Library' }),
    trailing: kind === 'stored'
      ? `<button type="button" class="icon-button" data-action="content/menu-settings" aria-label="Phrasebook settings">${icon('settings')}</button>`
      : '<button type="button" class="deck-header-save-pill" data-action="content/save-preview" aria-label="Save">Save</button>',
  };
}

/** The title layer is absolutely positioned over the cover inside the content body, whose class collapses it.
 * Title styles are class-based, so repeated specimens need no #content-pane ancestor. */
function frame(args: Args, caption = ''): string {
  return `<section class="workbench-specimen">${caption ? `<p class="workbench-caption">${escapeHTML(caption)}</p>` : ''}
    <div data-region="content-body" class="${args.collapsed ? 'phrasebook--collapsed' : ''}" style="position:relative;width:100%;max-width:480px;height:280px;overflow:hidden;background:var(--bg-surface)">
      <div class="phrasebook-art" aria-hidden="true">${renderIllustration()}</div>
      ${renderPhrasebookTitle(args.title, controls(args.controls))}
    </div></section>`;
}

function mount(html: string): HTMLElement {
  return mountedStory((host) => {
    host.className = 'workbench-gallery';
    host.innerHTML = `${html}<output class="workbench-caption" aria-live="polite">Renderer specimen: click a control to inspect its action payload.</output>`;
    const log = (event: Event): void => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null;
      if (target) host.querySelector('output')!.textContent = JSON.stringify(target.dataset);
    };
    host.addEventListener('click', log);
    return () => host.removeEventListener('click', log);
  });
}

const meta = {
  title: 'Components/PhrasebookTitle', tags: ['autodocs'],
  args: { title: FIXTURE_TITLE, collapsed: false, controls: 'stored' },
  argTypes: {
    title: { control: 'text', description: 'Phrasebook name; escaped, two lines in the bubble and one in the slim bar.' },
    collapsed: { control: 'boolean', description: 'Ancestor .phrasebook--collapsed on [data-region="content-body"], which the content owner toggles past 150px of landing scroll (and removes below 110px).' },
    controls: { control: 'radio', options: ['stored', 'preview', 'none'], description: 'Controls supplied by renderDeckBody: Settings for stored phrasebooks, Save for previews, none for language collections.' },
  },
  parameters: { docs: { description: { component: 'src/components/phrasebook-title.ts: renderPhrasebookTitle(name, { leading, trailing }) — the fixed title layer with the speech-bubble title and the slim bar that replaces it when collapsed. Styles in src/styles/textbook-content.css; the bubble gradient follows --phrasebook-accent. Collapse is a CSS class on an ancestor; the scroll thresholds are exercised in Interactions/Phrasebook.' } } },
  render: (args: Args) => mount(frame(args)),
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;

export const Expanded: Story = {};
export const Collapsed: Story = { args: { collapsed: true } };
export const PreviewSave: Story = { args: { controls: 'preview' } };
export const LongAndHostileTitle: Story = {
  parameters: { docs: { description: { story: 'Long and literal hostile names, expanded and collapsed: escaped, clamped to two lines in the bubble and one in the bar.' } } },
  render: () => mount([
    frame({ title: LONG_TITLE, collapsed: false, controls: 'stored' }, 'Long title · expanded'),
    frame({ title: LONG_TITLE, collapsed: true, controls: 'stored' }, 'Long title · collapsed'),
    frame({ title: HOSTILE_TEXT, collapsed: false, controls: 'stored' }, 'Hostile literal title · expanded'),
    frame({ title: HOSTILE_TEXT, collapsed: true, controls: 'stored' }, 'Hostile literal title · collapsed'),
  ].join('')),
};
