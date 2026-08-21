# Debug report: Japanese lookup readings

- Symptom: `/lookup` could return one-character-at-a-time Japanese kana tokens and attach ruby to a hiragana character.
- Root cause: the response validator checked only ReadingToken shape, so model-produced kana segmentation and annotations passed through unchanged.
- Fix: the lookup finish layer now clears annotations unless a Japanese token is kanji-only, merges adjacent unannotated tokens, and applies the same rule to example readings. The prompt also explicitly requires grouped kana and forbids kana ruby.
- Regression test: `api/src/test/lookup.test.js` covers the reported `サーフィンをする` shape, kanji ruby preservation, mixed-token sanitization, and prompt guidance.
- Verification: `npm test` passes all 37 API tests; `git diff --check` passes.
- Status: DONE
