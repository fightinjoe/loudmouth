import type {
  BreakdownGenerationContext,
  Candidate,
  Card,
  Evidence,
  Lang,
  Phrase,
} from "@catchphrase/card-schema";

export type DeckMode = "study" | "review" | "reverse";
export type DeckOrder = "default" | "random" | "reverse";
export type ReadingDisplay = "reading" | "romanization";
export type Ability = BreakdownGenerationContext["ability"];
export type Generation = BreakdownGenerationContext;

export interface Deck {
  id: string;
  name: string;
  lang: Lang;
  createdAt: string;
  lastAccessedAt?: string;
  mode: DeckMode;
  order: DeckOrder;
  readingDisplay: ReadingDisplay;
  generation?: Generation;
  ability?: Ability;
  seedId?: string;
}

export interface CardRecord {
  id: string;
  identityKey: string;
  lang: Lang;
  type: Card["type"];
  createdAt: string;
  content: Card;
}

export interface Group {
  id: string;
  deckId: string;
  title: string;
  position: number;
}

export interface Membership {
  deckId: string;
  cardId: string;
  createdAt: string;
  position: number;
  starredAt: string | null;
}

export interface Occurrence {
  id: string;
  deckId: string;
  groupId?: string;
  cardId: string;
  position: number;
  translation: string;
  speaker?: "you" | "partner";
  alternative?: true;
}

export interface Provenance {
  id: string;
  cardId: string;
  deckId: string;
  sourceKey: string;
  source: Evidence;
  createdAt: string;
}

export interface LibraryEntry {
  key: string;
  cardId: string;
  card: Card;
  membership?: Membership;
  occurrence?: Occurrence;
  sources: Evidence[];
}

export interface PhrasebookDraftPhrase {
  id: string;
  card: Phrase;
  speaker?: "you" | "partner";
  alternative?: true;
}

export interface PhrasebookDraftGroup {
  id: string;
  title?: string;
  phrases: PhrasebookDraftPhrase[];
  vocab: Candidate[];
}

export interface CommitPhrasebookInput {
  name: string;
  lang: Lang;
  generation?: Generation;
  ability?: Ability;
  seedId?: string;
  groups: PhrasebookDraftGroup[];
  selectedIndexes: readonly number[];
}

export interface LibraryBackup {
  schemaVersion: 2;
  cards: CardRecord[];
  decks: Deck[];
  groups: Group[];
  memberships: Membership[];
  occurrences: Occurrence[];
  provenance: Provenance[];
}
