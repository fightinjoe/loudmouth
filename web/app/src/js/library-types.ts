import type {
  BreakdownGenerationContext,
  Card,
  Evidence,
  Lang,
  PhrasebookGroup,
  PhrasebookImage,
} from "@catchphrase/card-schema";

export const LIBRARY_SCHEMA_VERSION = 4 as const;

export type DeckIllustration = {
  requestId: string;
  prompt: string;
} & (
  | { state: "pending" | "failed" }
  | { state: "ready"; image: PhrasebookImage }
);

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
  illustration?: DeckIllustration;
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
  exchanges: { id: string; title: string; position: number }[];
  wordFamilies: { id: string; title: string; position: number }[];
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
  section?: "thingsToSay" | "likelyExchanges" | "exampleConversation";
  cardId: string;
  position: number;
  translation: string;
  speaker?: "you" | "partner";
  exchangeId?: string;
  turnIndex?: number;
}

export interface TopicWordPlacement {
  id: string;
  deckId: string;
  groupId: string;
  familyId: string;
  cardId: string;
  position: number;
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
  wordPlacement?: TopicWordPlacement;
  sources: Evidence[];
}

export type PhrasebookDraftGroup = PhrasebookGroup;

export interface CommitPhrasebookInput {
  name: string;
  lang: Lang;
  generation?: Generation;
  ability?: Ability;
  seedId?: string;
  illustration?: DeckIllustration;
  groups: PhrasebookDraftGroup[];
  selectedIndexes: readonly number[];
}

export interface LibraryBackup {
  schemaVersion: typeof LIBRARY_SCHEMA_VERSION;
  cards: CardRecord[];
  decks: Deck[];
  groups: Group[];
  memberships: Membership[];
  occurrences: Occurrence[];
  topicWords: TopicWordPlacement[];
  provenance: Provenance[];
}
