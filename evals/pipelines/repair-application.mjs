import assert from 'node:assert/strict';
import { applyTopicRepairs } from './review-composition.mjs';

const responseKeys = new Set(['handle', 'status', 'reason', 'changes', 'dropSourceIndexes']);

// Evaluation-control application: unchanged/unresolved entries need no invented explanation.
export function applyRepairResponses(parsed, input) {
  assert(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    && Object.keys(parsed).length === 1 && Object.hasOwn(parsed, 'items'), 'Repair response collection must contain exactly items');
  assert(Array.isArray(input?.items) && input.items.length, 'Topic items are required');
  const handles = input.items.map(item => item.handle);
  const available = new Set(handles);
  assert(handles.every(handle => typeof handle === 'string' && handle.length)
    && available.size === handles.length, 'Input handles must be nonempty and unique');
  assert(Array.isArray(parsed.items) && parsed.items.length === handles.length, 'Exactly one response per original handle is required');
  const seen = new Set();
  const repairs = [];
  const unresolved = new Set();
  for (const response of parsed.items) {
    assert(response !== null && typeof response === 'object' && !Array.isArray(response)
      && Object.keys(response).every(key => responseKeys.has(key)), 'Unexpected response fields');
    assert(available.has(response.handle) && !seen.has(response.handle), 'Unknown or duplicate response handle');
    seen.add(response.handle);
    assert(['unchanged', 'repaired', 'unresolved'].includes(response.status), 'Unknown repair status');
    assert(Array.isArray(response.changes) && Array.isArray(response.dropSourceIndexes), 'Changes and source omissions must be arrays');
    if (response.status === 'repaired') {
      // Existing application validates the required reason, actual edits, source indexes,
      // immutable fields, dependent readings and full candidate before returning anything.
      repairs.push(response);
    } else {
      assert(response.changes.length === 0 && response.dropSourceIndexes.length === 0, 'Unchanged/unresolved cannot carry a partial patch');
      assert(!Object.hasOwn(response, 'reason') || typeof response.reason === 'string', 'Optional reason must be a string');
      if (response.status === 'unresolved') unresolved.add(response.handle);
    }
  }
  const applied = applyTopicRepairs(input, repairs.map(response => response.handle), repairs);
  return { ...applied, unresolvedHandles: handles.filter(handle => unresolved.has(handle)) };
}
