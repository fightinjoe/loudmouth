# Design: Conversation quality experiments

Generated on 2026-09-04. Updated on 2026-09-06 after rejecting Experiment D.
Branch: api_improvements
Status: A COMPLETE; B COMPLETE (INSUFFICIENT); E COMPLETE (PARTIAL); D REJECTED; C DEFERRED
Mode: Builder

## Goal

The conversation-first `/textbook` output has the right broad shape—short conversation groups plus a `vocab` group—but quality is uneven. Some conversation titles are difficult to scan, opening lines are socially or grammatically awkward, positive/negative branches disappear, and highly specific commentary produces phrases with little reuse value.

Improve practical conversational quality while preserving the `{ title, groups }` response, card schema, provider-independent prompt, and fast Google path.

## Current position

- **Experiment A is complete.** Prompt constraints improved style but did not reliably preserve required
  meaning.
- **Experiment B is complete as an experiment.** Phrase-bank-first prompting improved the outputs, but
  the latest evaluation did not establish that `google` meets the quality bar. Preserve its current
  implementation and root eval outputs as the control; do not keep changing B.
- **Experiment E is complete with a partial pass.** Better Google-generated contexts reliably restore
  identity, primary-action, and safety-order goals, but occasional checklist-policy misses remain.
- **Experiment D is rejected.** Its first treatment repeated B3's validation-retry pattern and passed
  receipt validation without the required animal-derived vocab; its $0.010324 cost also left no margin.
- **Experiment C remains deferred.** A general rewrite call is too broad and slow for the specific gaps
  currently observed.

## Observed failure modes

- Checklist titles combine multiple goals and implementation detail, such as `Ask someone to dance & read the room's etiquette`.
- Models sometimes translate an abstract invitation literally instead of using the natural speech act for the setting.
- Generated groups tend to show only successful or positive outcomes.
- Context instructions can produce invented observations and one-off commentary rather than reusable language.

## Experiment A — prompt constraints and scalable patterns

**Status: implemented.** Change only the shared questions and generation prompts.

### Shape

- Require checklist titles to be 2–5 words, scan-friendly, and one communicative goal. Ban conjunctions, slashes, parentheticals, and explanatory detail in titles.
- Treat context as an anchor for the situation, role, and register—not a demand that every line mention a unique detail.
- Prefer short, reusable expressions and reject invented observations, personal backstory, and hyper-specific commentary.
- Require positive and negative outcomes across the phrasebook where the situation supports them: acceptance/refusal, success/recovery, continuation/closure. Do not force both branches into every conversation.
- Add abstract good/bad examples based on speech acts and failure classes, not one topic. For example: prefer a direct invitation over a literal ability question; reject literal or socially mismatched wording.
- Add a final self-edit for idiomaticity, social fit, brevity, reuse, and polarity coverage.

### Scalability constraint

Examples must describe reusable transformations, not prescribe topic-specific phrases. The prompt should teach the model how to recognize a bad pattern (`literal ability question in an activity venue`, `invented performance assessment`) and how to repair it, while requiring it to generate the target-language wording appropriate to the actual situation.

### Success criteria

- Titles are short, single-goal labels.
- Opening phrases express the natural speech act for the situation and setting.
- Relevant phrasebooks contain both positive and negative/alternative outcomes.
- Most cards remain useful when transferred to a nearby version of the same situation.
- No provider-specific output schema or extra model call.

### Implemented revisions

Experiment A ultimately included three prompt passes:

1. **Conversation shape:** short titles, compact conversations, natural speech acts, positive/negative
   coverage, reusable repair patterns, and a quiet self-edit.
2. **Reuse-first objective:** explicit priority for memorization and reuse over story realism; learner
   self-expression; context as a selector rather than decoration; shorter 3–6 turn conversations;
   safety-sensitive verification; and ordinary learner-facing vocab glosses.
3. **Essential concepts:** identify the topic's primary action plus every explicit learner identity,
   need, and hard constraint; require direct learner language and vocab coverage; preserve essential
   loanwords; require a checked constraint-statement conversation; and honor proficiency when call 1
   explicitly asks about it while otherwise remaining level-neutral.

