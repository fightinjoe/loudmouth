import assert from 'node:assert/strict';

// A single native measured call replays the request, never fixture answers.
export function buildPrompt(caseInput, variant) {
  const request = caseInput.request;
  const instructions = caseInput.promptKey === undefined
    ? variant.instructions
    : JSON.parse(variant.instructions)[caseInput.promptKey];
  assert.equal(instructions, request.instructions, 'Variant must contain the exact frozen request instructions');
  return structuredClone(request);
}
