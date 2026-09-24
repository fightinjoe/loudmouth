import {
  SCHEMA_VERSION,
  cardIdentity,
  validateBreakdownRequest,
  validateBreakdownResponse,
} from "@catchphrase/card-schema";
import type {
  BreakdownRequest,
  BreakdownResponse,
  Candidate,
} from "@catchphrase/card-schema";
import type { Deck, Group, LibraryEntry } from "./library-types";
import { PHRASE_BREAKDOWN_CACHE_PREFIX } from "./preferences";

export type BreakdownTargetKind = "word" | "chunk";

export interface BreakdownCandidateLocation {
  identity: string;
  candidate: Candidate;
  chunkIndex: number;
  kind: BreakdownTargetKind;
  wordIndex?: number;
  primary: boolean;
}

/**
 * Builds the exact request for the active Phrase occurrence. Presentation
 * settings never enter the request or cache key, while generation context is
 * included only when an actual saved phrasebook is active.
 */
export function cardRequest(
  entry: LibraryEntry,
  deck?: Deck,
  group?: Group,
): BreakdownRequest {
  if (entry.card.type !== "phrase") {
    throw new Error("Only Phrase entries can be broken down.");
  }

  const card = entry.card;
  const occurrence = entry.occurrence;
  const snapshot = {
    lang: card.lang,
    text: card.text,
    translation: occurrence?.translation ?? card.translation,
    ...(card.reading === undefined ? {} : { reading: card.reading }),
    ...(card.romanization === undefined ? {} : { romanization: card.romanization }),
  };
  const source = {
    snapshot,
    ref: {
      cardId: entry.cardId,
      ...(occurrence === undefined ? {} : { occurrenceId: occurrence.id }),
    },
  };

  const activeDeck = deck
    && (entry.membership?.deckId === deck.id || occurrence?.deckId === deck.id)
    ? deck
    : undefined;
  const activeOccurrence = activeDeck && occurrence?.deckId === activeDeck.id
    ? occurrence
    : undefined;
  const activeGroup = activeDeck && group?.deckId === activeDeck.id
    && activeOccurrence?.groupId === group.id
    ? group
    : undefined;
  const context = activeDeck
    ? {
        ...(activeDeck.generation === undefined
          ? {}
          : { generation: activeDeck.generation }),
        ...(activeGroup === undefined ? {} : { groupTitle: activeGroup.title }),
        ...(activeOccurrence?.speaker === undefined
          ? {}
          : { speaker: activeOccurrence.speaker }),
      }
    : undefined;

  return validateBreakdownRequest({
    schemaVersion: SCHEMA_VERSION,
    source,
    ...(context && Object.keys(context).length > 0 ? { context } : {}),
  });
}

function cacheKey(request: BreakdownRequest): string {
  return `${PHRASE_BREAKDOWN_CACHE_PREFIX}${JSON.stringify(request)}`;
}

/** Reads only response content that still validates against this exact request. */
export function readCache(request: BreakdownRequest): BreakdownResponse | null {
  const key = cacheKey(request);
  try {
    const cached = globalThis.sessionStorage?.getItem(key);
    if (!cached) return null;
    const parsed: unknown = JSON.parse(cached);
    return validateBreakdownResponse(parsed, request);
  } catch {
    try {
      globalThis.sessionStorage?.removeItem(key);
    } catch {
      // Disabled storage is equivalent to a cache miss.
    }
    return null;
  }
}

/** Writes analysis content only; membership, card IDs and stars never enter the cache. */
export function writeCache(
  request: BreakdownRequest,
  value: unknown,
): BreakdownResponse {
  const breakdown = validateBreakdownResponse(value, request);
  try {
    globalThis.sessionStorage?.setItem(cacheKey(request), JSON.stringify(breakdown));
  } catch {
    // Analysis caching is best effort.
  }
  return breakdown;
}

/**
 * Returns one location per visible star control. A Word selected as a chunk's
 * target is represented by its existing nested Word control, never duplicated.
 */
export function breakdownCandidates(
  breakdown: BreakdownResponse,
): BreakdownCandidateLocation[] {
  const locations: BreakdownCandidateLocation[] = [];
  breakdown.chunks.forEach((chunk, chunkIndex) => {
    if (chunk.target.kind === "chunk") {
      const candidate: Candidate = { card: chunk.target.card };
      locations.push({
        identity: cardIdentity(candidate.card),
        candidate,
        chunkIndex,
        kind: "chunk",
        primary: true,
      });
    }
    chunk.words.forEach((candidate, wordIndex) => {
      locations.push({
        identity: cardIdentity(candidate.card),
        candidate,
        chunkIndex,
        kind: "word",
        wordIndex,
        primary: chunk.target.kind === "word" && chunk.target.index === wordIndex,
      });
    });
  });
  return locations;
}

export function candidateAt(
  breakdown: BreakdownResponse,
  chunkIndex: number,
  kind: BreakdownTargetKind,
  wordIndex?: number,
): Candidate | null {
  const chunk = breakdown.chunks[chunkIndex];
  if (!chunk) return null;
  if (kind === "chunk") {
    return chunk.target.kind === "chunk" ? { card: chunk.target.card } : null;
  }
  if (wordIndex === undefined) return null;
  return chunk.words[wordIndex] ?? null;
}
