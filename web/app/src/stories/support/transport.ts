import { validateBreakdownRequest, type Lang } from '@catchphrase/card-schema';
import { breakdownResponse, contextResponse, imageResponse, phrasebookResponse, FIXTURE_LANGUAGES, FIXTURE_TITLE } from './fixtures';

export type Endpoint = '/context' | '/phrasebook-title' | '/phrasebook' | '/phrasebook-image' | '/phrase-breakdown';
export type Outcome = 'success' | 'pending' | 'error' | 'invalid';
export interface TransportRequest {
  endpoint: Endpoint;
  body: unknown;
  status: 'pending' | 'success' | 'error' | 'invalid' | 'aborted';
}
export const requests: TransportRequest[] = [];
export type ResponseFactory = (body: unknown) => unknown;
export const API_PREFIX = '/__storybook_api__';
const endpoints: readonly Endpoint[] = ['/context', '/phrasebook-title', '/phrasebook', '/phrasebook-image', '/phrase-breakdown'];
let outcomes: Partial<Record<Endpoint, Outcome>> = {};
const factories = new Map<Endpoint, ResponseFactory>();
const lateNext = new Set<Endpoint>();
let installed = false;
let generation = 0;
const operations = new Set<Promise<unknown>>();
interface ControlledRequest {
  endpoint: Endpoint;
  settle(outcome: Exclude<Outcome, 'pending'>): void;
  abort(force?: boolean): void;
}
const pending = new Set<ControlledRequest>();

export function configureTransport(next: Partial<Record<Endpoint, Outcome>> = {}): void {
  outcomes = { ...next };
}

export function setOutcome(endpoint: Endpoint, outcome: Outcome): void {
  outcomes[endpoint] = outcome;
}

/** Specialized specimens can modify a fresh validated fixture. The actual API client
 * still parses/validates its JSON response; this never bypasses production validation. */
export function setResponseFactory(endpoint: Endpoint, factory: ResponseFactory): void {
  factories.set(endpoint, factory);
}

/** Adversarial identity-guard specimen only: ignore cancellation for the next request
 * to this endpoint, then settle it via resolvePending/failPending. Normal requests
 * always honor abort. Teardown force-aborts even these deliberately obsolete results. */
export function allowLateResponse(endpoint: Endpoint): void {
  lateNext.add(endpoint);
}

function fixtureResponse(endpoint: Endpoint, body: unknown): unknown {
  const override = factories.get(endpoint);
  if (override) return override(body);
  if (endpoint === '/context') return contextResponse();
  if (endpoint === '/phrasebook-title') return { title: FIXTURE_TITLE };
  if (endpoint === '/phrasebook-image') return imageResponse();
  if (endpoint === '/phrase-breakdown') return breakdownResponse(validateBreakdownRequest(body));
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('Storybook phrasebook request must be an object');
  const { language, checklist } = body as Record<string, unknown>;
  if (typeof language !== 'string' || !FIXTURE_LANGUAGES.includes(language as Lang)) throw new Error('Unsupported Storybook phrasebook language');
  if (!Array.isArray(checklist) || !checklist.every((value): value is string => typeof value === 'string')) throw new Error('Storybook phrasebook checklist must be strings');
  return phrasebookResponse(language as Lang, checklist);
}

function track<T>(promise: Promise<T>): Promise<T> {
  operations.add(promise);
  void promise.then(() => operations.delete(promise), () => operations.delete(promise));
  return promise;
}

