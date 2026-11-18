import { describe, expect, it } from 'vitest';
import { getApiConfiguration } from '../js/api-config';

const env = {
  VITE_API_URL:'https://api.example.test',VITE_FIREBASE_API_KEY:'public-test-key',
  VITE_FIREBASE_AUTH_DOMAIN:'app.example.test',VITE_FIREBASE_PROJECT_ID:'test-project',
  VITE_FIREBASE_APP_ID:'test-app',VITE_RECAPTCHA_ENTERPRISE_SITE_KEY:'test-site-key',
};
describe('protected web configuration', () => {
  it.each(Object.keys(env))('requires explicit %s without a hosted fallback', key => {
    expect(() => getApiConfiguration({...env,[key]:''},false)).toThrow(/not configured/);
  });
  it.each([
    {VITE_API_URL:'http://api.example.test'},
    {VITE_API_URL:'https://localhost:8080'},
    {VITE_API_URL:'https://127.0.0.1'},
    {VITE_API_URL:'https://tiny'},
    {VITE_FIREBASE_AUTH_DOMAIN:'localhost'},
    {VITE_FIREBASE_PROJECT_ID:'demo-protection'},
    {FIREBASE_AUTH_EMULATOR_HOST:'localhost:9099'},
    {VITE_FIREBASE_APPCHECK_DEBUG_TOKEN:'not-a-real-secret'},
  ])('rejects unsafe release settings %j', unsafe => {
    expect(() => getApiConfiguration({...env,...unsafe},true)).toThrow(/Production/);
  });
  it('permits a local API with the identity inputs of a registered development app', () => {
    const config = getApiConfiguration({...env,VITE_API_URL:'http://localhost:8080/'},false);
    expect(config.apiUrl).toBe('http://localhost:8080');
    expect(config.identity.siteKey).toBe('test-site-key');
  });
  it('sends no credentials from a development server that has only a local API URL', () => {
    expect(getApiConfiguration({VITE_API_URL:'http://tiny:5751'},false)).toEqual({apiUrl:'http://tiny:5751',identity:null});
  });
  it('never drops credentials in a production build or for a non-local API', () => {
    expect(() => getApiConfiguration({VITE_API_URL:'http://tiny:5751'},true)).toThrow(/not configured/);
    expect(() => getApiConfiguration({VITE_API_URL:'https://api.example.test'},false)).toThrow(/not configured/);
  });
  it.each(['https://user:pass@api.example.test','https://api.example.test?token=unsafe','javascript:alert(1)'])('rejects unsafe URL %s', VITE_API_URL => {
    expect(() => getApiConfiguration({...env,VITE_API_URL},true)).toThrow(/invalid API URL/);
  });
});
