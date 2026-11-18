import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  getApps: vi.fn(), initializeApp: vi.fn(), getAuth: vi.fn(),
  signInAnonymously: vi.fn(), initializeAppCheck: vi.fn(), getToken: vi.fn(),
  authStateReady: vi.fn(), getIdToken: vi.fn(),
}));
vi.mock('firebase/app', () => ({getApps:sdk.getApps,initializeApp:sdk.initializeApp}));
vi.mock('firebase/auth', () => ({getAuth:sdk.getAuth,signInAnonymously:sdk.signInAnonymously}));
vi.mock('firebase/app-check', () => ({
  initializeAppCheck:sdk.initializeAppCheck,getToken:sdk.getToken,
  ReCaptchaEnterpriseProvider: class { constructor(siteKey) { this.siteKey = siteKey; } },
}));

let auth;
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  for (const [key,value] of Object.entries({
    VITE_API_URL:'https://api.example.test',VITE_FIREBASE_API_KEY:'test-public-key',
    VITE_FIREBASE_AUTH_DOMAIN:'app.example.test',VITE_FIREBASE_PROJECT_ID:'test-project',
    VITE_FIREBASE_APP_ID:'test-app',VITE_RECAPTCHA_ENTERPRISE_SITE_KEY:'test-site-key',PROD:false,
  })) vi.stubEnv(key,value);
  auth = {currentUser:null,authStateReady:sdk.authStateReady};
  sdk.getApps.mockReturnValue([]);
  sdk.initializeApp.mockReturnValue({name:'protected-api'});
  sdk.initializeAppCheck.mockReturnValue({});
  sdk.getAuth.mockReturnValue(auth);
  sdk.authStateReady.mockResolvedValue(undefined);
  sdk.signInAnonymously.mockImplementation(async () => { auth.currentUser = {getIdToken:sdk.getIdToken}; });
  sdk.getIdToken.mockResolvedValue('id-token');
  sdk.getToken.mockResolvedValue({token:'check-token'});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

// Dynamic imports intentionally exercise module initialization and failed-state recovery.
describe('lazy protected identity', () => {
  it('does not initialize Firebase merely by importing the client', async () => {
    await import('../js/api-identity');
    expect(sdk.initializeApp).not.toHaveBeenCalled();
    expect(sdk.signInAnonymously).not.toHaveBeenCalled();
  });
  it('shares first initialization and anonymous sign-in among simultaneous requests', async () => {
    const {getApiCredentials} = await import('../js/api-identity');
    const results = await Promise.all([getApiCredentials(),getApiCredentials(),getApiCredentials()]);
    expect(results).toEqual(Array(3).fill({identityToken:'id-token',appCheckToken:'check-token'}));
    expect(sdk.signInAnonymously).toHaveBeenCalledOnce();
    expect(sdk.getToken).toHaveBeenCalledOnce();
    expect(sdk.initializeAppCheck.mock.invocationCallOrder[0]).toBeLessThan(sdk.signInAnonymously.mock.invocationCallOrder[0]);
    expect(sdk.initializeAppCheck.mock.calls[0][1].isTokenAutoRefreshEnabled).toBe(true);
  });
  it('waits for persisted auth restoration and does not replace that user', async () => {
    sdk.authStateReady.mockImplementation(async () => { auth.currentUser = {getIdToken:sdk.getIdToken}; });
    const {getApiCredentials} = await import('../js/api-identity');
    await getApiCredentials();
    expect(sdk.signInAnonymously).not.toHaveBeenCalled();
    expect(sdk.getIdToken).toHaveBeenCalledWith(false);
  });
  it('cancels one wait without cancelling another caller or creating another identity', async () => {
    let ready;
    sdk.authStateReady.mockReturnValue(new Promise(resolve => { ready = resolve; }));
    const {getApiCredentials} = await import('../js/api-identity');
    const controller = new AbortController();
    const cancelled = getApiCredentials(controller.signal);
    const continuing = getApiCredentials();
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({name:'AbortError'});
    ready();
    await expect(continuing).resolves.toMatchObject({identityToken:'id-token'});
    expect(sdk.signInAnonymously).toHaveBeenCalledOnce();
  });
  it('bounds waiting to 15 seconds without starting another pending sign-in', async () => {
    vi.useFakeTimers();
    let ready;
    sdk.authStateReady.mockReturnValue(new Promise(resolve => { ready = resolve; }));
    const {getApiCredentials} = await import('../js/api-identity');
    const first = expect(getApiCredentials()).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(15_000);
    await first;
    const next = getApiCredentials();
    ready();
    await expect(next).resolves.toMatchObject({appCheckToken:'check-token'});
    expect(sdk.initializeApp).toHaveBeenCalledOnce();
    expect(sdk.signInAnonymously).toHaveBeenCalledOnce();
  });
  it('allows an explicit later action to retry failed initialization', async () => {
    sdk.signInAnonymously.mockRejectedValueOnce(new Error('private SDK error'));
    const {getApiCredentials} = await import('../js/api-identity');
    await expect(getApiCredentials()).rejects.toThrow(/Could not verify/);
    await expect(getApiCredentials()).resolves.toMatchObject({identityToken:'id-token'});
    expect(sdk.signInAnonymously).toHaveBeenCalledTimes(2);
    expect(sdk.initializeAppCheck).toHaveBeenCalledOnce();
  });
  it('refreshes tokens only on a subsequent explicit action without replacing identity', async () => {
    const {getApiCredentials,invalidateApiCredentials} = await import('../js/api-identity');
    await getApiCredentials();
    invalidateApiCredentials();
    expect(sdk.getToken).toHaveBeenCalledOnce();
    await getApiCredentials();
    expect(sdk.getIdToken).toHaveBeenLastCalledWith(true);
    expect(sdk.getToken).toHaveBeenLastCalledWith(expect.anything(),true);
    expect(sdk.signInAnonymously).toHaveBeenCalledOnce();
  });
  it('keeps missing configuration local and never initializes Firebase', async () => {
    vi.stubEnv('VITE_FIREBASE_APP_ID','');
    const {getApiCredentials} = await import('../js/api-identity');
    await expect(getApiCredentials()).rejects.toThrow(/Saved content is still available/);
    expect(sdk.initializeApp).not.toHaveBeenCalled();
  });
  it('fails closed on denied App Check without retrying or replacing the anonymous user', async () => {
    sdk.getToken.mockRejectedValueOnce(new Error('private verification failure'));
    const {getApiCredentials} = await import('../js/api-identity');
    await expect(getApiCredentials()).rejects.toThrow(/Could not verify this browser/);
    expect(sdk.getToken).toHaveBeenCalledOnce();
    expect(sdk.signInAnonymously).toHaveBeenCalledOnce();
    await expect(getApiCredentials()).resolves.toMatchObject({appCheckToken:'check-token'});
    expect(sdk.getToken).toHaveBeenCalledTimes(2);
    expect(sdk.signInAnonymously).toHaveBeenCalledOnce();
  });
});