function responseFor(
  endpoint: Endpoint, body: unknown, outcome: Exclude<Outcome, 'pending'>,
  request: Request, owner: number, late: boolean,
): Response {
  const response = new Response(JSON.stringify(outcome === 'error'
    ? { error: `Storybook controlled failure: ${endpoint}` }
    : outcome === 'invalid' ? { invalidStorybookResponse: true } : fixtureResponse(endpoint, body)), {
    status: outcome === 'error' ? 503 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
  // Keep the native Response/JSON implementation while tracking body consumption for
  // teardown. A settled fetch alone is not enough: API validation follows json().
  const readJson = response.json.bind(response);
  response.json = () => track(readJson().then((value: unknown) => {
    if (owner !== generation || (!late && request.signal.aborted)) {
      throw new DOMException('Storybook response body aborted', 'AbortError');
    }
    return value;
  }));
  return response;
}

function controlledFetch(request: Request, endpoint: Endpoint, owner: number, late: boolean): Promise<Response> {
  // ES2022 is the app's supported library/runtime; Promise.withResolvers is ES2024.
  return new Promise<Response>((resolve, reject) => {
    let finished = false;
    let bodyReady = false;
    let chosen: Exclude<Outcome, 'pending'> | undefined;
    const record: TransportRequest = { endpoint, body: null, status: 'pending' };
    const initialOutcome = outcomes[endpoint] ?? 'success';
    requests.push(record);
    const clean = (): void => {
      pending.delete(control);
      request.signal.removeEventListener('abort', onAbort);
    };
    const control: ControlledRequest = {
      endpoint,
      settle(outcome) {
        if (finished) return;
        if (!bodyReady) { chosen = outcome; return; }
        finished = true;
        clean();
        try {
          const response = responseFor(endpoint, record.body, outcome, request, owner, late);
          record.status = outcome;
          resolve(response);
        } catch (error) {
          record.status = 'error';
          reject(error);
        }
      },
      abort(force = false) {
        if (finished || (late && !force)) return;
        finished = true;
        clean();
        record.status = 'aborted';
        reject(new DOMException('Storybook request aborted', 'AbortError'));
      },
    };
    const onAbort = (): void => control.abort();
    pending.add(control);
    request.signal.addEventListener('abort', onAbort, { once: true });
    // An already-aborted signal is never made successful by the late-result seam.
    if (request.signal.aborted || owner !== generation) { control.abort(true); return; }
    void track(request.json()).then((body: unknown) => {
      if (finished) return;
      if (owner !== generation) { control.abort(true); return; }
      record.body = body;
      bodyReady = true;
      const outcome = chosen ?? initialOutcome;
      if (outcome !== 'pending') control.settle(outcome);
    }, (error: unknown) => {
      if (finished) return;
      finished = true;
      clean();
      record.status = 'error';
      reject(new Error(`Invalid Storybook request JSON for ${endpoint}`, { cause: error }));
    });
  });
}

/** Install once per preview document. Only same-origin non-API resources may pass
 * through; no unexpected operation can escape to a gateway or external fetch. */
export function installTransport(): void {
  if (installed) return;
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const rawUrl = input instanceof Request ? input.url : String(input);
      const url = new URL(rawUrl, window.location.href);
      if (url.origin !== window.location.origin) throw new Error(`Storybook blocked external fetch: ${url.origin}${url.pathname}`);
      if (!url.pathname.startsWith(API_PREFIX)) return originalFetch(input, init);
      const path = url.pathname.slice(API_PREFIX.length);
      if (!endpoints.includes(path as Endpoint) || url.search || url.hash) throw new Error(`Unexpected Storybook API operation: ${url.pathname}`);
      const request = new Request(input instanceof Request ? input : url, init);
      if (request.method !== 'POST') throw new Error(`Storybook API requires POST: ${path}`);
      const endpoint = path as Endpoint;
      const late = lateNext.delete(endpoint);
      return track(controlledFetch(request, endpoint, generation, late));
    } catch (error) {
      return Promise.reject(error);
    }
  };
  installed = true;
}

export function resolvePending(endpoint?: Endpoint): void {
  for (const request of [...pending]) if (endpoint === undefined || request.endpoint === endpoint) request.settle('success');
}

export function failPending(endpoint?: Endpoint): void {
  for (const request of [...pending]) if (endpoint === undefined || request.endpoint === endpoint) request.settle('error');
}

/** Call after synchronous controller disposal and before the sandbox's transaction
 * barrier. Flush body parsing and promise continuations so a bound illustration's
 * rejection handler starts its final persistence before the database is cleared. */
export async function resetTransport(): Promise<void> {
  generation += 1;
  for (const request of [...pending]) request.abort(true);
  while (operations.size > 0) await Promise.allSettled([...operations]);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  while (operations.size > 0) await Promise.allSettled([...operations]);
  outcomes = {};
  factories.clear();
  lateNext.clear();
  requests.length = 0;
}
