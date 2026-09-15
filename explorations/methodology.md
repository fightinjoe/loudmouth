# UI exploration methodology

## Purpose

Explore interface decisions in small, runnable artifacts before changing the app. Each artifact combines live specimens with concise reasoning, following the example of the [Pane Protocol](../web/docs/PANE_PROTOCOL.html). The result should be easy to iterate on in a browser and useful as a visual and interaction reference for both web and native iOS implementation.

Explorations are versioned with the project but live outside `web/`, `ios/`, and their build pipelines. They are proposals and evidence—not production components or approved specifications. Adoption is a separate, explicit step.

## Directory contract

```text
explorations/
  methodology.md
  card-styling/
    CARD_EXPLORATION.html
```

Create one descriptively named, kebab-case directory per concept. Keep that study's HTML, optional local assets, and any deliberately retained screenshots inside its directory. Prefer a single self-contained HTML file with inline CSS, JavaScript, and fixtures. Keep observations and decisions in that same document rather than scattering them across reports.

The [card styling study](card-styling/CARD_EXPLORATION.html) is the first example. It explores conversation topic groups, vocabulary, and starred cards as distinct grouping types. Its current visual choices are not requirements for other studies.

## What every study contains

1. **Question and boundary.** Name the surface, the user task, the decision to make, and non-goals. State whether examples compare competing treatments of the same surface or different surfaces with different purposes.
2. **Live specimens.** Put the working examples near the top. Show the component in its real context: multiple cards, alternating turns, grouping boundaries, or surrounding panes—not only an isolated ideal specimen.
3. **Experiment controls.** Expose only useful variables, with shared controls where comparison requires consistency. Include a reset to a known starting state. Explain what is interactive and what is intentionally not implemented.
4. **Stress cases.** Include realistic difficult content and relevant states. Test the hierarchy without optional information, not only with everything visible.
5. **Observations and decisions.** Distinguish facts observed in a specific environment from hypotheses, preferences, and accepted decisions. Retain concise reasons for rejecting a direction.
6. **Implementation handoff.** Record the hierarchy, geometry, state transitions, data assumptions, and unresolved platform checks needed to reproduce the intent. Link to existing product or schema contracts instead of redefining them.

## The exploration loop

### Frame

Read the relevant product, UX, schema, and existing implementation references. Separate current application behavior from proposed behavior. Use existing contracts for API-backed states; for example, a conversation alternative should be exercised through actual `or: true` metadata rather than a decorative separator unrelated to data.

Write one decision-sized question. Broad subjects may contain related groupings, but identify their different jobs. Do not make a vocabulary layout look like dialogue solely to force a side-by-side comparison.

### Explore

For an undecided visual direction, start with a small number of meaningfully different treatments rather than many cosmetic variations. A deliberately extreme option can reveal preferences that incremental changes cannot.

When comparing treatments of the same purpose, hold content and controls constant. When comparing different grouping types, use appropriate fixtures for each and explain the distinction. Include enough adjacent content to expose rhythm, density, alignment, and repetition.

Prefer static, hand-authored fixtures and local state. No backend, authentication, production renderer imports, package installation, or build step should be needed to open the HTML. Do not add nonfunctional buttons that imply implemented behavior. Clearly label simulated or omitted interactions.

### Stress and verify

Open the actual artifact in a browser; inspect its appearance and exercise its controls. Verify changes on the surface that changed, rather than relying only on source inspection or a test suite.

Choose cases appropriate to the concept. For multilingual cards, these include:

- Spanish; Chinese with tone-marked pinyin above characters; Japanese with furigana or a separate romaji line.
- Short responses and long phrases, narrow phone widths, and larger text.
- Readings or translations hidden, without empty placeholder rows.
- Conversation alternatives and interchangeable speaker sides.
- Selected and unselected items, collection updates, and empty collections.
- Keyboard focus, touch-target size, and text wrapping without clipping.

Record the actual browser/device, content and control settings, observed result, and any unverified behavior. A preview width or browser text-scale control is not proof of physical-device behavior, VoiceOver support, or native Dynamic Type. Keep those checks explicitly open until exercised. Do not claim keyboard or screen-reader verification from markup alone.

### Decide and iterate

Use a compact record inside the HTML:

| Field | What to record |
|---|---|
| Status | Exploring, selected for implementation, or archived |
| Question | The decision this study addresses |
| Observation | Environment, settings, and what actually happened |
| Decision | Accepted or rejected treatment and why |
| Open checks | Unresolved questions or unverified platforms |
| Handoff | Relevant source contracts and implementation destination, when known |

Update the decision record as feedback arrives. Replace rejected live treatments when useful; preserve their rationale in the document and their implementation in version history. Do not silently turn an experiment into a universal design rule.

### Adopt separately

After a direction is explicitly selected, implement it in the target app as a separate change. Treat the exploration as a behavioral and visual reference, not reusable production infrastructure. Translate intent into the platform's components and accessibility model; do not blindly copy CSS values into SwiftUI.

Verify the adopted behavior on the real target surface. Record meaningful differences or remaining checks in the study. An exploration's browser verification does not validate its production port.

## Working on several studies concurrently

- Give each study its own directory and a named owner. Independent studies should not edit one another's fixtures, styles, or state.
- Share this methodology and links to authoritative project documents, not a mutable global stylesheet, runtime, or fixture registry. Avoid an exploration framework until demonstrated needs justify one.
- Keep ordinary study work confined to its directory. Changes to this methodology are coordinated separately; adding a study should not require touching it or a shared index.
- For multiple people or agents editing concurrently, prefer a branch and Git worktree per study, such as `explore/navigation` in a sibling worktree. Branch from a commit containing this directory contract when available. Never share an actively edited working directory without explicit file ownership.
- Use separate browser tabs, and separate ports if a study truly needs a local server. The default standalone HTML needs neither a server nor a port.
- Integrate finished study directories independently. Do not require unrelated studies to finish, agree on visual direction, or modify production code together.
- Reconcile any cross-study design conflicts explicitly at adoption time. A local experiment does not silently override another study or the app's design contract.

## Completion boundary

An exploration iteration is ready for review when its requested specimens and interactions work, relevant stress cases have been exercised, observations and limitations are accurate, and links resolve from the study's current location. Remove throwaway verification files and obsolete scaffolding; retain only material useful to future review or implementation.

Completion means a reviewable experiment—not necessarily a final design selection. User feedback may start the next iteration without making the previous artifact a production specification.
