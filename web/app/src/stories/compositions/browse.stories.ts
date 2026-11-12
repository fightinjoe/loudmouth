import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, waitFor } from 'storybook/test';
import type { Lang } from '@catchphrase/card-schema';
import { loadLangBrowse } from '../../panes/nav-pane';
import type { ContentBrowse } from '../../panes/content-pane-render';
import { appStory, getScenario } from '../support/scenario';

const meta = {
  title: 'Compositions/Browse', tags: ['autodocs'], argTypes: {},
  parameters: { layout: 'fullscreen', docs: { description: { component: 'src/panes/nav-pane.ts: loadLangBrowse; src/panes/content-pane-render.ts: renderBrowseBody/renderBrowseCardsHTML. Actual app controller and sandbox queries. Language collections have no phrasebook membership stars or Review.' } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
function languageList(lang: Lang, empty = false): Story {
  let browse: ContentBrowse;
  return { ...appStory({ library: empty ? 'empty' : 'multiple', lang,
    setup: async () => { browse = await loadLangBrowse(lang); },
    mount: (_root, _data, app) => { app.ui.transition('content/browse', browse); app.ui.transition('shell/close'); },
  }) };
}
function savedCards(lang: Lang): Story {
  return { ...appStory({ library: 'language-only', lang, mount: (_root, _data, app) => {
    app.ui.transition('content/select-deck', { id: `lang:${lang}` }); app.ui.transition('shell/close');
  } }) };
}
export const LanguageBookList = languageList('ja');
export const ChineseBookList = languageList('zh');
export const SpanishBookList = languageList('es');
export const CzechBookList = languageList('cs');
export const UkrainianBookList = languageList('uk');
export const AllSavedCardTypes = savedCards('ja');
export const ChineseRubyCards = savedCards('zh');
export const SpanishSavedCards = savedCards('es');
export const CzechSavedCards = savedCards('cs');
export const UkrainianSavedCards = savedCards('uk');
export const EmptyBookList = languageList('ja', true);
export const EmptySavedCards: Story = {
  ...appStory({ library: 'empty', mount: (_root, _data, app) => {
    app.ui.transition('content/select-deck', { id: 'lang:ja' }); app.ui.transition('shell/close');
  } }),
  parameters: { docs: { description: { story: 'A real empty language query shows the current no-cards message. No synthetic legacy card records.' } } },
};
export const ErrorSpecimen: Story = {
  ...savedCards('ja'),
  parameters: { docs: { description: { story: 'Visual content error specimen only, not an exercised storage failure. The real existing inline error region is shown while keeping the saved cards inspectable.' } } },
  play: async () => {
    const { root } = getScenario();
    await waitFor(() => expect(root.querySelector('[data-region="card-list"]')).not.toBeNull());
    const error = root.querySelector<HTMLElement>('[data-region="content-error"]')!;
    error.textContent = 'Workbench saved-card load error specimen'; error.hidden = false;
  },
};
