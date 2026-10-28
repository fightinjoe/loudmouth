import { modelInput } from '../../repair-r1/tasks.mjs';

export function buildPrompt(input, variant) {
  // Use the existing allowlisted projection; annotations, proposed responses,
  // split/family identifiers and provenance are never model input.
  return { instructions: variant.instructions, input: modelInput(input, false), responseFormat: 'json_object' };
}

export { normalizePosUsage as normalize } from '../../repair-r1/pos-usage/policy.mjs';