The current Experiment A contract is recorded in `docs/API_DESIGN.md`.

### Evaluation findings

Evaluations used `salsa dancing` in Spanish and `ordering vegan food` in Japanese across Google
Flash Lite (`google`), Gemini Flash (`g-flash`), Claude Haiku where available, and GPT Luna.

#### What prompt constraints controlled reliably

- Conversation titles became short and scannable.
- Conversation groups stabilized around four turns with substantially less narrative padding.
- Vocab moved to a final `vocab` group with roughly 10–13 cards.
- Salsa reliably extracted `bailar` as the leading vocab item.
- Phrases generally became shorter and more reusable.
- Invented performance analysis and elaborate personal backstory decreased.

#### What remained model-dependent

- Gemini tended to overcorrect toward generic fragments or incomplete phrases.
- g-flash produced the richest language but still introduced technical or imagined situational detail.
- Luna was usually the most grammatical and coherent, but sometimes sounded instructional or formal.
- Haiku was coherent but could combine unrelated encounter stages and choose textbook-like vocabulary.
- Explicit role and proficiency context influenced generation inconsistently.

#### What prompt constraints did not enforce reliably

- All three vegan-food models omitted a direct equivalent of `I am vegan`.
- All three omitted `ビーガン` / `ヴィーガン` from vocab, even when the word appeared in a
  conversation and the prompt explicitly required essential loanwords.
- Call 1 did not create a distinct conversation for directly stating the defining dietary constraint.
- Linear conversations did not reliably preserve both positive and negative alternatives when the
  negative checklist conversation was unchecked.
- Safety invariants were inconsistent: models sometimes recommended apparently compatible dishes
  without first verifying ingredients or preparation.
- Call 1 inferred a severe allergy from strict veganism, converting a dietary or ethical constraint
  into an unstated medical claim.

#### Conclusion

Experiment A works as a **style layer**: it improves length, titles, tone, and average reuse. It does
not reliably enforce **semantic coverage invariants**. Repeating stronger `MUST` and `ALWAYS` language
did not make required identities, vocab anchors, alternatives, or safety constraints dependable across
models. This is the trigger for Experiment B.

## Experiment B — phrase-bank-first generation

**Status: complete; result insufficient for `google`.** The external `{ title, groups }` response and
card schema remain unchanged. Generation plans semantic coverage before assembling conversations.

### Entry contract

Experiment B inherits Experiment A's style rules and the reuse-first quality hierarchy in
`docs/API_DESIGN.md`. It must add structure for the invariants Experiment A could not enforce.

Before generating phrases, separate:

- **stated facts:** topic and selected context assertions that generation may rely on;
- **unstated facts:** medically, culturally, or personally significant claims generation must not infer;
- **essential concepts:** primary action, learner identity, need, hard constraint, and indispensable
  situation anchors;
- **communicative functions:** self-description, request, verification, modification, acceptance,
  refusal, recovery, and closure as applicable.

For `ordering vegan food`, `strict vegan` is stated; `allergy` and cross-contamination tolerance are
unstated. Required essential concepts include the conventional target-language terms for `vegan`,
`order`, and `animal-derived`, not only lists of prohibited ingredients.

### Shape

Plan a compact phrase bank before writing conversations. Each planned item should carry:

- communicative intent;
- natural target-language phrase and ordinary English gloss;
- speaker;
- essential-concept coverage;
- polarity or alternative role when applicable;
- a reuse signal: the word or short phrase that can be substituted;
- destination conversation group.

The bank must contain direct learner language for every explicit identity, need, and hard constraint,
plus likely partner language the learner must recognize. Required vocab lemmas are selected from the
same essential-concept inventory, not rediscovered after conversation generation.

Assemble short conversation groups from approved phrase-bank items. Do not invent connector lines
during assembly merely to create narrative flow. The implementation may keep this planning internal to
one model call or request structured planning data and discard it service-side; that choice should be
tested against reliability, token use, and latency before committing.

### Implementation decision and initial results

Experiment B keeps planning internal to the existing generation call. The prompt explicitly inventories
stated facts, significant unstated facts, essential concepts, and communicative functions; plans bank
items with coverage metadata; assembles only banked phrases; and derives vocab from the same inventory.
The learner-facing response and provider path remain unchanged.

