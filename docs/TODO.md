# API and developer tooling

- Add an app developer mode that displays API response diagnostics, including
  `vocab-source-missing` flags for generated vocabulary without resolved phrase evidence. Do not
  expose these diagnostics in the normal learner experience.
- Evaluate removing formatting, normalization, and stripping instructions from the phrasebook
  translation prompt and moving deterministic transformations into endpoint code. Obtain initial
  approval before editing prompt `*.txt` files, then run before-and-after regression evaluations for
  output behavior, latency, and token usage.