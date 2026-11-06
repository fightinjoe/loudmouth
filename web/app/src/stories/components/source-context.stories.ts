import type { Meta, StoryObj } from '@storybook/html-vite';
import type { Snapshot, Evidence } from '@catchphrase/card-schema';
import { renderSourceContext } from '../../components/source-context';
import { escapeHTML } from '../../js/utils';
import { fixtureEntry, HOSTILE_TEXT } from '../support/fixtures';

const snapshot: Snapshot = { lang: 'ja', text: '𠮷野家でお茶。', translation: 'Tea at Yoshinoya.', reading: [['𠮷野家', 'よしのや'], ['で', null], ['お茶', 'おちゃ'], ['。', null]] };
const spans: Record<string, Evidence['span']> = {
  'Whole token': { start: 0, end: 4 }, 'Partial token': { start: 2, end: 3 }, 'Cross-token': { start: 3, end: 6 }, 'First boundary / astral character': { start: 0, end: 2 }, 'Last boundary': { start: 7, end: 8 }, 'Whole source': { start: 0, end: 8 },
};
type Args = { selection: string; showReadings: boolean; mask: boolean };
function sample(label: string, source: Snapshot, span: Evidence['span'], options: { showReadings?: boolean; mask?: boolean } = {}): string {
  return `<section class="workbench-specimen"><h2 class="workbench-caption">${escapeHTML(label)} · UTF-16 [${span.start}, ${span.end})</h2><div class="card-term-target">${renderSourceContext(source, span, options)}</div><p class="workbench-caption">Selected literal: <code>${escapeHTML(source.text.slice(span.start, span.end))}</code></p></section>`;
}
function gallery(html: string): string { return `<div class="workbench-gallery"><div id="content-pane"><section class="textbook-chapter">${html}</section></div></div>`; }
const meta = { title: 'Components/SourceContext', tags: ['autodocs'], args: { selection: 'Whole token', showReadings: true, mask: false }, argTypes: {
  selection: { control: 'select', options: Object.keys(spans), description: 'Valid half-open UTF-16 offsets, preserving the astral character’s surrogate pair.' }, showReadings: { control: 'boolean', description: 'Hide all reading annotations without changing source text or span.' }, mask: { control: 'boolean', description: 'Replace selected source text with the production mask; partial ruby annotations must not leak.' },
}, parameters: { docs: { description: { component: 'src/components/source-context.ts: renderSourceContext(snapshot, span, options). Offsets are UTF-16 code units, not Unicode code points. Whole tokens retain ruby; partial fragments deliberately lose annotations. The astral character occupies two code units. Authored text is a rendering specimen, not a language-quality gold label. No controller or persistence is duplicated.' } } }, render: (args: Args) => gallery(sample(args.selection, snapshot, spans[args.selection], args)) } satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;
export const Playground: Story = {};
export const Utf16SpanBoundaries: Story = { render: () => gallery(Object.entries(spans).map(([label, span]) => sample(label, snapshot, span)).join('')) };
export const ReadingsAndMasking: Story = { render: () => {
  const withoutReadings = { ...snapshot }; delete withoutReadings.reading;
  return gallery(sample('Whole-token reading', snapshot, spans['Whole token']) + sample('Snapshot has no readings', withoutReadings, spans['Whole token']) + sample('Readings explicitly hidden', snapshot, spans['Whole token'], { showReadings: false }) + sample('Cross-token masked; no partial annotation leakage', snapshot, spans['Cross-token'], { mask: true }) + sample('Whole source masked', snapshot, spans['Whole source'], { mask: true }));
} };
export const PreservedWordEvidenceAndChunkSource: Story = { render: () => {
  const word = fixtureEntry('word', 'cs');
  const source = word.sources[0];
  const chunk = fixtureEntry('chunk');
  if (chunk.card.type !== 'chunk') throw new Error('Expected Chunk fixture');
  return gallery(sample('Preserved Word evidence (not a reconstructed headword sentence)', source.snapshot, source.span) + sample('Chunk retains its original snapshot and span', chunk.card.source.snapshot, chunk.card.source.span));
} };
export const HostileLiteralText: Story = { render: () => {
  const hostile: Snapshot = { lang: 'es', text: HOSTILE_TEXT, translation: 'Literal escaping specimen', reading: [[HOSTILE_TEXT, '<reading> & "quoted"']] };
  return gallery(sample('Literal base and annotation', hostile, { start: 0, end: HOSTILE_TEXT.length }) + sample('Literal partial markup remains text', hostile, { start: 1, end: 7 }));
} };
