import type { Meta, StoryObj } from '@storybook/html-vite';
import type { Lang } from '@catchphrase/card-schema';
import { renderLanguage } from '../../components/language';
import { CONTENT_LANGUAGES, LANG_FLAGS, LANG_NAMES } from '../../js/lang';
import { HOSTILE_TEXT } from '../support/fixtures';
import { mountedStory } from '../support/mounted-story';

type Args = { lang: Lang; title: string; subtitle: string };

function language(args: Args): string {
  return renderLanguage({
    lang: args.lang, flag: LANG_FLAGS[args.lang], name: args.title || LANG_NAMES[args.lang], subtitle: args.subtitle,
  });
}

function mount(html: string): HTMLElement {
  return mountedStory((host) => {
    host.className = 'workbench-gallery';
    host.style.minHeight = '0';
    host.innerHTML = `<section class="nav-pane" style="width:100%;max-width:480px;min-width:0;background:var(--textbook-paper);color:var(--fg-body)">
      <div class="nav-language-shelf" role="region" aria-label="Language tile specimens">${html}</div>
    </section><output class="workbench-caption" aria-live="polite">Click a language to inspect its navigation payload.</output>`;
    const log = (event: Event): void => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null;
      if (target) host.querySelector('output')!.textContent = JSON.stringify(target.dataset);
    };
    host.addEventListener('click', log);
    return () => host.removeEventListener('click', log);
  });
}

const meta = {
  title: 'Components/Language',
  tags: ['autodocs'],
  args: { lang: 'ja', title: '', subtitle: '2 phrasebooks · 24 saved cards' },
  argTypes: {
    lang: { control: 'select', options: CONTENT_LANGUAGES, description: 'Production content language and nav/browse-lang payload; also selects the registry flag and default title.' },
    title: { control: 'text', description: 'Escaped label override for layout specimens. Leave blank to use the production language name.' },
    subtitle: { control: 'text', description: 'Escaped count summary supplied by navigation. The renderer does not query or calculate counts.' },
  },
  parameters: { docs: { story: { inline: false }, description: { component: 'src/components/language.ts: renderLanguage, reused by nav-pane.ts. A native language button in its real .nav-pane / .nav-language-shelf ancestors, retaining the production 190px tile and scrollable shelf. Flags and default names come from the existing language registry. Clicks log nav/browse-lang and data-lang instead of navigating. Production navigation supplies book and saved-card counts and owns keyboard shelf scrolling; this specimen has no storage or app controller. Labels and subtitles are escaped, including hostile literal text.' } } },
  render: (args: Args) => mount(language(args)),
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;

export const Playground: Story = {};
export const AllLanguages: Story = {
  render: (args) => mount(CONTENT_LANGUAGES.map((lang) => language({ ...args, lang, title: '' })).join('')),
  parameters: { docs: { description: { story: 'All five supported content languages in the production horizontal shelf; scroll sideways to inspect each button.' } } },
};
export const SavedCardsOnly: Story = { args: { subtitle: '0 phrasebooks · 3 saved cards' } };
export const EmptyCounts: Story = { args: { subtitle: '1 phrasebook · 0 saved cards' } };
export const LongTitleAndSubtitle: Story = { args: { title: 'Japanese language collection', subtitle: '128 phrasebooks · 1024 saved cards, including cards saved outside a phrasebook' } };
export const HostileText: Story = { args: { title: HOSTILE_TEXT, subtitle: HOSTILE_TEXT } };
export const EmptySubtitle: Story = { args: { subtitle: '' } };
