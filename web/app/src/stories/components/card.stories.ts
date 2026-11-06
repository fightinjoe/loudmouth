import type { Meta, StoryObj } from '@storybook/html-vite';
import type { Card, Lang } from '@catchphrase/card-schema';
import type { LibraryEntry, ReadingDisplay } from '../../js/library-types';
import { renderCardRow, renderRuby, type RenderCardRowOptions } from '../../components/card';
import { renderChapter, renderBrowseCardsHTML } from '../../panes/content-pane-render';
import { escapeHTML } from '../../js/utils';
import { fixtureEntry, fixtureDeck, textFixtureEntry, FIXTURE_LANGUAGES, FIXTURE_DATE } from '../support/fixtures';
import { mountedStory } from '../support/mounted-story';

type Args = { type: Card['type']; language: Lang; readings: ReadingDisplay; starred: boolean; membership: boolean; readOnly: boolean; wordTile: boolean; speaker: 'none' | 'you' | 'partner'; optionSeparator: boolean; context: 'textbook' | 'browse'; reorder: boolean };
function mount(body: string, reorder = false): HTMLElement {
  return mountedStory((host) => {
    host.className = 'workbench-gallery';
    host.innerHTML = `<div id="content-pane"${reorder ? ' data-edit-mode' : ''}>${body}</div><output class="workbench-caption" aria-live="polite">Renderer specimen: click a card or star to inspect its action payload; no persistence or playback is performed here.</output>`;
    const log = (event: Event): void => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null;
      if (target) host.querySelector('output')!.textContent = JSON.stringify(target.dataset);
    };
    host.addEventListener('click', log);
    return () => host.removeEventListener('click', log);
  });
}
function context(html: string, kind: Args['context']): string {
  return kind === 'textbook' ? `<div class="textbook-reader"><section class="textbook-chapter"><div class="textbook-dialogue">${html}</div></section></div>` : `<div class="deck-view-list textbook-language-list"><div class="card-group"><div class="card-group-rows">${html}</div></div></div>`;
}
function entryFor(args: Args): LibraryEntry {
  const entry = fixtureEntry(args.type, args.language);
  if (entry.membership) entry.membership.starredAt = args.starred ? FIXTURE_DATE : null;
  if (!args.membership) delete entry.membership;
  if (entry.occurrence && args.speaker !== 'none') entry.occurrence.speaker = args.speaker;
  return entry;
}
const meta = { title: 'Components/Card', tags: ['autodocs'], args: { type: 'phrase', language: 'ja', readings: 'reading', starred: false, membership: true, readOnly: false, wordTile: false, speaker: 'none', optionSeparator: false, context: 'textbook', reorder: false }, argTypes: {
  type: { control: 'radio', options: ['phrase', 'word', 'chunk'], description: 'Current v4 card family.' }, language: { control: 'select', options: FIXTURE_LANGUAGES, description: 'Schema-valid authored specimen language.' }, readings: { control: 'radio', options: ['reading', 'romanization'], description: 'Production ReadingDisplay mode; Japanese romaji falls back to native readings when absent.' }, starred: { control: 'boolean', description: 'Membership star state, not card-global state.' }, membership: { control: 'boolean', description: 'Without membership the renderer omits phrasebook star controls.' }, readOnly: { control: 'boolean', description: 'Suppresses star controls for retained previews.' }, wordTile: { control: 'boolean', description: 'Compact Word-family tile layout.' }, speaker: { control: 'radio', options: ['none', 'you', 'partner'], description: 'Phrase occurrence speaker; irrelevant for Word/Chunk entries.' }, optionSeparator: { control: 'boolean', description: 'Explicit alternative separator, independent of speaker.' }, context: { control: 'radio', options: ['textbook', 'browse'], description: 'Actual production ancestor classes; these intentionally differ.' }, reorder: { control: 'boolean', description: 'Static data-edit-mode treatment only; real drag ownership is in Textbook interactions.' },
}, parameters: { docs: { description: { component: 'src/components/card.ts: renderCardRow and renderRuby. Valid fixture entries keep occurrence, membership and evidence distinct. This render-only catalog logs action payloads without imitating the content controller. Actual textbook and browse ancestor classes are essential to appearance. Star behavior, speech, details and reordering are exercised in composition/interaction stories.' } } }, render: (args: Args) => mount(context(renderCardRow(entryFor(args), args.readings, { readOnly: args.readOnly, wordTile: args.wordTile, optionSeparator: args.optionSeparator }), args.context), args.reorder) } satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;
export const Playground: Story = {};
export const TypesAndMembership: Story = { render: () => {
  const plainWord = fixtureEntry('word');
  if (plainWord.card.type === 'word') delete plainWord.card.definition;
  const starred = fixtureEntry(); starred.membership!.starredAt = FIXTURE_DATE;
  const noMembership = fixtureEntry(); delete noMembership.membership;
  const cases: [string, LibraryEntry, RenderCardRowOptions?][] = [
    ['Phrase / unstarred', fixtureEntry()], ['Word / definition', fixtureEntry('word')], ['Word / no definition', plainWord], ['Chunk / preserved source', fixtureEntry('chunk')], ['Starred membership', starred], ['Read-only preview', fixtureEntry(), { readOnly: true }], ['No membership / language saved card', noMembership], ['Word tile', fixtureEntry('word'), { wordTile: true }],
  ];
  return mount(context(cases.map(([label, entry, options]) => `<section><h2 class="workbench-caption">${escapeHTML(label)}</h2>${renderCardRow(entry, 'reading', options)}</section>`).join(''), 'textbook'));
} };
export const SpeakersAndExplicitAlternatives: Story = { render: () => {
  const you = fixtureEntry(); you.occurrence!.speaker = 'you';
  const partner = fixtureEntry(); partner.occurrence!.speaker = 'partner';
  return mount(context(`<p class="workbench-caption">You, explicit same-speaker alternative, partner, and separator without speaker</p>${renderCardRow(you)}${renderCardRow(you, 'reading', { optionSeparator: true })}${renderCardRow(partner)}${renderCardRow(fixtureEntry(), 'reading', { conversation: false, optionSeparator: true })}`, 'textbook'));
} };
export const FiveLanguagesAndReadings: Story = { render: () => {
  const missing = fixtureEntry(); delete missing.card.romanization;
  return mount(context(`${FIXTURE_LANGUAGES.map((lang) => `<section><h2 class="workbench-caption">${lang} · native / romanization</h2>${renderCardRow(fixtureEntry('phrase', lang), 'reading')}${renderCardRow(fixtureEntry('phrase', lang), 'romanization')}</section>`).join('')}<section><h2 class="workbench-caption">Japanese missing romanization falls back to ruby</h2>${renderCardRow(missing, 'romanization')}</section><section><h2 class="workbench-caption">renderRuby: missing tokens and escaped base/annotation</h2><p class="text-entry">${renderRuby(undefined) || '(No reading tokens)'} · ${renderRuby([['<literal>', '& reading'], [' plain', null]])}</p></section>`, 'textbook'));
} };
export const TextbookAndBrowseAncestors: Story = { render: () => {
  const entries = [fixtureEntry(), fixtureEntry('word'), fixtureEntry('chunk')];
  const saved = entries.map((entry) => { const result = structuredClone(entry); delete result.membership; return result; });
  return mount(`<p class="workbench-caption">Actual renderChapter / textbook ancestor</p><div class="textbook-reader">${renderChapter({ kind: 'translations', key: 'specimen', title: 'Textbook cards', entries }, fixtureDeck(), 0)}</div><p class="workbench-caption">Actual renderBrowseCardsHTML / saved language cards without membership</p><div class="deck-view-list textbook-language-list">${renderBrowseCardsHTML(fixtureDeck(), saved, [])}</div>`);
} };
export const ReorderContext: Story = { args: { reorder: true, speaker: 'you' } };
export const LongAndHostileText: Story = { render: () => mount(context(`<h2 class="workbench-caption">Long text</h2>${renderCardRow(textFixtureEntry('long'))}<h2 class="workbench-caption">Hostile literal text</h2>${renderCardRow(textFixtureEntry('hostile'))}`, 'textbook')) };
