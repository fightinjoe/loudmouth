import { SCHEMA_VERSION, validatePhrasebookResponse, validateBreakdownRequest, validateBreakdownResponse, validateContextResult, validatePhrasebookImageResponse } from '@catchphrase/card-schema';
import type { Lang, BreakdownRequest, BreakdownGenerationContext, BreakdownResponse, PhrasebookResponse, ContextResponse, PhrasebookImageResponse } from '@catchphrase/card-schema';

import { getApiConfiguration } from './api-config';
import { getApiCredentials, invalidateApiCredentials } from './api-identity';
export type Ability = BreakdownGenerationContext['ability'];
export interface GenerationRequest {
  seed: string; language: Lang; ability: Ability; answers: Record<string,string>; checklist: string[];
}
export class ApiError extends Error {
  constructor(message: string, public readonly status: number,
    public readonly code?: string, public readonly retryAfterSeconds?: number) { super(message); }
}
function record(value: unknown): value is Record<string,unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
async function post(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const { apiUrl, identity } = getApiConfiguration(import.meta.env, import.meta.env.PROD);
  const credentials = identity ? await getApiCredentials(signal) : null;
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  let res: Response;
  try {
    res = await fetch(`${apiUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(credentials && {
          Authorization: `Bearer ${credentials.identityToken}`,
          'X-Firebase-AppCheck': credentials.appCheckToken,
        }),
      },
      body: JSON.stringify(body), signal,
    });
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
    throw new ApiError('The connection was lost. Generation may already have consumed your allowance. Check your library before choosing to try again.', 0, 'NETWORK_UNCERTAIN');
  }
  if (!res.ok) {
    let message = `${path} failed (${res.status})`;
    let code: string | undefined;
    let retryAfterSeconds: number | undefined;
    const retry = res.headers?.get('Retry-After');
    if (retry && /^\d+$/.test(retry) && Number.isSafeInteger(Number(retry))) retryAfterSeconds = Number(retry);
    try {
      const value: unknown = await res.json();
      if (record(value)) {
        if (typeof value.error === 'string' && value.error) message = value.error;
        if (typeof value.code === 'string') code = value.code;
        if (typeof value.retryAfterSeconds === 'number' && Number.isSafeInteger(value.retryAfterSeconds) && value.retryAfterSeconds >= 0) {
          retryAfterSeconds = value.retryAfterSeconds;
        }
      }
    } catch { /* Gateways can reject with a non-JSON response. */ }
    const retryGuidance = retryAfterSeconds === undefined
      ? 'Please try again later.'
      : `Please wait ${retryAfterSeconds} seconds before trying again.`;
    if (res.status === 401 || res.status === 403) invalidateApiCredentials();
    if (res.status === 401) message = 'Your session could not be verified. Check your connection, then try again. Saved content is still available.';
    if (res.status === 403) message = 'This browser could not be verified or is not supported. Allow verification scripts, then try again. Saved content is still available.';
    if (res.status === 429) message = `Your generation allowance or active-request limit has been reached. ${retryGuidance}`;
    if (res.status === 503) message = `${code === 'GENERATION_PAUSED' ? 'Online generation is paused.' : 'Online generation is temporarily unavailable.'} ${retryGuidance} Saved content is still available.`;
    throw new ApiError(message, res.status, code, retryAfterSeconds);
  }
  try {
    return await res.json();
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
    throw new ApiError('The generation response could not be received. Generation may already have consumed your allowance. Check your library before choosing to try again.', res.status, 'RESPONSE_UNCERTAIN');
  }
}
export async function getContext({seed,language,ability,signal}: {
  seed:string; language:Lang; ability?:Ability; signal?:AbortSignal;
}): Promise<ContextResponse> {
  return validateContextResult(await post('/context', {seed,language,ability}, signal));
}
export async function generatePhrasebook({seed,language,ability,answers,checklist,signal}: GenerationRequest & {
  signal?:AbortSignal;
}): Promise<PhrasebookResponse> {
  const submittedChecklist = [...checklist];
  const result = validatePhrasebookResponse(await post('/phrasebook', {seed,language,ability,answers,checklist:submittedChecklist}, signal));
  if (result.groups.length !== submittedChecklist.length || result.groups.some((group, index) => group.title !== submittedChecklist[index])) {
    throw new Error('Phrasebook topics do not match the requested checklist');
  }
  return result;
}
export async function generatePhrasebookImage({prompt,signal}: {
  prompt:string;signal?:AbortSignal;
}): Promise<PhrasebookImageResponse> {
  return validatePhrasebookImageResponse(await post('/phrasebook-image', {
    prompt, output_format:'png',
  }, signal));
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