Alternatives stay in the same conversation group. Consecutive alternatives may share a speaker even
when the result is not a coherent linear exchange. Phrase and word quality take precedence over dialogue
polish.

Two internal-plan runs (`run_b1`, `run_b2`) succeeded across every configured backend for both regression
topics. Compared with Experiment A:

- every B2 vegan-food backend produced direct `I am vegan` language and retained `ビーガン` or
  `ヴィーガン` in vocab;
- call 1 used neutral `Not specified` defaults for unstated significant facts and added a checked
  primary-action conversation;
- vegan-food alternatives, verification, modification, and refusals became substantially more common;
- `order` vocab still appeared in only two of four B2 outputs, despite occurring in all four ordering
  conversations;
- with an explicitly selected `Following` role in B1, only two of four backends produced direct learner
  language for that role;
- awkward literal ability questions and invented dance commentary still appeared occasionally.

A follow-up `run_b3` exposed the full planning structure and validated it service-side. This increased
Google output from roughly 2.3–3.3k to 4.0–5.0k tokens and latency from roughly 6–7.5s to 10–11.5s.
More importantly, only two of four salsa backends and one of four vegan-food backends completed: strict
cross-references produced invalid-response retries, while ChatGPT timed out. The structured variant was
therefore rejected and removed. Internal planning is the current Experiment B implementation; the B3
artifacts remain as evidence for that decision.

### Latest root evaluation — current Experiment B

The latest review uses the eight root YAML files under `api/evals/salsa-dancing/` and
`api/evals/ordering-vegan-food/`. Call 1 selected `Not specified` for every context answer, so this run
tests level-neutral default behavior. It does **not** test selected lead/follow role preservation or
explicit proficiency adaptation.

#### Performance

|Backend|Salsa generation|Vegan-food generation|
|---|---:|---:|
|Google Flash Lite (`google`)|6.660s / $0.007069|7.371s / $0.008760|
|Gemini Flash (`g-flash`)|19.582s / $0.018545|21.820s / $0.021043|
|Claude Haiku|25.951s / $0.019910|31.734s / $0.022224|
|GPT Luna|33.097s / $0.005609|41.973s / $0.007764|

Google is approximately 3–6 times faster than the alternatives in this sample. Luna is slightly
cheaper, so Google's decisive advantage is latency rather than lowest cost.

#### Goal-by-goal result

|Goal or invariant|Result|Evidence|
|---|---|---|
|Short, single-goal titles|Partial|Titles are short and scannable, but call 1 produced `Decline Or Accept Politely`, a conjunction joining two outcomes. Every backend inherited it.|
|Natural opening speech act|Partial|Haiku and Luna open salsa with natural invitations. Google and g-flash first emit literal `¿Bailas?` (`Do you dance?`) before a natural invitation; Google knew the better phrase but failed to discard the weaker candidate.|
|Positive and negative alternatives|Partial|All outputs contain both polarities somewhere. Luna places salsa acceptance and refusal together with the same learner speaker. Google separates acceptance into `Invite Someone To Dance` and refusal into `Decline Or Accept Politely`; the latter contains no acceptance despite its title. G-flash mixes alternative speakers.|
|Reusable, nearby-transferable cards|Mostly pass|Google is especially concise and reusable. G-flash adds narrower salsa detail (`turns`, `connection`, Cuban style, band); Haiku invents `You look very happy` and a partner's three-year backstory. Google's `Con cuidado` means `carefully/with care`, not the glossed warning `Careful`, so brevity sometimes becomes an incomplete or mismatched phrase.|
|Direct essential identity phrase|Fail|Google never says `I am vegan`; it teaches only prohibited ingredients. G-flash, Haiku, and Luna state the identity directly.|
|Conventional essential loanword in vocab|Fail|Only Google omits `ビーガン`/`ヴィーガン` from vocab despite using it in conversation. The other three lead vocab with it.|
|Primary action in learner language and vocab|Fail|Only Luna includes direct `注文したいです` plus `注文する` vocab. Google, g-flash, and Haiku omit `order` vocab; Google's `Confirm The Order` does not actually place an order.|
|Stated/unstated fact boundary|Partial|Google, Haiku, and Luna avoid an allergy claim. G-flash asserts `It is not an allergy` even though allergy status is `Not specified`; inventing a negative significant fact still violates the boundary.|
|Safety verification before compatibility|Partial|Google asks about broth before compatible/incompatible replies and verifies before reassurance. Haiku presents a specific item as vegan-friendly before ingredient verification. The other outputs are safer but still rely on restaurant assertions rather than always verifying preparation.|
|Selected learner role respected|Not evaluated|The saved salsa context selected `Dance Role: Not specified`. B1 showed direct `Following` language in only two of four backends, so this remains open.|
|Explicit proficiency honored|Not evaluated|No latest-root context selects proficiency.|
|No duplicate or orphaned cards|Pass structurally|All eight outputs have unique conversation text, a final vocab group, and vocab `source` values matching emitted conversation lines. Internal phrase-bank provenance remains unobservable after generation.|

