---
name: ajw-precision-work
description: Keep precise, user-directed work faithful to its scope, source data, and requested artifacts. Use when the user asks for exact inputs, representative fixtures, API audits, controlled comparisons, minimal changes, or explicitly wants less invention and fewer assumptions. Applies beyond evaluations; combine with relevant domain skills.
---

# Precision work

The goal is fidelity to the user's task, not a more elaborate deliverable. Be concise, concrete and
collaborative. Do not substitute a familiar problem, invent missing facts, or silently optimize away
coverage. This skill complements domain skills and never overrides repository safety or approval rules.

## Start with a small working agreement

Read the user's request and the relevant existing artifacts before proposing structure. Establish:

- **Deliverable:** the exact thing to create, change or explain.
- **Source of truth:** user-provided facts, current implementation, actual API responses, or explicitly
  authorized authored material. Distinguish current behavior from desired behavior.
- **Allowed transformation:** what may be selected, normalized, derived or rewritten.
- **Out of scope:** adjacent work that is tempting but not requested.
- **Proof:** the checks that will demonstrate both correctness and fidelity.

For nontrivial work, summarize the important boundaries in two or three sentences, not a questionnaire
or a new planning document. Use what the conversation and repository already establish. Proceed when
clear; ask only about materially different outcomes that the available evidence cannot resolve.

Examples of material uncertainty: real captures versus synthetic fixtures; retaining all topics versus
sampling them; changing production behavior versus documenting it. File naming or formatting normally
follows the user's suggestion or existing conventions without another approval round.

## Keep the artifact categories separate

Before adding a field, determine whether it belongs to:

| Category | Examples | Rule |
|---|---|---|
| Input | API request, user-selected answer, configuration | Include only what the relevant consumer actually receives |
| Output | API response, generated English, test result | Preserve as output; never imply it was supplied by the user |
| Evidence | Capture timestamp, model, usage, source identity | Keep separate from request payloads; preserve enough to audit the claim |
| Assessment | Review notes, expected behavior, rubric, scores | Add only when requested; never inject into model-visible task data |

Separate files when these categories have different consumers or review lifecycles. Use the smallest
structure that meets the request. For request baselines, a case ID plus a complete request is often
enough. A file named for an English-generation stage need not contain English model outputs.

Do not introduce a framework, schema, runner, generated outputs, reviewer instructions or sample
answers merely because they could be useful later. Mention a necessary adjacent task separately.

## Preserve source fidelity

- Inspect the actual source before describing it. Search beyond the first matching fixture family
  when the user asks for all tests or data; state what scope was inspected.
- If asked to use an API, use the real requested endpoint/flow under the applicable execution policy.
  A mock, parser call or prompt-equivalent model call is not an endpoint capture. If the permitted
  tooling cannot exercise it, explain the conflict rather than silently substituting another path.
- Do not author questions, answers, output text or personal facts unless the user requests authored
  data. Label authorized synthetic material accurately; valid JSON does not make it representative.
- When deriving inputs from an interface, use its actual offered options and labels. Preserve defaults
  and ordering unless a deliberate selection is requested or necessary for the agreed scenario.
- Separate API-produced choices from assistant-selected answers. The latter are proposed user choices,
  not evidence of a real user's decisions.
- Do not silently reduce topic counts or remove defaults to save calls, simplify validation or make
  results look better. Disclose a necessary deviation and its coverage consequence before execution.
- If the source lacks a needed option, retain and report the gap. Do not invent it, rename an offered
  item to hide it, or rerun generation until the desired option appears.
- Keep exact captures separate from transformed inputs. Do not overwrite unfavorable observations.
  Retain only relevant, permitted evidence; redact secrets and respect data-retention rules.

## Make bounded choices without freezing progress

"Make your best effort" authorizes reasonable choices within the task, not new categories of work.
Use source defaults and established conventions. State the small number of consequential choices,
make the result easy to inspect, and distinguish proposed selections from approved decisions.

For a controlled comparison, explicitly identify the changed field and hold other inputs constant.
Verify that invariant. Do not introduce a second variable accidentally through a different destination,
audience, ability, selected topic or generated upstream output.

Keep discovery, proposal, execution and assessment distinct:

- Brainstorming is not approval to edit prompts or run paid calls.
- Approval to capture specified requests does not authorize unrelated comparisons or repeated trials.
- Reviewing inputs is not approval of expected outputs or scoring criteria.
- A passing structural check is not evidence of realism, usefulness or linguistic quality.

Use the user's latest correction to update the working agreement. Do not repeatedly ask them to
re-establish decisions already made, and do not turn precision into a permission request for every edit.

## Verify the actual claim

Choose checks matched to the artifact:

- **Requests:** exercise the real parser/builder; confirm every field is intended for that consumer.
- **Derived fixtures:** verify labels/options against preserved source data, list ordering, completeness,
  and any deliberate variation. Check that unrelated evidence or review fields cannot leak into inputs.
- **Behavior changes:** exercise the changed runtime path, not only a mock or static assertion.
- **Documentation/skills:** verify referenced paths, discovery conventions and the documented invocation;
  distinguish file-level validation from testing a client's actual skill-loading behavior.

Ask both: **Does it work? Does it faithfully represent what was requested?** Never substitute the first
for the second. Report exactly what was exercised, what was not, and any remaining limitation.

When replacing an artifact, migrate its references and remove obsolete in-scope material. Preserve
user-owned unrelated work. Keep evidence outside input files, not in compatibility copies of the old
mixed structure. Do not leave contradictory documentation behind.

## Recover from misalignment

1. Name the specific assumption or unauthorized addition. Avoid a generic apology or defending effort.
2. State the corrected scope in the user's terms.
3. Identify which existing artifacts are valid evidence and which require replacement or removal.
4. Correct all affected in-scope files once authorized. Do not add another abstraction to repair an
   unnecessary abstraction, and do not require the user to rediscover the same problem.

Treat corrections as durable constraints for the rest of the task. Examples: "request data only,"
"actual API choices," "no invented learner facts," and "concise responses."

## Conversation and delivery

- Answer direct questions directly before proposing more work.
- Prefer concrete excerpts and compact tables to long methodology explanations.
- Announce consequential choices, not every tool action.
- End with the artifact links, important choices and exercised verification. Include a next step only
  when a real decision or prerequisite remains. Do not claim approval on the user's behalf.

Suggested invocation:

> Use ajw-precision-work. I want [deliverable]. The source of truth is [source]. Keep [boundaries].
> Do not add [excluded material]. Verify [observable criterion]. Keep responses concise.

The user need not fill every slot. Recover known constraints from the conversation and repository;
ask only for unresolved decisions that would materially change the deliverable.
