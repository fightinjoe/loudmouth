import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { parsePhrasebookRequest, validateGenerationResponse, validateTranslationResponse } = require('../../../api/src/phrasebook/parse');
const { buildPhrasebookGenerationPrompt, buildPhrasebookTranslationPrompt } = require('../../../api/src/phrasebook/prompt');
const { buildTranslationResponseJsonSchema } = require('../../../api/src/phrasebook');
const translationTemplate = readFileSync(new URL('../../../api/src/phrasebook/translate-prompt.txt', import.meta.url), 'utf8');

function validatedTask(input) {
  const result = parsePhrasebookRequest(input);
  assert(!result.error, result.error);
  assert.equal(result.value.checklist.length, 1, 'Collect one complete topic per native call');
  return result.value;
}

export function buildEnglishPrompt(input, variant) {
  const prompt = buildPhrasebookGenerationPrompt(validatedTask(input));
  assert.equal(variant.instructions, prompt.instructions, 'Use the unchanged production English prompt');
  // Production DeepSeek uses prompt-only JSON, not provider structured output.
  return { ...prompt, schema: null };
}

export function normalizeEnglish(parsed, input, context = {}) {
  const task = validatedTask(input);
  const value = validateGenerationResponse(context.raw ?? JSON.stringify(parsed), task.checklist);
  const changes = [];
  const original = parsed?.conversations?.[0];
  if (original) {
    for (const section of ['essentials', 'vocab']) {
      if (original[section].length !== value.conversations[0][section].length) changes.push({
        path: `/conversations/0/${section}`, reason: `Production parser retained ${value.conversations[0][section].length} of ${original[section].length} entries; full raw output remains retained.`,
      });
    }
    value.conversations[0].lines.forEach((line, index) => {
      if (line.alternative) changes.push({ path: `/conversations/0/lines/${index}/alternative`, reason: 'Production parser marks consecutive same-speaker entries as local alternatives.' });
    });
  } else changes.push({ path: '', reason: 'Production parser accepted raw content not parsed by the generic reader; retain its raw findings and original text.' });
  return { value, changes };
}

export function buildTranslationPrompt(input, variant) {
  const task = validatedTask(input.task);
  assert.equal(input.conversation.title, task.checklist[0], 'Translation English does not match the frozen task');
  assert.equal(variant.instructions, translationTemplate, 'Use the unchanged production translation prompt');
  return {
    ...buildPhrasebookTranslationPrompt({ ...task, conversation: input.conversation }),
    schema: buildTranslationResponseJsonSchema(input.conversation, task.language),
  };
}

export function normalizeTranslation(parsed, input, context = {}) {
  const task = validatedTask(input.task);
  const value = validateTranslationResponse(context.raw ?? JSON.stringify(parsed), input.conversation, task.language);
  return { value, changes: [{ path: '', reason: `Production translation parser applied unchanged; failureLevel=${value.failureLevel}. Preserve raw output, optional-source flags and any Japanese romanization fallback as collection diagnostics, not reviewer repairs.` }] };
}
