import { SCHEMA_VERSION, validatePhrasebookResponse, validateBreakdownRequest, validateBreakdownResponse } from '@catchphrase/card-schema';
import type { Lang, BreakdownRequest, BreakdownGenerationContext, BreakdownResponse, PhrasebookResponse } from '@catchphrase/card-schema';

const GATEWAY_URL = import.meta.env.VITE_API_URL || 'https://translation-api-gateway-2qqw247r.uc.gateway.dev';
export type Ability = BreakdownGenerationContext['ability'];
export interface ContextResponse {
  questions: {label: string; options: string[]}[];
  checklist: {label: string; checked: boolean}[];
}
export interface GenerationRequest {
  seed: string; language: Lang; ability: Ability; answers: Record<string,string>; checklist: string[];
}
export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}
function record(value: unknown): value is Record<string,unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
async function post(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body), signal,
  });
  if (!res.ok) {
    let message = `${path} failed (${res.status})`;
    try {
      const value: unknown = await res.json();
      if (record(value) && typeof value.error === 'string' && value.error) message = value.error;
    } catch { /* Preserve HTTP status when the error body is not JSON. */ }
    throw new ApiError(message, res.status);
  }
  return res.json();
}
export async function getContext({seed,language,ability,signal}: {
  seed:string; language:Lang; ability?:Ability; signal?:AbortSignal;
}): Promise<ContextResponse> {
  const value = await post('/context', {seed,language,ability}, signal);
  if (!record(value) || !Array.isArray(value.questions) || !Array.isArray(value.checklist)) {
    throw new Error('Invalid context response');
  }
  const questions = value.questions.map((question: unknown) => {
    if (!record(question) || typeof question.label !== 'string' || !Array.isArray(question.options)) {
      throw new Error('Invalid context question');
    }
    const options = question.options.map((option: unknown) => {
      if (typeof option !== 'string') throw new Error('Invalid context option');
      return option;
    });
    return {label:question.label,options};
  });
  const checklist = value.checklist.map((item: unknown) => {
    if (!record(item) || typeof item.label !== 'string' || typeof item.checked !== 'boolean') {
      throw new Error('Invalid context checklist');
    }
    return {label:item.label,checked:item.checked};
  });
  return {questions,checklist};
}
export async function generatePhrasebook({seed,language,ability,answers,checklist,signal}: GenerationRequest & {
  signal?:AbortSignal;
}): Promise<PhrasebookResponse> {
  return validatePhrasebookResponse(await post('/phrasebook', {seed,language,ability,answers,checklist}, signal));
}
export async function getPhrasebookTitle({seed,signal}: {seed:string;signal?:AbortSignal}): Promise<{title:string}> {
  const value = await post('/phrasebook-title', {seed}, signal);
  if (!record(value) || typeof value.title !== 'string' || !value.title.trim()) throw new Error('Invalid phrasebook title response');
  return {title:value.title};
}
export async function getPhraseBreakdown({source,context,signal}: Omit<BreakdownRequest,'schemaVersion'> & {
  signal?:AbortSignal;
}): Promise<BreakdownResponse> {
  const request = validateBreakdownRequest({schemaVersion:SCHEMA_VERSION, source, ...(context === undefined ? {} : {context})});
  return validateBreakdownResponse(await post('/phrase-breakdown', request, signal), request);
}
