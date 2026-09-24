---
name: card-schema
description: Normative v2 content, identity, provenance and library lifecycle contract.
---

# Card schema and lifecycle

This is the breaking v2 contract for API content, web imports and the web library. The canonical executable types and validators live in `api/src/schema/index.ts` (`@catchphrase/card-schema`). API envelopes retain their endpoint purpose; cards never contain persistence metadata. Character and Grammar are deferred. There is no `sentence` type, legacy import path or migration.

## Content types

```ts
type Lang = 'zh' | 'ja' | 'es' | 'cs';
type ReadingToken = [string, string | null];
type PartOfSpeech = 'noun' | 'verb' | 'adjective' | 'adverb' | 'pronoun'
  | 'determiner' | 'preposition' | 'postposition' | 'conjunction'
  | 'particle' | 'interjection' | 'numeral' | 'expression' | 'other';
type Form = { text: string; reading?: ReadingToken[]; romanization?: string };
type Snapshot = Form & { lang: Lang; translation: string };
type SourceRef = { cardId?: string; occurrenceId?: string };
type PhraseSource = { snapshot: Snapshot; ref?: SourceRef };
type Evidence = PhraseSource & { span: { start: number; end: number } };
type CommonCard = Form & {
  lang: Lang; translation: string; definition?: string;
  formality?: 'casual' | 'polite' | 'formal' | 'slang' | 'vulgar';
  notes?: string; example?: Form & { translation?: string };
};
type Word = CommonCard & { type: 'word'; partOfSpeech: PartOfSpeech; senseKey: string };
type Phrase = CommonCard & { type: 'phrase' };
type Chunk = CommonCard & { type: 'chunk'; source: Evidence; role: string; explanation: string };
type Card = Word | Phrase | Chunk;
type Candidate = { card: Card; sources?: Evidence[] };
```

Word means a dictionary-form lexical item in one sense, including multiword expressions. Phrase means a complete communicative utterance. Chunk means an expression in an exact historical phrase context. `notes` is teaching prose, never a relationship or speaker encoding. `definition` disambiguates meaning; `translation` is the displayed equivalent. `senseKey` is a canonical English concept identifier, such as `consume-food`, not a display gloss.

## Strict validation

Every external JSON boundary accepts `unknown` and returns a validated concrete value or throws an Error naming its field path. Validators do not mutate inputs or silently drop fields. Reject unknown fields, metadata (`id`, `deckIds`, `state`, `context`), arrays/null instead of objects, unsupported variants and invalid enums.

Required text and translation are nonblank strings of at most 2,000 UTF-16 units, preserved exactly. Optional values are omitted, not empty strings/arrays or null. Optional prose is nonblank: role ≤200, explanation ≤1,000, definition/notes/romanization ≤2,000. `senseKey` matches `^[a-z0-9]+(?:-[a-z0-9]+)*$`, at most 120 units. The exceptions to the no-null rule are reading annotations and membership `starredAt`.

Reading tokens contain exactly two elements: a nonempty base and null or a nonblank annotation. Unannotated whitespace and punctuation are allowed. Concatenated bases equal associated text exactly, including example text. Example translations are validated. Card readings are optional; generated Japanese and Chinese Words require dictionary-headword-aligned readings at the producer boundary. Spanish and Czech may omit readings. Structural validation does not prove phonetic or semantic accuracy.

Evidence uses integer UTF-16 `[start,end)` bounds within the exact snapshot, cannot split surrogate pairs, and selects nonempty meaningful text. Its snapshot language equals the target card language. Chunk text equals the selected snapshot substring. Word candidates alone may carry a nonempty `sources` array; Chunks carry mandatory evidence in content. A present ref has at least one nonempty ID. Refs are advisory navigation hints; deleted/missing refs do not invalidate evidence, and live refs never reinterpret historical snapshots.

All strings are untrusted plain text. Persist them unescaped; render through escaped text/attributes or DOM text/value properties. Ruby renderers escape bases and annotations independently. Validation does not make strings safe HTML, URLs or executable actions.

## Identity

Normalization is NFC plus trim only. Preserve case, accents, width, internal whitespace and punctuation. Do not stem, case-fold, use NFKC or match English translations. Identity functions validate inputs first and return JSON-string tuple keys:

- Word: `['word', lang, normalizeIdentityText(text), partOfSpeech, senseKey]`.
- Phrase: `['phrase', lang, normalizeIdentityText(text)]`.
- Chunk: `['chunk', lang, source.ref?.occurrenceId ?? null, source.snapshot.text, source.span.start, source.span.end]`.
- Evidence: `[snapshot.lang, snapshot.text, snapshot.translation, ref?.occurrenceId ?? null, span.start, span.end]`.

Saved content is never overwritten by identity reuse. `eat` and `to eat` with the same headword/POS/key reuse one Word; different keys remain separate. Sense generation is model quality, not a semantic merge guarantee. Phrase occurrences keep their own translations. Chunk identity excludes teaching prose, readings and source card ID; repeated positions and edited source text remain distinct. Reference-free imported Chunks use snapshot text/span context. New historical translations may add examples, never overwrite existing ones.

