import assert from 'node:assert/strict';
import { modelInput, buildRepairPrompt, validateDetection, applyLocalizedRepair } from './tasks.mjs';

function topicHandles(input) {
  assert(Array.isArray(input?.items) && input.items.length, 'Topic items are required');
  const handles = input.items.map(item => item.handle);
  assert(handles.every(handle => typeof handle === 'string' && handle.length), 'Input handles must be nonempty strings');
  assert(new Set(handles).size === handles.length, 'Input handles must be unique');
  return handles;
}

export function repairCaseInput(input, handle) {
  assert(topicHandles(input).includes(handle), 'Unknown repair handle');
  // Do not propagate an oracle focus, detector diagnosis, or root-level private references.
  return { ...structuredClone({ task: input.task, topic: input.topic, items: input.items }),
    focus: { handle, field: 'card', category: 'meaning' } };
}

export function routeDetection(input, detection) {
  const handles = topicHandles(input);
  validateDetection(detection, input);
  if (!detection.complete) return { complete: false, repairHandles: [], unresolvedHandles: handles };
  const blocked = new Set(detection.unresolved.map(item => item.handle));
  const selected = new Set();
  for (const finding of detection.findings) {
    if (finding.origin === 'english') blocked.add(finding.handle);
    else selected.add(finding.handle);
  }
  return { complete: true,
    repairHandles: handles.filter(handle => selected.has(handle) && !blocked.has(handle)),
    unresolvedHandles: handles.filter(handle => blocked.has(handle)) };
}

export function applyTopicRepairs(input, handles, responses) {
  const originals = topicHandles(input);
  const available = new Set(originals);
  assert(Array.isArray(handles), 'Repair handles must be an array');
  const selected = new Set(handles);
  assert(selected.size === handles.length, 'Duplicate repair handle');
  assert(handles.every(handle => available.has(handle)), 'Unknown repair handle');
  assert(Array.isArray(responses), 'Repair responses must be an array');
  const byHandle = new Map();
  for (const response of responses) {
    assert(response && selected.has(response.handle), 'Extra or mismatched repair response handle');
    assert(!byHandle.has(response.handle), 'Duplicate repair response handle');
    byHandle.set(response.handle, response);
  }
  assert(byHandle.size === selected.size, 'Missing repair response');

  // Each patch sees the original topic, never another patch's intermediate state.
  // Nothing is returned until every localized application has succeeded.
  const replacements = new Map();
  for (const handle of handles) {
    const applied = applyLocalizedRepair(byHandle.get(handle), repairCaseInput(input, handle));
    replacements.set(handle, applied.items.find(item => item.handle === handle));
  }
  return {
    items: input.items.map(item => replacements.has(item.handle) ? replacements.get(item.handle) : structuredClone(item)),
    application: responses.some(response => response.status === 'repaired') ? 'applied-in-memory' : 'original-retained',
    unresolvedHandles: originals.filter(handle => byHandle.get(handle)?.status === 'unresolved'),
  };
}

export function composeTopic(input, detectionOutcome, repairOutcomes) {
  const handles = topicHandles(input);
  assert(Array.isArray(repairOutcomes), 'Repair outcomes must be an array');
  let route;
  let detectionError;
  if (detectionOutcome?.status !== 'completed' || detectionOutcome.rawValid !== true) {
    detectionError = 'Detection did not complete with a valid raw response';
  } else {
    try { route = routeDetection(input, detectionOutcome.response); }
    catch (error) { detectionError = error.message; }
  }

  const selected = new Set(route?.repairHandles ?? []);
  const outcomes = new Map();
  for (const outcome of repairOutcomes) {
    assert(outcome && selected.has(outcome.handle), 'Extra repair outcome: handle was not selected');
    assert(!outcomes.has(outcome.handle), 'Duplicate repair outcome');
    outcomes.set(outcome.handle, outcome);
  }
  const retained = (status, error, repairHandles = [], unresolvedHandles = handles) => ({
    status, items: structuredClone(input.items), application: 'original-retained',
    repairHandles, unresolvedHandles, complete: false, semanticReview: 'not-assessed', error,
  });
  if (detectionError) return retained('invalid-detection', detectionError);
  if (!route.complete) return retained('detection-incomplete', 'Detection did not cover the entire topic');

  const pending = new Set([...route.unresolvedHandles, ...route.repairHandles]);
  const unresolved = handles.filter(handle => pending.has(handle));
  for (const handle of route.repairHandles) {
    const outcome = outcomes.get(handle);
    if (!outcome || outcome.status !== 'completed') {
      return retained('repair-incomplete', `Missing or failed repair outcome for ${handle}`, route.repairHandles, unresolved);
    }
    if (outcome.rawValid !== true || outcome.applicationValid !== true || outcome.response?.handle !== handle) {
      return retained('invalid-repair', `Invalid repair response or application for ${handle}`, route.repairHandles, unresolved);
    }
  }
  let applied;
  try { applied = applyTopicRepairs(input, route.repairHandles, route.repairHandles.map(handle => outcomes.get(handle).response)); }
  catch (error) { return retained('invalid-repair', error.message, route.repairHandles, unresolved); }
  const remaining = new Set([...route.unresolvedHandles, ...applied.unresolvedHandles]);
  const unresolvedHandles = handles.filter(handle => remaining.has(handle));
  return { status: 'assembled', ...applied, repairHandles: route.repairHandles, unresolvedHandles,
    complete: unresolvedHandles.length === 0, semanticReview: 'not-assessed' };
}

export function buildOnePassPrompt(input, variant) {
  const handles = topicHandles(input);
  const itemSchema = variant.schema.properties.items.items;
  return {
    instructions: variant.instructions,
    input: modelInput(input, false),
    schema: {
      type: 'object',
      properties: { items: { type: 'array', minItems: handles.length, maxItems: handles.length,
        items: { anyOf: handles.map(handle => buildRepairPrompt(repairCaseInput(input, handle), { ...variant, schema: itemSchema }).schema) } } },
      required: ['items'], additionalProperties: false,
    },
  };
}

export function normalizeOnePass(parsed, input) {
  assert(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    && Object.keys(parsed).length === 1 && Object.hasOwn(parsed, 'items'), 'One-pass response must contain exactly items');
  const applied = applyTopicRepairs(input, topicHandles(input), parsed.items);
  return { value: { response: parsed, ...applied }, changes: [{ path: '',
    reason: 'Strictly assemble exactly one valid response per original handle atomically; retain metadata and historical snapshots without coercing model output. Structural application is not linguistic approval.' }] };
}