#### Relative model quality

- **Luna:** strongest semantic coverage and conversation control. It alone includes `order` as both
  learner language and vocab; it handles same-speaker salsa alternatives cleanly. Its cost is lowest,
  but it is 5–6 times slower than Google.
- **Haiku:** broad and generally natural, with direct vegan/animal-derived coverage. It overproduces,
  invents personal observations/backstory, asks the learner the odd self-directed question `Is honey
  okay?`, and can claim compatibility before verification.
- **G-flash:** richest situational language, but often too specific. It misses `bailar` in salsa vocab,
  misses `order` in vegan vocab, muddles alternative speakers, and turns an unspecified allergy into the
  unsupported assertion that no allergy exists.
- **Google Flash Lite:** fastest and most concise, with strong structural compliance, exact vocab-source
  links, useful verification/modification language, and little invented detail. Relative weaknesses are
  semantic omission (`I am vegan`, vegan vocab, `order`), failure to choose the best phrase it already
  generated (`¿Bailas?` before `¿Quieres bailar?`), thinner vocab, occasional fragment/gloss mismatch,
  and weaker coordination of alternatives.

#### Unmet goals carried into Experiment D

1. **Reserve must-teach capacity first.** Before optional phrases or vocab, reserve one direct learner
   phrase and one vocab slot for every primary action, identity, need, hard constraint, and conventional
   category term. Lists of consequences do not satisfy a direct identity; confirmation does not satisfy
   the primary transaction.
2. **Require an actual primary-action card.** A checked conversation must contain the learner performing
   the topic's action, not only preparing, verifying, paying, or confirming.
3. **Make `Not specified` truly neutral.** Do not assert either a positive or negative value for an
   unspecified medically, culturally, religiously, or personally significant fact.
4. **Select, do not accumulate, phrase candidates.** For essential openings and learner phrases, compare
   candidate realizations and emit only the most idiomatic speech act; reject literal ability questions,
   incomplete fragments, near-duplicates, and gloss mismatches.
5. **Align alternatives.** Keep applicable alternatives in one destination group and assign them to the
   same responding speaker. Use an umbrella title such as `Respond To Invitations`; do not join opposite
   outcomes with `and` or `or`.
6. **Keep safety ordering local and explicit.** A specific option may be labeled compatible only after
   an ingredient/preparation verification in that group or an earlier selected group.
7. **Expand regression contexts.** Pin explicit `Follow` and `Lead` salsa cases, an explicit proficiency
   case, and strict-vegan-with-allergy-unspecified cases. Default-only evaluation cannot prove role,
   complexity, or fact-boundary invariants.

### Required invariants

- Every essential concept—including primary action, identity, need, hard constraint, and conventional
  category term—maps to an emitted phrase and vocab card.
- Every primary action, identity, need, and hard constraint has a direct learner-originating phrase;
  implication or enumeration alone does not count.
- Conventional essential loanwords are retained.
- Stated facts are preserved; `Not specified` remains neutral; significant unstated facts are not
  invented positively or negatively.