## Versioned boundaries

`SCHEMA_VERSION = 2`. Content batches are `{schemaVersion:2,cards:Candidate[]}`. Individual exports use the same one-Candidate envelope. Content export includes unique cards and all Word evidence, not memberships, stars or conversation structure. Any invalid candidate invalidates the entire import. Old-format imports are rejected.

`/phrasebook` returns `{schemaVersion:2,title,groups,usage}`. Each group is `{id,title,phrases,vocab}`; phrases are `{id,card:Phrase,speaker:'you'|'partner',alternative?:true}` and vocab contains Word candidates. Server UUIDs are draft handles; evidence occurrence refs address phrases within the owning group and match their snapshots. Group order follows checklist index, even when titles repeat. Commit remaps selected draft refs to fresh local IDs. `/context` and `/phrasebook-title` remain unversioned setup/title envelopes.

`/phrase-breakdown` accepts `{schemaVersion:2,source:PhraseSource,context?}`. Context may contain `generation:{seed,ability,answers}`, `groupTitle`, and `speaker`. Seed ≤200; ability is `none|basics|conversational`; at most five answers with labels ≤200 and values ≤500; group title ≤500. The source includes the active occurrence translation and current phrase form. IDs are not sent to the model.

Breakdown returns `{schemaVersion:2,chunks,usage}`, with 1–32 ordered meaningful chunks covering all meaningful source text. Each contains `{start,end,text,gloss,role,explanation,words:Candidate[],target}`. Words are Word-only, 0–32 per chunk. `target` is `{kind:'word',index}` or `{kind:'chunk',card:Chunk}`. Evidence and Chunk snapshots/refs match the request. Source alignment tolerates uncovered punctuation/whitespace, never surrogate splits or guessed repeated-word offsets. Gloss and model Word translation are at most 500 units.

Equivalence is explicit: the indexed Word's encountered surface covers the chunk except edge punctuation/whitespace, and its normalized dictionary text equals that edge-trimmed source span. Invalid equivalence is rejected, not repaired. `caluroso` has one Word control; `食べません` versus `食べる`, and `肉も` versus `肉`, have distinct Chunk and Word controls. Every meaningful chunk has exactly one target; other distinct Words retain independent controls.

## Library records and ownership

The web uses IndexedDB `loudmouth-card-v2`, version 1:

| Table | Record |
|---|---|
| cards | `{id,identityKey,lang,type,createdAt,content:Card}` |
| decks | `{id,name,lang,createdAt,lastAccessedAt,mode,order,readingDisplay,seedId?,generation?,ability?}` |
| groups | `{id,deckId,title,position}` |
| memberships | `{deckId,cardId,createdAt,position,starredAt:string|null}` |
| occurrences | `{id,deckId,groupId?,cardId,position,translation,speaker?,alternative?:true}` |
| provenance | `{id,cardId,deckId,sourceKey,source:Evidence,createdAt}` |

IDs are UUIDs; timestamps are ISO; positions are nonnegative integers. Card indexed lang/type equal content and creation time is immutable. Membership has one compound deck/card key and owns the star. Only Phrases have occurrences; repeated appearances share membership but retain placement, speaker and interpretation. Groups have stable IDs, not title-based identity. Word provenance is unique by card/deck/source key. Historical provenance may reference deleted decks; deckless imports use `deckId:''`. Chunk evidence is not duplicated in provenance.

Generation settings belong to the phrasebook and are the actual sanitized creation request. Suggestions/imports never fabricate generation/audience settings. Suggested books may carry their explicitly chosen ability. Remembered ability is a separate preference updated only after successful commit.

### Atomic lifecycle

Generated, cached, saved and starred are distinct properties. Generation and caching alone do not persist learning content. Initial commit saves all selected Phrases and pooled Words, unstarred, in one transaction with groups, occurrences, memberships and provenance. Generated vocabulary is capped at `min(24, selectedIndexes.length * 5)` unique Words in first-selected appearance order; preserve all selected evidence. Suggested books save all preview Words. No discarded draft refs survive. Cancellation before transaction completion and write failure leave the prior library unchanged; after successful commit the saved book remains.

Starring atomically validates the current deck, resolves/inserts content by identity, records new Word evidence, ensures membership and toggles its star. A new membership starts unstarred then becomes starred. Reuse never resets another membership or overwrites content. Unstarring retains cards, membership and examples. Concurrent toggles serialize; missing decks/cards and cross-language targets fail atomically. Without an active phrasebook there are no star or review controls and no inferred arbitrary membership.

Removing a card from a deck deletes that membership and its occurrences, not reusable content/evidence. Deleting a card deletes its own memberships, occurrences and Word provenance, never derivatives or evidence on other cards. Deleting a deck removes its groups/memberships/occurrences and retains reusable cards and historical evidence, including orphans. Language browse exposes all saved types.

