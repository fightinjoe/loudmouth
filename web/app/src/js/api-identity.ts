import { getApps, initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import type { AppCheck } from 'firebase/app-check';
import { getApiConfiguration } from './api-config';

type Identity = { auth: Auth; appCheck: AppCheck };
type Credentials = { identityToken: string; appCheckToken: string };
let initialization: Promise<Identity> | undefined;
let acquisition: Promise<Credentials> | undefined;
let refreshNext = false;
let appCheckInstance: AppCheck | undefined;

async function initializeIdentity(): Promise<Identity> {
  const config = getApiConfiguration(import.meta.env, import.meta.env.PROD);
  const runtime: object = globalThis;
  if (import.meta.env.PROD && 'FIREBASE_APPCHECK_DEBUG_TOKEN' in runtime && runtime.FIREBASE_APPCHECK_DEBUG_TOKEN) {
    throw new Error('Debug app verification is disabled in production. Saved content is still available.');
  }
  const app = getApps().find(candidate => candidate.name === 'protected-api') ??
    initializeApp(config.firebase, 'protected-api');
  // Retry auth initialization without creating a second App Check instance.
  appCheckInstance ??= initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(config.siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  const auth = getAuth(app);
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  return { auth, appCheck: appCheckInstance };
}

function credentials(): Promise<Credentials> {
  if (acquisition) return acquisition;
  if (!initialization) {
    initialization = initializeIdentity().catch(error => {
      initialization = undefined;
      throw error;
    });
  }
  const forceRefresh = refreshNext;
  refreshNext = false;
  const pending = initialization.then(async ({auth, appCheck}) => {
    if (!auth.currentUser) throw new Error('Anonymous session is unavailable.');
    const [identityToken, appCheckResult] = await Promise.all([
      auth.currentUser.getIdToken(forceRefresh), getToken(appCheck, forceRefresh),
    ]);
    return { identityToken, appCheckToken: appCheckResult.token };
  });
  acquisition = pending;
  // Clearing only our own promise prevents late completion from overwriting newer state.
  void pending.then(() => {
    if (acquisition === pending) acquisition = undefined;
  }, () => {
    if (acquisition === pending) acquisition = undefined;
  });
  return pending;
}

export function invalidateApiCredentials(): void {
  // SDK-persisted anonymous identity is never replaced to evade a quota or rejection.
  acquisition = undefined;
  refreshNext = true;
}

export function getApiCredentials(signal?: AbortSignal): Promise<Credentials> {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  // Validate before starting SDK work so missing config has actionable, controlled guidance.
  try { getApiConfiguration(import.meta.env, import.meta.env.PROD); }
  catch (error) { return Promise.reject(error); }
  // Keep the ES2022/Safari baseline: Promise.withResolvers requires newer browsers.
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Verification timed out. Check your connection and verification-script settings, then try again. Saved content is still available.'));
    }, 15_000);
    signal?.addEventListener('abort', abort, { once: true });
    // Cancellation/timeouts stop only this caller's wait, not another caller's sign-in.
    credentials().then(result => {
      cleanup();
      resolve(result);
    }, () => {
      cleanup();
      reject(new Error('Could not verify this browser or session. Check your connection and allow verification scripts, then try again. Saved content is still available.'));
    });
  });
}
