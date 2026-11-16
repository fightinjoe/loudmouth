import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
const require = createRequire(import.meta.url);
const { parsePhrasebookRequest, validateGenerationResponse, validateTranslationResponse } = require('../../api/src/phrasebook/parse');
const { buildPhrasebookGenerationPrompt, buildPhrasebookTranslationPrompt } = require('../../api/src/phrasebook/prompt');
const { generationTasks, buildGenerationResponseJsonSchema, buildTranslationResponseJsonSchema } = require('../../api/src/phrasebook');
const translationTemplate = readFileSync(new URL('../../api/src/phrasebook/translate-prompt.txt', import.meta.url), 'utf8');

function validatedTask(input) {
  const result = parsePhrasebookRequest(input);
  assert(!result.error, result.error);
  assert.equal(result.value.checklist.length, 1, 'Collect one complete topic per native call');
  return result.value;
}

export function buildEnglishPrompt(input, variant) {
  const prompt = buildPhrasebookGenerationPrompt(generationTasks(validatedTask(input))[0]);
  assert.equal(variant.instructions, prompt.instructions, 'Use the unchanged production English prompt');
  return { ...prompt, schema: buildGenerationResponseJsonSchema() };
}

// Differences between a raw English reply and the parser's topic. Returning each turn
// {speaker, say, or?} as a line {speaker, text: [say, ...or]} under the request title is the
// parser's design, described once; a section is listed only when the parser repaired it.
export function englishChanges(parsed, topic) {
  if (parsed === null || typeof parsed !== 'object') return [{ path: '', reason: 'Production parser accepted raw content not parsed by the generic reader; raw findings and original text are distinct from normalized output. This normalizer does not persist them.' }];
  const converted = {
    ...parsed,
    likelyExchanges: parsed.likelyExchanges.map(exchange => ({
      title: exchange.title, lines: exchange.turns.map(turn => ({ speaker: turn.speaker, text: [turn.say, ...(turn.or ?? [])] })),
    })),
  };
  return [
    { path: '', reason: 'By design, the production parser adds the request topic title and returns each exchange turn {speaker, say, or?} as a line {speaker, text: [say, ...or]}. Raw response retention is controlled by the caller, not this normalizer.' },
    ...['thingsToSay', 'likelyExchanges', 'words', 'exampleConversation'].filter(section => !isDeepStrictEqual(converted[section], topic[section])).map(section => ({
      path: `/${section}`, reason: 'Production parser repaired this section (see flags).',
    })),
  ];
}

export function normalizeEnglish(parsed, input, context = {}) {
  const task = validatedTask(input);
  const value = validateGenerationResponse(context.raw ?? JSON.stringify(parsed), task.checklist[0]);
  return { value, changes: englishChanges(parsed, value.topic) };
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
