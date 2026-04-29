# TODO

## Inconsistencies

- [ ] **iOS card schema is defined in multiple places** — `Card.swift` (SwiftData model), `ImportService.swift` (`CardInput`/`CardInputExample`), and `BackupService.swift` (`CardBackup`) each independently declare the card shape. A single canonical definition should be the source of truth.
- [ ] **`example` storage shape differs between iOS and web** — The web app stores `example` as a nested object `{ text, reading, translation }` on the card. iOS flattens it into three top-level fields on the `Card` model: `exampleText`, `exampleReading`, `exampleTranslation`. These should be reconciled so both platforms use the same shape (nested object preferred, matching the batch schema).
