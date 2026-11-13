import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { parsePhrasebookRequest, validateGenerationResponse, validateTranslationResponse } = require('../../api/src/phrasebook/parse');
const { buildPhrasebookGenerationPrompt, buildPhrasebookTranslationPrompt } = require('../../api/src/phrasebook/prompt');
const { buildGenerationResponseJsonSchema, buildTranslationResponseJsonSchema } = require('../../api/src/phrasebook');
const translationTemplate = readFileSync(new URL('../../api/src/phrasebook/translate-prompt.txt', import.meta.url), 'utf8');

function validatedTask(input) {
  const result = parsePhrasebookRequest(input);
  assert(!result.error, result.error);
  assert.equal(result.value.checklist.length, 1, 'Collect one complete topic per native call');
  return result.value;
}

export function buildEnglishPrompt(input, variant) {
  const task = validatedTask(input);
  const prompt = buildPhrasebookGenerationPrompt(task);
  assert.equal(variant.instructions, prompt.instructions, 'Use the unchanged production English prompt');
  return { ...prompt, schema: buildGenerationResponseJsonSchema(task.checklist) };
}

export function normalizeEnglish(parsed, input, context = {}) {
  const task = validatedTask(input);
  // One topic per task: report its repair flags, and failure level 1 when there are any.
  const result = validateGenerationResponse(context.raw ?? JSON.stringify(parsed), task.checklist);
  const value = { topics: result.topics, flags: result.flags[0], failureLevel: result.flags[0].length > 0 ? 1 : 0 };
  const changes = [];
  const original = parsed?.topics?.[0];
  if (original) {
    for (const section of ['thingsToSay', 'likelyExchanges', 'words', 'exampleConversation']) {
      if (JSON.stringify(original[section]) !== JSON.stringify(value.topics[0][section])) changes.push({
        path: `/topics/0/${section}`, reason: 'Production parser repaired this section (see flags); raw response retention is controlled by the caller, not this normalizer.',
      });
    }
  } else changes.push({ path: '', reason: 'Production parser accepted raw content not parsed by the generic reader; raw findings and original text are distinct from normalized output. This normalizer does not persist them.' });
  return { value, changes };
}

export function buildTranslationPrompt(input, variant) {
  const task = validatedTask(input.task);
  assert.equal(input.topic.title, task.checklist[0], 'Translation English does not match the frozen task');
  assert.equal(variant.instructions, translationTemplate, 'Use the unchanged production translation prompt');
  return {
    ...buildPhrasebookTranslationPrompt({ ...task, topic: input.topic }),
    schema: buildTranslationResponseJsonSchema(input.topic, task.language),
  };
}

export function normalizeTranslation(parsed, input, context = {}) {
  const task = validatedTask(input.task);
  const value = validateTranslationResponse(context.raw ?? JSON.stringify(parsed), input.topic, task.language);
  return { value, changes: [{ path: '', reason: `Production translation parser applied unchanged; failureLevel=${value.failureLevel}. Optional-source flags and Japanese romanization fallback are normalization diagnostics, not reviewer repairs. Raw response retention is controlled by the caller; this normalizer does not persist it.` }] };
}
