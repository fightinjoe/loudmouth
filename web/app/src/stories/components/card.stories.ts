import type { Meta, StoryObj } from '@storybook/html-vite';
import type { Card, Lang } from '@catchphrase/card-schema';
import type { LibraryEntry, ReadingDisplay } from '../../js/library-types';
import { renderCardRow, renderRuby, type RenderCardRowOptions } from '../../components/card';
import { renderChapterSheetBody } from '../../components/chapter-sheet';
import { renderBrowseCardsHTML } from '../../panes/content-pane-render';
import { escapeHTML } from '../../js/utils';
import { fixtureEntry, fixtureDeck, textFixtureEntry, FIXTURE_LANGUAGES, FIXTURE_DATE } from '../support/fixtures';
import { mountedStory } from '../support/mounted-story';

type Context = 'phrases' | 'list' | 'exchange' | 'conversation' | 'browse';
type Args = { type: Card['type']; language: Lang; readings: ReadingDisplay; starred: boolean; membership: boolean; speaker: 'none' | 'you' | 'partner'; optionSeparator: boolean; context: Context; reorder: boolean };
function mount(body: string, reorder = false): HTMLElement {
  return mountedStory((host) => {
    host.className = 'workbench-gallery';
    host.innerHTML = `<div id="content-pane" style="max-width:480px;min-width:0"${reorder ? ' data-edit-mode' : ''}>${body}</div><output class="workbench-caption" aria-live="polite">Renderer specimen: click a card or star to inspect its action payload; no persistence or playback is performed here.</output>`;
    const log = (event: Event): void => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null;
      if (target) host.querySelector('output')!.textContent = JSON.stringify(target.dataset);
    };
    host.addEventListener('click', log);
    return () => host.removeEventListener('click', log);
  });
}
/** The production ancestors a card row appears under: chapter sheet pages, or a language collection. */
function context(html: string, kind: Context, speaker: Args['speaker'] = 'you'): string {
  const page = (inner: string) => `<section class="chapter-page">${inner}</section>`;
  if (kind === 'phrases') return page(`<div class="chapter-list chapter-list--phrases">${html}</div>`);
  if (kind === 'list') return page(`<div class="chapter-list">${html}</div>`);
  if (kind === 'exchange') return page(`<div class="chapter-dialogue"><div class="chapter-turn" data-speaker="${speaker === 'partner' ? 'partner' : 'you'}" role="group">${html}</div></div>`);
  if (kind === 'conversation') return page(`<div class="chapter-conversation">${html}</div>`);
  return `<div class="deck-view-list textbook-language-list"><div class="card-group"><div class="card-group-rows">${html}</div></div></div>`;
}
function entryFor(args: Args): LibraryEntry {
  const entry = fixtureEntry(args.type, args.language);
  if (entry.membership) entry.membership.starredAt = args.starred ? FIXTURE_DATE : null;
  if (!args.membership) delete entry.membership;
  if (entry.occurrence && args.speaker !== 'none') entry.occurrence.speaker = args.speaker;
  return entry;
}
const meta = { title: 'Components/Card', tags: ['autodocs'], args: { type: 'phrase', language: 'ja', readings: 'reading', starred: false, membership: true, speaker: 'none', optionSeparator: false, context: 'phrases', reorder: false }, argTypes: {
  type: { control: 'radio', options: ['phrase', 'word', 'chunk'], description: 'Current v4 card family.' }, language: { control: 'select', options: FIXTURE_LANGUAGES, description: 'Schema-valid authored specimen language.' }, readings: { control: 'radio', options: ['reading', 'romanization'], description: 'Production ReadingDisplay mode; Japanese romaji falls back to native readings when absent.' }, starred: { control: 'boolean', description: 'Membership star state, not card-global state.' }, membership: { control: 'boolean', description: 'Without membership the renderer omits phrasebook star controls.' }, speaker: { control: 'radio', options: ['none', 'you', 'partner'], description: 'Phrase occurrence speaker; irrelevant for Word/Chunk entries. Also aligns the exchange-turn context.' }, optionSeparator: { control: 'boolean', description: 'Explicit alternative separator, independent of speaker.' }, context: { control: 'radio', options: ['phrases', 'list', 'exchange', 'conversation', 'browse'], description: 'Actual production ancestor classes: chapter sheet Key phrases list, Words/collection list, exchange turn, conversation, or language collection. These intentionally differ.' }, reorder: { control: 'boolean', description: 'Static data-edit-mode treatment only; real drag ownership is in Phrasebook interactions.' },
}, parameters: { docs: { description: { component: 'src/components/card.ts: renderCardRow and renderRuby. Valid fixture entries keep occurrence, membership and evidence distinct. This render-only catalog logs action payloads without imitating the content controller. Actual chapter sheet page (src/components/chapter-sheet.ts) and browse ancestor classes are essential to appearance. Star behavior, speech, details and reordering are exercised in composition/interaction stories.' } } }, render: (args: Args) => mount(context(renderCardRow(entryFor(args), args.readings, { optionSeparator: args.optionSeparator }), args.context, args.speaker), args.reorder) } satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;
export const Playground: Story = {};
export const TypesAndMembership: Story = { render: () => {
  const plainWord = fixtureEntry('word');
  if (plainWord.card.type === 'word') delete plainWord.card.definition;
  const starred = fixtureEntry(); starred.membership!.starredAt = FIXTURE_DATE;
  const noMembership = fixtureEntry(); delete noMembership.membership;
  const cases: [string, LibraryEntry, RenderCardRowOptions?][] = [
    ['Phrase / unstarred', fixtureEntry()], ['Word / definition', fixtureEntry('word')], ['Word / no definition', plainWord], ['Chunk / preserved source', fixtureEntry('chunk')], ['Starred membership', starred], ['No membership / language saved card', noMembership],
  ];
  return mount(context(cases.map(([label, entry, options]) => `<section><h2 class="workbench-caption">${escapeHTML(label)}</h2>${renderCardRow(entry, 'reading', options)}</section>`).join(''), 'list'));
} };
export const SpeakersAndExplicitAlternatives: Story = { render: () => {
  const you = fixtureEntry(); you.occurrence!.speaker = 'you';
  const partner = fixtureEntry(); partner.occurrence!.speaker = 'partner';
  return mount(`<p class="workbench-caption">Exchange turns: You with an explicit same-speaker alternative, then Partner</p>${context(`${renderCardRow(you, 'reading', { conversation: true })}${renderCardRow(you, 'reading', { conversation: true, optionSeparator: true })}`, 'exchange', 'you')}${context(renderCardRow(partner, 'reading', { conversation: true }), 'exchange', 'partner')}<p class="workbench-caption">Conversation lines</p>${context(`${renderCardRow(you, 'reading', { conversation: true })}${renderCardRow(partner, 'reading', { conversation: true })}`, 'conversation')}<p class="workbench-caption">Separator without speaker</p>${context(`${renderCardRow(fixtureEntry())}${renderCardRow(fixtureEntry(), 'reading', { conversation: false, optionSeparator: true })}`, 'phrases')}`);
} };
export const FiveLanguagesAndReadings: Story = { render: () => {
  const missing = fixtureEntry(); delete missing.card.romanization;
  return mount(context(`${FIXTURE_LANGUAGES.map((lang) => `<section><h2 class="workbench-caption">${lang} · native / romanization</h2>${renderCardRow(fixtureEntry('phrase', lang), 'reading')}${renderCardRow(fixtureEntry('phrase', lang), 'romanization')}</section>`).join('')}<section><h2 class="workbench-caption">Japanese missing romanization falls back to ruby</h2>${renderCardRow(missing, 'romanization')}</section><section><h2 class="workbench-caption">renderRuby: missing tokens and escaped base/annotation</h2><p class="text-entry">${renderRuby(undefined) || '(No reading tokens)'} · ${renderRuby([['<literal>', '& reading'], [' plain', null]])}</p></section>`, 'phrases'));
} };
export const ChapterSheetAndBrowseAncestors: Story = { render: () => {
  const entries = [fixtureEntry(), fixtureEntry('word'), fixtureEntry('chunk')];
  const saved = entries.map((entry) => { const result = structuredClone(entry); delete result.membership; return result; });
  return mount(`<p class="workbench-caption">Actual renderChapterSheetBody / single-page collection in the chapter sheet</p><div class="chapter-sheet-body">${renderChapterSheetBody({ kind: 'translations', key: 'translations', title: 'Translations', entries }, { readingDisplay: 'reading', tab: 'phrases', contextFor: () => '' })}</div><p class="workbench-caption">Actual renderBrowseCardsHTML / saved language cards without membership</p><div class="deck-view-list textbook-language-list">${renderBrowseCardsHTML(fixtureDeck(), saved, [])}</div>`);
} };
export const ReorderContext: Story = { args: { reorder: true, speaker: 'you' } };
export const LongAndHostileText: Story = { render: () => mount(context(`<h2 class="workbench-caption">Long text</h2>${renderCardRow(textFixtureEntry('long'))}<h2 class="workbench-caption">Hostile literal text</h2>${renderCardRow(textFixtureEntry('hostile'))}`, 'phrases')) };