Editing validates content and recomputes identity; collisions report “A card with this identity already exists.” Type/lang and Word senseKey/POS cannot be edited. Phrase translation edits update only an explicitly active occurrence plus canonical content; other interpretations remain. Chunk source/text/readings are read-only. Parent edits never rewrite historical evidence.

Joined entries are `{key,cardId,card,membership,occurrence?,sources}`. Phrase keys identify occurrences; Word/Chunk keys identify deck/card pairs. Presentation uses occurrence translation without mutating content. Language browse has one entry per saved card keyed by card ID and no inferred active membership. Review has one entry per starred membership, selecting the first displayed Phrase occurrence. Word examples prefer the active deck then creation time and ID.

Display order is group-less Translations, named groups in group order, Chunks, Vocab. Saved positions are authoritative within each bucket. New group-less occurrences prepend in incoming order. Reorder requires every current entry key exactly once, updates positions atomically, and preserves repeated Phrase occurrences. No `cardOrder` or `importIndex` ordering exists.

### Reset and backup

Startup deletes only old IndexedDB `loudmouth`, legacy `loudmouth.*` localStorage keys and `loudmouth.phrase-breakdown.*` session keys, then opens the new database before routing. New namespaces are `loudmouth-card-v2.lastDeckId`, `loudmouth-card-v2.languageAbility.<lang>` and `loudmouth-card-v2.phrase-breakdown.v1:`. Repeated/concurrent initialization cannot erase new data. Storage-key cleanup is best effort; IndexedDB failure is not. A blocked reset remains on initialization with Reload and “Close other Catchphrase tabs, then reload to finish the storage reset.” Other initialization errors show their error and Reload. Unrelated origin storage and iOS are untouched.

Full backup is `{schemaVersion:2,cards,decks,groups,memberships,occurrences,provenance}`. Export reads all tables in one readonly transaction. Restore validates the complete graph before one atomic clear/insert transaction. Wrong/missing versions report “Unsupported library schema version; expected 2.” Invalid input or write failure preserves the current library.

Restore requires unique IDs and identity keys, valid timestamps/positions, matching indexed fields and recomputed identity/source keys. Memberships require existing matching-language cards/decks. Every Phrase membership has an occurrence; every occurrence belongs to a Phrase membership and matching-language deck, with any group belonging to that deck. Every group has a live deck, including empty groups. Provenance targets are existing Words of the snapshot language. Historical deck/source refs may dangle; when source refs resolve, they identify same-language Phrases/occurrences and supplied IDs agree. Historical text need not match edited live text. Never synthesize missing reverse relationships or interpretations.

## Contextual presentation

Breakdown cache keys serialize the exact versioned request including refs/context/readings. Cache contains validated analysis, never authoritative resolved library IDs or stars. Open, retry, regeneration, close and cache clearing make no durable writes. Ready/reopened/toggled targets resolve against current DB identity and membership. Regeneration failure retains existing analysis; saved teaching remains unchanged. A pending save that commits remains durable even when the UI closes; stale UI updates are suppressed.

Source rendering uses the full exact snapshot with only the selected UTF-16 span highlighted. Complete reading tokens can retain ruby; tokens cut at a span boundary render escaped plain text. Masking replaces the span with a constant blank placeholder and leaks no annotation. Never apply Japanese offsets to romaji.

Phrase review uses the active occurrence translation. Word review uses dictionary headword and its own pronunciation, with collapsible historical source examples after reveal. Chunk English-to-target review shows the contextual gloss and full original phrase with the span masked; reveal highlights/fills it. Target-to-English shows full highlighted source and hides gloss until reveal. Role, explanation and full source translation appear after reveal. Chunk audio speaks the full historical phrase. Direction/next-card changes reset reveal; swipe boundaries do not loop.

## Acceptance scenarios

1. Committing a phrasebook saves selected conversations and committed vocabulary, unstarred; speculative unselected groups are absent.
2. Opening and closing breakdown without starring creates no derived library rows.
3. Starring a new Word creates it, membership and that membership's star atomically.
4. Equivalent Words across phrasebooks reuse content with independent memberships/stars.
5. Unstarring retains content/membership and removes only current review inclusion.
6. Chunk/Word targets are independent unless explicitly equivalent, in which case one control exists.
7. Cache clearing/regeneration preserves saved content, provenance and stars; explanation changes alone do not duplicate Chunks.
8. Saved `肉も` reviews in `肉も魚も食べません。` with span `[0,2)` highlighted; Word `食べる` reviews its dictionary form with `食べません` as source context.
9. Editing/deleting the parent does not invalidate historical learning targets.
10. Shared Phrases use the active book's occurrence context; repeated appearances agree on membership star.
11. Failed stars leave no partial relationships; backup round trips preserve content, interpretations, ordering, independent stars and durable source snapshots.
