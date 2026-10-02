---
name: card-schema
description: Normative v2 common content and v3 topic-first phrasebook/library lifecycle contract.
---

# Card schema and lifecycle

Common cards, content exchange and breakdown use v2. Topic-first phrasebooks and full-library backups use v3. The canonical executable content types and validators live in `api/src/schema/index.ts` (`@catchphrase/card-schema`); web persistence types live in `web/app/src/js/library-types.ts`. Cards never contain persistence metadata. Character and Grammar are deferred. There is no `sentence` type or compatibility reader for older generated phrasebooks.

## Content types

```ts
type Lang = 'zh' | 'ja' | 'es' | 'cs' | 'uk';
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

Reading tokens contain exactly two elements: a nonempty base and null or a nonblank annotation. Unannotated whitespace and punctuation are allowed. Concatenated bases equal associated text exactly, including example text. Example translations are validated. Card readings are optional; generated Japanese and Chinese Words require dictionary-headword-aligned readings at the producer boundary. Spanish, Czech and Ukrainian may omit readings. Ukrainian content uses native Cyrillic, not Russian substitutes; the web speech locale is `uk-UA`. Structural validation does not prove phonetic or semantic accuracy.

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

`PHRASEBOOK_SCHEMA_VERSION = 3`. `/phrasebook` returns `{schemaVersion:3,title,groups,flags,usage}`. Each of 1–8 titled groups is `{id,title,essentials,vocab,dialogue}`: essentials are 1–8 `{id,card:Phrase}` items without speaker/alternative; vocab is 0–10 Word candidates; dialogue is 2–10 `{id,card:Phrase,speaker:'you'|'partner',alternative?:true}` lines containing both speakers. Alternatives mark adjacent same-speaker lines. Essential phrases and topical Words are independent of dialogue; none are inferred or selected from dialogue scores. Old `phrases`, `featuredPhraseIds` and line scores are rejected. Server UUIDs are draft handles, globally distinct across both phrase sections. Evidence occurrence refs address either section within their owning group and match its exact snapshot. Omitted Word evidence is normal and has no flag; unresolved supplied source hints produce `vocab-source-missing` with `reason:'unresolved'`. Group order follows checklist index, even when titles repeat. Commit remaps selected draft refs to fresh local IDs. `/context` returns required seed-based `imagePrompt` alongside questions, checklist and usage; `/phrasebook-title` remains an unversioned title envelope.

`/phrase-breakdown` accepts `{schemaVersion:2,source:PhraseSource,context?}`. Context may contain `generation:{seed,ability,answers}`, `groupTitle`, and `speaker`. Seed ≤200; ability is `none|basics|conversational`; at most five answers with labels ≤200 and values ≤500; group title ≤500. The source includes the active occurrence translation and current phrase form. IDs are not sent to the model.

Breakdown returns `{schemaVersion:2,chunks,flags,usage}`, with 1–32 ordered meaningful chunks covering all meaningful source text. Each contains `{start,end,text,gloss,role,explanation,words:Candidate[],target}`. Words are Word-only, 0–32 per chunk. `target` is `{kind:'word',index}` or `{kind:'chunk',card:Chunk}`. Word evidence is optional; every present Evidence and every mandatory Chunk snapshot/ref must match the request, with Word spans inside their containing chunk. Source alignment tolerates uncovered punctuation/whitespace, never surrogate splits or guessed repeated-word offsets. Gloss and model Word translation are at most 500 units.

Every breakdown Word without `sources` has exactly one flag `{code:'word-source-missing',chunkIndex,wordIndex,reason:'omitted'|'unresolved'}`. Indices refer to the returned chunk/Word arrays; `flags` is required and may be empty. Invalid indices, duplicate flags, flags for evidenced Words, and unflagged missing evidence are rejected. Missing or unresolved model surface/occurrence hints do not invalidate an otherwise valid dictionary Word. Present evidence is still validated, never silently discarded at the wire boundary.

Equivalence is explicit and requires evidence: the indexed Word's encountered surface covers the chunk except edge punctuation/whitespace, and its normalized dictionary text equals that edge-trimmed source span. A Word without evidence cannot be selected as an equivalent target. The shared wire validator rejects invalid Word targets. At the model-output boundary, an in-range equivalence claim that fails these checks instead produces an exact-source Chunk target, retaining the validated dictionary Words; malformed or out-of-range indices remain errors. `caluroso` has one Word control; `食べません` versus `食べる`, `肉も` versus `肉`, and `aqui.` versus `aquí` have distinct Chunk and Word controls. Every meaningful chunk has exactly one target; other distinct Words retain independent controls.

## Library records and ownership

The web uses a fresh IndexedDB `loudmouth-topic-v3`, version 1, with seven tables:

| Table | Record |
|---|---|
| cards | `{id,identityKey,lang,type,createdAt,content:Card}` |
| decks | `{id,name,lang,createdAt,lastAccessedAt?,mode,order,readingDisplay,seedId?,generation?,ability?,illustration?}` |
| groups | `{id,deckId,title,position}` |
| memberships | `{deckId,cardId,createdAt,position,starredAt:string|null}` |
| occurrences | `{id,deckId,groupId?,section?:'essentials'\|'dialogue',cardId,position,translation,speaker?,alternative?:true}` |
| provenance | `{id,cardId,deckId,sourceKey,source:Evidence,createdAt}` |
| topicWords | `{id,deckId,groupId,cardId,position}` |

IDs are UUIDs; timestamps are ISO; positions are nonnegative integers. Card indexed lang/type equal content and creation time is immutable. Membership has one compound deck/card key and owns the star. Only Phrases have occurrences; equal target text shares canonical content and membership but retains independent occurrence IDs and meanings. Grouped occurrences require a section: essentials omit speaker/alternative, dialogue requires speaker and derives alternatives from adjacency. Genuine standalone imports omit group/section/speaker/alternative. Groups have stable IDs and required titles, never title-based identity. Word appearances use independent topicWords placements, indexed by `id,deckId,groupId,cardId,[deckId+groupId]`; shared Words keep one canonical card and deck membership with multiple placement IDs. Word provenance is unique by card/deck/source key. Historical provenance may reference deleted decks; deckless imports use `deckId:''`. Chunk evidence is not duplicated in provenance.

Generation settings belong to the phrasebook and are the actual sanitized creation request. Suggestions/imports never fabricate generation/audience settings. Suggested books may carry their explicitly chosen ability. Remembered ability is a separate preference updated only after successful commit.

### Atomic lifecycle

Generated, cached, saved and starred are distinct properties. Generation and caching alone do not persist learning content. Initial commit validates the entire draft, including unselected topics, before applying selected original indexes in ascending index order. It saves every selected essential, dialogue line and topic-local Word placement unstarred in one transaction with cards, groups, occurrences, memberships and provenance. There is no vocabulary pooling or chapter cap. Required titled groups and independent section bounds apply equally to generated and authored drafts. Duplicate titles remain distinct topics; duplicate phrase IDs, unknown fields, wrong section roles and cross-topic or mismatched evidence reject the whole commit. No discarded draft refs survive. Cancellation before transaction completion and write failure leave the prior library unchanged; after successful commit the saved book remains.

Starring atomically validates the current deck, resolves/inserts content by identity, records new Word evidence, ensures membership and toggles its star. A new membership starts unstarred then becomes starred. Reuse never resets another membership or overwrites content. Unstarring retains cards, membership and examples. Concurrent toggles serialize; missing decks/cards and cross-language targets fail atomically. Without an active phrasebook there are no star or review controls and no inferred arbitrary membership.

Removing a card from a deck deletes that membership, its Phrase occurrences and its Word placements, not reusable content/evidence. Deleting a card deletes its own memberships, occurrences, placements and Word provenance, never derivatives or evidence on other cards. Deleting a deck removes its groups/memberships/occurrences/placements and retains reusable cards and historical evidence, including orphans. Local ordering is compacted after deletion and dialogue alternatives are rederived. Language browse exposes all saved types.

Editing validates content and recomputes identity; collisions report “A card with this identity already exists.” Type/lang and Word senseKey/POS cannot be edited. Editing an explicitly active Phrase occurrence changes only that occurrence's English translation, not canonical meaning or other occurrences. Other editable form/teaching fields remain canonical. Chunk source/text/readings are read-only. Parent edits never rewrite historical evidence.

Joined entries are `{key,cardId,card,membership,occurrence?,wordPlacement?,sources}`. Phrase keys identify occurrences; topic Word keys identify placements; unplaced Word/Chunk keys identify deck/card pairs. Presentation uses occurrence translation without mutating content. Language browse has one entry per saved card keyed by card ID and no inferred active membership. Review deduplicates every type by starred membership, selecting the first displayed occurrence or placement. Stars therefore synchronize across essentials, dialogue and shared Words. Word examples prefer the active deck then creation time and ID.

Saved joins return standalone Translations, topic Phrase sections in group order (essentials then dialogue), topic-local Word placements, Chunks and unplaced Words. The default Phrasebook contents page links each topic's independent Essential phrases, Useful words and Conversation sections. Conditional Starred and supplemental Translations/Chunks/unplaced Words remain available; generic language browse stays separate. Saved positions are contiguous within topic+section, topic Word bucket or standalone occurrence bucket; membership positions are contiguous per deck/card type. New standalone occurrences prepend in incoming order. Reorder requires every current entry key exactly once, rejects movement between buckets, updates local positions atomically and rederives dialogue alternatives. No pooled vocabulary page, `cardOrder` or `importIndex` ordering exists.

### Namespace isolation and backup

Startup opens only `loudmouth-topic-v3`; it does not read, migrate or delete old databases or preferences. New namespaces are `loudmouth-topic-v3.lastDeckId`, `loudmouth-topic-v3.languageAbility.<lang>` and `loudmouth-topic-v3.phrase-breakdown.v1:`. Old physical databases and keys remain untouched. Repeated/concurrent initialization cannot erase learning data. Persisted pending illustration states become failed on startup because their nondurable HTTP requests ended with the previous browser session; startup never regenerates paid art.

`LIBRARY_SCHEMA_VERSION = 3`, independent of common `SCHEMA_VERSION = 2`. Full backup is `{schemaVersion:3,cards,decks,groups,memberships,occurrences,topicWords,provenance}`. Export reads all seven tables in one readonly transaction. Restore validates the complete graph before one atomic clear/insert transaction. Old/missing versions are rejected. Invalid input or write failure preserves the current library. CardBatch import/export and breakdown remain v2, not compatibility paths for old phrasebooks.

Chinese, Japanese, Spanish, Czech and Ukrainian use the same v3 library graph. This content cutover requires coordinated API/web release, but implementation does not authorize deployment. Native iOS's retired-route integration is unchanged.

Restore requires unique IDs and identity keys, valid timestamps, contiguous local positions, matching indexed fields and recomputed identity/source keys. Memberships require existing matching-language cards/decks. Every Phrase membership has an occurrence; every occurrence belongs to a Phrase membership and matching-language deck, with any group belonging to that deck. Section/speaker rules remain mandatory. Every topic Word placement belongs to a Word membership and a group owned by the same deck. Occurrence and placement IDs cannot collide. Every group has a live deck, including groups emptied by later edits. Provenance targets are existing Words of the snapshot language. Historical deck/source refs may dangle; when source refs resolve, they identify same-language Phrases/occurrences and supplied IDs agree. Historical text need not match edited live text. Never synthesize missing reverse relationships or interpretations.

### Illustration persistence

Optional `DeckIllustration` shares `{requestId,prompt}` and is either `{state:'pending'}`, `{state:'failed'}` or `{state:'ready',image:{dataUrl,mediaType:'image/png',width,height}}`. Prompt is trimmed, nonblank and at most 2,000 units. Ready art stores final PNG bytes, not a provider URL; validation shares the image API boundary: PNG data URI, base64 payload ≤8 MiB, decoded-file size ≤6 MiB, positive integer dimensions ≤4 megapixels and absolute 16:9 ratio error ≤0.03. Server decoding separately verifies pixel integrity and visible content; transparency is not required.

Commit snapshots optional illustration state without delaying text. `setDeckIllustration(deckId,requestId,next)` updates only an existing deck with matching request ownership and prompt; stale/deleted owners return false. A ready image cannot be overwritten by pending/failed state. The update is transactional, so a late completion cannot recreate a deleted deck or downgrade ready art. Backups retain and strictly validate the same discriminated states and final bytes.


## Contextual presentation

Breakdown cache keys serialize the exact versioned request including refs/context/readings. Cache contains validated analysis, never authoritative resolved library IDs or stars. Open, retry, regeneration, close and cache clearing make no durable writes. Ready/reopened/toggled targets resolve against current DB identity and membership. Regeneration failure retains existing analysis; saved teaching remains unchanged. A pending save that commits remains durable even when the UI closes; stale UI updates are suppressed.

Source rendering uses the full exact snapshot with only the selected UTF-16 span highlighted. Complete reading tokens can retain ruby; tokens cut at a span boundary render escaped plain text. Masking replaces the span with a constant blank placeholder and leaks no annotation. Never apply Japanese offsets to romaji.

Phrase review uses the active occurrence translation. Word review uses dictionary headword and its own pronunciation, with collapsible historical source examples after reveal. Chunk English-to-target review shows the contextual gloss and full original phrase with the span masked; reveal highlights/fills it. Target-to-English shows full highlighted source and hides gloss until reveal. Role, explanation and full source translation appear after reveal. Chunk audio speaks the full historical phrase. Direction/next-card changes reset reveal; swipe boundaries do not loop.

## Acceptance scenarios

1. Committing a phrasebook saves every selected topic's independent essentials, conversation and Word placements, unstarred; speculative unselected groups are absent.
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
12. Equal-title topics remain separate; an essential absent from dialogue survives reload and backup, and shared Words have multiple placements but one membership/star/Review entry.
13. Section-local reorder and deletion preserve contiguous positions, evidence snapshots and independent occurrence meanings.
14. Stale/deleted illustration owners cannot overwrite saved art; startup fails interrupted pending work without network calls, while ready PNG bytes survive backup and reload.
