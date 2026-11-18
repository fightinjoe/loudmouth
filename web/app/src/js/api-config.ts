type Environment = Readonly<Record<string, unknown>>;

const identityInputs = [
  'VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID', 'VITE_RECAPTCHA_ENTERPRISE_SITE_KEY',
] as const;
const required = ['VITE_API_URL', ...identityInputs] as const;

function localHost(host: string): boolean {
  return !host.includes('.') || host === 'localhost' || host.endsWith('.localhost') ||
    host.endsWith('.local') || host.endsWith('.internal') || host.includes(':') ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host);
}

// Shared by Vite's release gate and lazy runtime initialization. Never called at module load.
// `identity` is null only on a development server that has no Firebase inputs at all and calls a
// local API; that API must run with PROTECTION_ENV=local, because the requests carry no credentials.
export function getApiConfiguration(env: Environment, production: boolean) {
  const isSet = (key: typeof required[number]) => typeof env[key] === 'string' && Boolean((env[key] as string).trim());
  const unprotected = !production && isSet('VITE_API_URL') && !identityInputs.some(isSet);
  for (const key of unprotected ? (['VITE_API_URL'] as const) : required) {
    if (!isSet(key)) {
      throw new Error(`Online generation is not configured (${key}). Saved content is still available.`);
    }
  }
  const value = (key: typeof required[number]) => (env[key] as string).trim();
  let url: URL;
  try { url = new URL(value('VITE_API_URL')); }
  catch { throw new Error('Online generation requires a valid API URL. Saved content is still available.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Online generation has an invalid API URL. Saved content is still available.');
  }
  const apiUrl = url.href.replace(/\/$/, '');
  if (unprotected) {
    if (!localHost(url.hostname)) {
      throw new Error('Online generation is not configured (Firebase inputs are required for a non-local API). Saved content is still available.');
    }
    return { apiUrl, identity: null };
  }
  const authDomain = value('VITE_FIREBASE_AUTH_DOMAIN');
  if (!/^[a-zA-Z0-9.-]+$/.test(authDomain)) throw new Error('Invalid Firebase auth domain.');
  if (production && (url.protocol !== 'https:' || localHost(url.hostname) || localHost(authDomain) ||
    value('VITE_FIREBASE_PROJECT_ID').startsWith('demo-') ||
    Object.entries(env).some(([key, setting]) => /(?:EMULATOR|DEBUG_TOKEN)/i.test(key) && Boolean(setting)))) {
    throw new Error('Production generation configuration cannot use local, emulator, or debug settings.');
  }
  return {
    apiUrl,
    identity: {
      firebase: {
        apiKey: value('VITE_FIREBASE_API_KEY'), authDomain,
        projectId: value('VITE_FIREBASE_PROJECT_ID'), appId: value('VITE_FIREBASE_APP_ID'),
      },
      siteKey: value('VITE_RECAPTCHA_ENTERPRISE_SITE_KEY'),
    },
  };
}
