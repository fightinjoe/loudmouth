---
kind: proposal
status: proposal
summary: Future card identity, client storage, iOS/web convergence and optional detection/repair (lane C) work; nothing here is implemented.
verified: 2026-11-12
---

# Identity, storage, convergence and repair plans

Nothing on this page is implemented or scheduled. Current behavior is owned by the [card schema](../card-schema.md), the [API design](../api-design.md) and its endpoint pages, and [evaluation guidance](../evals/index.md). Each item below needs its own contract and release decision before it becomes work in [`todo/`](../todo/index.md).

## Card identity

Distinguish record identity, revision equality, semantic equivalence, similarity and placement deduplication. Review concrete same / related / distinct / uncertain examples before changing sharing, stars, repair propagation or saved source evidence. Retrieval proximity is not authority to merge cards.

## Storage

Choose durability, portability, caching and synchronization requirements before adding accounts, a database, a queue or a vector service. Define ownership, privacy, retention/deletion, offline behavior and cost. Remaining stateless is a valid outcome; no deletion of existing user data is implied.

## iOS/web convergence

Inventory endpoint/schema, creation, evidence, stars/review and backup drift between the native iOS app and web. Use shared versioned conformance fixtures and an actual client smoke before claiming parity. Preserve intentional UX differences and coordinate release ordering. Native legacy generation assumptions need inspection rather than an inferred migration path.

## Optional detection and repair (lane C)

Detection/repair is not an acceptance gate and must not become a required serial stage before usable content. If it is revisited, assess the whole detection → coverage gate → repair → atomic application process: recognizing a defect does not guarantee review completion or a safe applied correction. Known-location repair is oracle-assisted capability measurement, not detector success. A rejected unsafe patch is preservation, not a credited correction. The existing offline C contracts are described in [evaluation guidance](../evals/index.md#c-detection-and-repair-contracts); they are not a selected production architecture.
