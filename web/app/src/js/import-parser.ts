import { validateCardBatch, validateCandidate } from '@catchphrase/card-schema';
import type { Candidate } from '@catchphrase/card-schema';

export function parseCardBatch(jsonString: string): {cards: Candidate[]; errors: string[]} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (error) {
    return {cards:[],errors:[`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`]};
  }
  try {
    return {cards:validateCardBatch(parsed).cards,errors:[]};
  } catch (error) {
    const errors: string[] = [];
    if (typeof parsed === 'object' && parsed !== null && 'cards' in parsed && Array.isArray(parsed.cards)) {
      parsed.cards.forEach((candidate: unknown,index: number) => {
        try { validateCandidate(candidate, `batch.cards[${index}]`); }
        catch (invalid) { errors.push(invalid instanceof Error ? invalid.message : String(invalid)); }
      });
    }
    if (!errors.length) errors.push(error instanceof Error ? error.message : String(error));
    return {cards:[],errors};
  }
}