- Safety-sensitive recommendations follow explicit verification.
- The learner's selected role is respected on every `speaker:"you"` line.
- Explicitly selected proficiency affects complexity; otherwise generation stays level-neutral.
- Conversation cards come from the planned phrase bank; weaker candidate phrases and connectors are
  discarded rather than accumulated.
- Applicable positive/negative alternatives share one group and one responding speaker.

### Alternatives decision

Positive and negative variants remain in the same conversation group. Two or three alternatives may
appear consecutively even when the result is not a linear exchange. All alternatives to the same
prompt must carry the same speaker. The group uses one umbrella communicative goal—such as
`Respond To Invitations`—rather than a conjunction joining outcomes. Do not repeat the triggering
invitation or question solely to make the alternatives look like a transcript.

### Benefits

- Reuse, essential coverage, polarity, and role become explicit planning dimensions.
- Required vocab is derived from the same plan as learner phrases.
- Less opportunity to invent a line solely to connect turns.
- Easier to detect duplicate, unsafe, contradictory, or hyper-specific cards before emission.

### Risks

- Mechanical planning may reduce natural flow or produce stilted phrase frames.
- A single call still has to plan, translate, assemble, and serialize a larger structure.
- Exposing intermediate planning adds validation and token cost; hiding it may preserve instruction
  noncompliance.
- Consecutive alternatives trade transcript realism for phrase coverage; speaker consistency must make
  the relationship legible without adding branch metadata.

### Evaluation

Compare against the final Experiment A outputs on title scanability, grammatical correctness,
essential-concept coverage, polarity, card reuse, conversation coherence, safety, latency, and cost.
Keep the learner-facing API unchanged.

Minimum regression cases:

- **Salsa:** natural invitation; selected lead/follow role preserved; no invented technical assessment;
  `bailar` retained; useful acceptance/refusal behavior under the chosen alternatives design.
- **Vegan food:** direct `I am vegan`; general vegan-options question; conventional `ビーガン` or
  `ヴィーガン` vocab; no inferred allergy; no apparently safe dish recommended before verification;
  reusable verification, modification, and refusal language.

## Experiment C — generation plus critic/rewrite call

**Status: proposed.** Add a second model call that reviews and rewrites the generated phrasebook.

### Shape

Call 1 generates the complete phrasebook. Call 2 receives the candidate and applies a constrained quality pass: fix grammar and social fit, remove hyper-specific or non-reusable lines, restore relevant positive/negative variants, and preserve valid target-language intent and the response schema.

The critic should not add content indiscriminately or rewrite correct regional/register choices. It should return the same `{ title, groups }` shape.

### Benefits

- Separates creative generation from quality control.
- Directly targets grammar, awkwardness, and redundancy.
- Can operate across all topics without embedding topic examples.

### Risks

- Adds latency and cost, weakening the reason to prefer `google`.
- A critic can incorrectly “repair” valid language or flatten regional variation.
- Token budget and failure handling become more complex; either call can fail or return malformed JSON.

### Evaluation

Use only if A and B leave recurring defects. Measure quality gains against added latency, cost, rewrite regressions, and malformed-response rate.

## Experiment E — context and checklist generation

**Status: complete; partial pass.** Call 1 now produces materially better Google questions and
checklists without changing the response or client flow.

### Why E precedes D

The hand-corrected context diagnostic showed that call 1 is a material part of Google's quality gap.
Across five corrected-context attempts:

- direct `I am vegan` and vegan vocab appeared in 5/5 vegan outputs;
- an actual ordering group appeared in 5/5;
- same-speaker salsa responses were grouped correctly in every successful salsa output;
- `order` vocab still appeared in only 1/5 and `animal-derived` vocab in 2/5;
- literal `¿Bailas?`, fragments, and gloss mismatches remained;
- one of five salsa attempts returned `502` after malformed JSON and retries.

Better context therefore fixes several coverage failures but not the second-call selection failures D
targets. E should establish the best context Google can generate before D measures residual call-2 gaps.

### Call-1 requirements

Before writing questions or checklist items, call 1 must identify the topic's stated facts, primary
learner action, explicit identity/need/constraint, applicable alternatives, and safety ordering.

Questions must:

- ask only unknown axes that materially change the taught language;
- never ask the learner to weaken, redefine, or explain the motivation for a stated identity;
- separate medical, ethical, dietary, cultural, religious, and cross-contamination claims;
- use `Not specified` as the default for significant unstated facts;
- choose a useful ordinary default for non-sensitive situational axes rather than making every answer
  unspecified;
- avoid options that contradict the topic;
- ask proficiency only when it materially changes complexity.

The checked checklist must:

- contain a goal where the learner performs the primary action itself;
- contain a direct statement goal for every explicit identity, need, and hard constraint;
- use one umbrella response goal for positive/negative alternatives, never an `and`/`or` title;
- place safety verification before recommendation, transaction, or acceptance;
- reserve required goals before optional social, payment, and closure material;
- keep every title to 2–5 words and one communicative goal.

### Evaluation

1. Preserve `run_b5` as the original Google-generated call-1 control and the current hand-corrected
   contexts plus `context-diagnostic/` runs as the idealized-context diagnostic.
2. Generate call 1 with `google` five times for salsa and five times for vegan food. Save every
   questions/checklist response independently.
3. Score stated-fact preservation, question usefulness, option separation, defaults, primary-action
   coverage, direct identity coverage, alternatives title, safety order, and title scanability.
4. For each passing context, run Google call 2 once and check whether it reproduces the hand-corrected
   context gains.
5. Compare the resulting full Google → Google outputs with both `run_b5` and the hand-corrected outputs.

### Success gates

- 5/5 vegan call-1 outputs preserve vegan as stated and never infer allergy or tolerance.
- 5/5 include distinct checked goals for stating vegan identity and placing the order.
- 5/5 salsa outputs use a single-goal umbrella title for responding to invitations.
- 5/5 include the topic's primary action as a checked goal.
- Every significant unknown uses a neutral default; ordinary axes use useful defaults.
- Every title is 2–5 words with no conjunction, slash, parenthetical, or combined goal.
- All ten call-1 responses are valid on the first attempt.
- Passing contexts reproduce the direct-identity, vegan-vocab, actual-ordering, and alternative-grouping
  gains seen with hand-corrected contexts.

### Results

The final call-1 passes produced:

- 10/10 valid first-attempt responses;
- 5/5 vegan contexts preserving vegan as stated, using neutral cross-contamination defaults, naming a
  direct vegan statement goal, naming the order action, and placing verification before ordering;
- 5/5 salsa contexts naming the invitation action and an umbrella invitation-response goal;
- 9/10 contexts satisfying every mechanical title rule; one vegan title used `and`;
- one of five salsa contexts adding a redundant decline goal beside its umbrella response goal.

Google call 2 was then run on three passing salsa contexts and three passing final vegan contexts:

- direct `I am vegan`, vegan vocab, and an actual order appeared in 3/3 final vegan outputs;
- `order` vocab appeared in 2/3 and `animal-derived` vocab in 1/3;
- all three salsa outputs opened with a natural invitation and omitted literal `¿Bailas?`;
- awkward order glosses, incomplete phrases, and insufficiently verified recommendations remained.

Experiment E confirms that call 1 caused a material share of Google's prior failures. It does not close
the remaining call-2 selection and vocab-retention gap. The improved call-1 prompt becomes the new
baseline; the residual failures move to D.

### Decision rule

- If E meets its call-1 gates and reproduces the diagnostic gains, keep the improved call-1 prompt and
  proceed to D using E-generated contexts.
- If call 1 improves but call 2 still misses required vocab or selects weak phrases, treat those as D
  scope rather than adding more checklist wording.
- If E cannot reliably generate the required checklist with Google, do not hide the failure with a
  hand-authored production context; evaluate whether call 1 needs a stronger model separately from the
  preferred fast call-2 path.

## Experiment D — lean verified seed bank for Google


**Status: rejected; rolled back.** The first Google treatment hit multiple explicit stop conditions.
Experiment E remains the production path; the D prompt, receipt validator, and contract tests were
removed.

### Problem

With Experiment E contexts, Google now reliably receives explicit identity, primary-action, alternative,
and safety-order goals. The remaining failures are inside call 2:

- required `order` and `animal-derived` vocab still disappear across runs;
- awkward order glosses and incomplete phrases survive self-editing;
- a recommendation may claim a specific dish is suitable without verifying that dish;
- required language appears in conversation but is not consistently promoted into vocab.

This is primarily a **selection, reservation, and coverage-accounting** problem. A general rewrite
critic would be broader, slower, and riskier than the observed gap requires.

### Hypothesis

A small, service-verified must-teach receipt plus contrastive candidate selection can make Google retain
its best phrases and required vocab while adding little output and no second model call. This tests a
middle ground between Experiment B's unverifiable hidden plan and B3's expensive full exposed plan.

### Shape

1. Keep the current hidden inventories and phrase bank.
2. For each essential opening or learner-originating phrase, privately generate competing realizations,
   rank them by natural speech act, idiomaticity, reuse, and brevity, and emit only the winner. A weaker
   candidate must not survive beside a stronger near-duplicate.
3. Reserve required phrase and vocab slots before optional content.
4. Add one compact service-only top-level `coverage` array to the model response. Each essential item
   carries:
   - stable concept ID;
   - kind: primary action, identity, need, hard constraint, or conventional category;
   - ordinary English concept label;
   - exact emitted learner phrase text;
   - exact emitted vocab text.
5. Validate that:
   - at least one primary-action item exists;
   - every receipt learner phrase exists in a conversation group with `speaker:"you"`;
   - every receipt vocab text exists in the final `vocab` group;
   - IDs are unique and references are exact;
   - the compact receipt stays within the phrasebook's existing essential-concept budget.
6. Discard `coverage` service-side. Return the unchanged `{ title, groups }` response.

The receipt does not duplicate every phrase, reading token, fact, or conversation assignment. That is
the critical difference from B3, whose full exposed phrase bank roughly doubled Google output and broke
provider reliability. Existing validation-only retry behavior applies to a malformed or inconsistent
receipt; no semantic content is silently patched service-side.

### Implementation plan

1. **Freeze controls.** Preserve the current root YAML files and their contexts as the Experiment B
   control. Pin five contexts: default-neutral salsa; `Follow` plus beginner proficiency; `Lead` plus
   intermediate proficiency; default-neutral vegan; and strict vegan with allergy unspecified.
2. **Add contract coverage.** Test receipt parsing, exact phrase/vocab references, direct learner
   speaker, primary-action presence, discarded internal fields, malformed receipts, caps, and retry
   behavior.
3. **Implement the lean receipt.** Update the shared generation prompt and validator only. Do not add a
   provider-specific prompt, extra call, client field, branch schema, critic, or deterministic
   translation logic.
4. **Add candidate selection.** Require winner-only emission for natural openings and other essential
   intents; reject literal ability questions, fragments, near-duplicates, and gloss mismatches before
   serialization.
5. **Run paired evaluation.** For `google`, run five B-control and five D-treatment generations against
   each of the five pinned contexts. Use identical saved contexts. Run one D compatibility generation
   per topic on each non-Google backend.
6. **Score blind to model.** Score semantic coverage first, reuse second, grammar/idiomaticity third,
   and story coherence last. Compare Google D both to Google B and to the latest Luna output.

### Success gates

- **Semantic coverage:** 25/25 Google D samples contain every required direct learner phrase and vocab
  lemma, including primary action, explicit identity, and conventional category/loanword.
- **Natural speech act:** every salsa sample opens the invitation goal with a direct invitation; no
  literal ability question survives beside it.
- **Alternatives:** every applicable group includes positive/negative variants with one responding
  speaker.
- **Fact and safety:** zero invented significant facts; zero compatibility claims before explicit
  verification.
- **Role/proficiency:** 10/10 selected-role samples preserve the role on every learner line; beginner
  samples are observably simpler than intermediate and level-neutral controls without losing required
  content.
- **Structure:** zero duplicate conversation cards, broken vocab sources, malformed responses,
  validation retries, or provider compatibility failures.
- **Latency:** Google D generation p50 at most 8.5 seconds, p95 at most 12 seconds, and no request reaches
  the 15-second timeout. Latest passing E contexts measured roughly 5.7–6.7s for salsa and 7.1–8.4s for
  vegan food.
