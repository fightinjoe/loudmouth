---
kind: record
status: current
summary: Tile generator for phrasebook background artwork and a per-phrasebook color picker.
verified: 2026-11-12
---

# Phrasebook tile generator and color picker

Part of the [backlog](../backlog.md).

- **What:** a generator for seamless, repeating background tiles for each phrasebook, and a color picker that sets the phrasebook's accent and persists it with the phrasebook. Decided by the owner on 2026-11-12: the image model generates the tiles, and `/context` may choose each tile's subject matter and colors, as it already writes the seed-based cover `imagePrompt` ([`/context`](../../api/context.md)). Changing what `/context` returns is a prompt and contract change: it needs owner approval of the prompt edit and before-and-after evaluations.
- **Why:** owner request, 2026-11-12. Today `/phrasebook-image` returns one 16:9 watercolor cover, not a seamless tile, and missing, pending or failed artwork falls back to the shared repeating frog paper (`web/app/public/textbook/frogs.png`). Every phrasebook color derives from `--phrasebook-accent` in `web/app/src/styles/textbook.css`, but no per-phrasebook accent is stored, so every phrasebook is the default green ([design](../../design.md#phrasebook-view)).
- **Open questions:** whether `/context` returns tile subject and colors as new fields or rewrites the existing `imagePrompt`; whether the color picker's default accent comes from `/context`'s colors; whether the image model produces seamless edges reliably or code must blend them.
- **Done when:** each phrasebook has its own seamless tile from the image model and a stored accent that the learner can change; the [`/phrasebook-image`](../../api/phrasebook-image.md) spec (and [`/context`](../../api/context.md), if it changes) describes tiles; the [card schema](../../card-schema.md) owns the new stored fields; existing phrasebooks keep working.
