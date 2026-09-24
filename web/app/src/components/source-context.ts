import type { Snapshot, Evidence } from '@catchphrase/card-schema';
import { escapeHTML } from '../js/utils';

export interface SourceReadingToken {
  start: number;
  end: number;
  annotation: string | null;
}

export function readingTokens(snapshot: Snapshot, showReadings = true): SourceReadingToken[] | null {
  if (!showReadings || !snapshot.reading) return null;
  let offset = 0;
  const tokens: SourceReadingToken[] = [];
  for (const [base,annotation] of snapshot.reading) {
    const start = offset;
    offset += base.length;
    tokens.push({start,end:offset,annotation});
  }
  return tokens;
}

export function renderRange(snapshot: Snapshot, start: number, end: number, tokens: readonly SourceReadingToken[] | null): string {
  if (!tokens) return escapeHTML(snapshot.text.slice(start,end));
  let html = '';
  for (const token of tokens) {
    const from = Math.max(start,token.start);
    const to = Math.min(end,token.end);
    if (to <= from) continue;
    const base = escapeHTML(snapshot.text.slice(from,to));
    html += from === token.start && to === token.end && token.annotation
      ? `<ruby>${base}<rt>${escapeHTML(token.annotation)}</rt></ruby>` : base;
  }
  return html;
}

export function renderSourceContext(snapshot: Snapshot, span: Evidence['span'], {showReadings = true,mask = false}: {
  showReadings?: boolean; mask?: boolean;
} = {}): string {
  const tokens = readingTokens(snapshot,showReadings);
  const before = renderRange(snapshot,0,span.start,tokens);
  const selected = mask ? '____' : renderRange(snapshot,span.start,span.end,tokens);
  const after = renderRange(snapshot,span.end,snapshot.text.length,tokens);
  return `<span class="source-context" lang="${escapeHTML(snapshot.lang)}">${before}<mark>${selected}</mark>${after}</span>`;
}