- **Cost and tokens:** average Google generation cost at most $0.010 and total tokens no more than 15%
  above the paired E control. Model-call count remains one.
- **Relative quality:** blinded practical-language scoring places Google D within 0.5 points of Luna on
  a five-point idiomaticity/reuse scale while matching or exceeding Luna's semantic-invariant pass rate.

### Results

Five evaluation contexts were pinned: default-neutral salsa, beginner Follow, intermediate Lead,
default-neutral vegan, and strict vegan with allergy unspecified. The first treatment used the
default-neutral vegan context. It was stopped before the planned 25-sample paired run because one sample
was already enough to trigger the rollback rules:

- the first model response contained malformed JSON and required a validation retry, repeating B3's
  reliability failure and violating the zero-retry structure gate;
- the successful retry took 9.118 seconds, used 6,590 total tokens, and cost $0.010324. One sample
  cannot decide the average-cost gate, but it left no margin below the $0.010 target;
- it retained direct `I am vegan`, `ヴィーガン` vocab, and `注文する` vocab, but omitted an
  animal-derived lemma from vocab even though `動物性のもの` appeared in conversation;
- the service accepted the response because exact-reference validation can prove only that each declared
  receipt item points to emitted cards. It cannot prove that every essential concept was declared or
  that a declared vocab reference is the correct lemma without independently deriving the inventory.

The last point falsifies the lean-receipt hypothesis, not merely this prompt wording. A self-reported
receipt is structurally verifiable but not complete enough to enforce semantic coverage. Continuing the
paired run would spend evaluation budget after the experiment had already made its zero-retry and
25/25 semantic-coverage gates impossible.

### Stop and rollback rules

- Reject D if the compact receipt causes any provider failure in the compatibility run or repeats B3's
  retry pattern.
- Reject D if semantic coverage improves by sacrificing fact safety, role fidelity, or useful language.
- Reject D if latency, token, or cost gates fail; retain Experiment E as the production path.
- Do not fall through to an unvalidated response when receipt validation fails.
- Do not add Experiment C as a stopgap. If the one-call receipt remains incomplete but otherwise meets
  reliability gates, separately evaluate a very small planner-before-generator call as a new decision;
  its total Google latency must remain below the faster non-Google backend.

## Decision

Experiment A is complete and remains the style baseline. Experiment B's internal phrase-bank approach
materially improved identity language, loanword retention, alternatives, and safety across the stronger
models without changing the API or adding a call. The latest root evaluation proves that its invariants
are not yet reliable: Google misses the direct vegan identity and essential vocab; three backends miss
the primary action in vocab; natural opening selection, fact neutrality, and alternative alignment
remain inconsistent.

Experiment E is complete with a partial pass. It establishes that call 1 was a material bottleneck:
Google now reliably generates direct vegan-identity, primary-action, and safety-order goals, and passing
contexts reproduce direct identity, vegan vocab, actual ordering, and natural salsa invitations.
Occasional redundant/missing alternative goals and one conjunction title keep E from a perfect pass.

Experiment D is rejected. Its self-reported receipt could validate exact references but could not prove
that the model declared every required concept. The first treatment also repeated B3's malformed-output
retry and left no cost margin. The implementation was rolled back, leaving Experiment E as the current
path.

Experiment C remains deferred. A broad critic is not justified while the known failures can still be
separated between call 1 and call 2 and the preferred model's primary advantage is speed.

## Verification plan

1. Preserve `run_a4` under both topic directories as the final Experiment A baseline.
2. Preserve the current root YAML files and `context.json` files as the latest Experiment B control.
3. Run API contract tests before each live evaluation.
4. Score E-generated contexts and any future experiments on semantic coverage first, reuse second,
   grammar/idiomaticity third, and story coherence last.
5. Use pinned default, selected-role, proficiency, and strict-constraint contexts.
6. Record latency, cost, malformed output, retries, duplicate cards, vocab-source integrity, and
   unplanned connector lines for every sample.
7. Preserve the Experiment D contexts and stopped first-treatment artifact as evidence; do not resume
   the paired run without a new mechanism that can verify inventory completeness independently.
