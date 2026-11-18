type Environment = Readonly<Record<string, unknown>>;

const required = [
  'VITE_API_URL', 'VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID', 'VITE_RECAPTCHA_ENTERPRISE_SITE_KEY',
] as const;

function localHost(host: string): boolean {
  return !host.includes('.') || host === 'localhost' || host.endsWith('.localhost') ||
    host.endsWith('.local') || host.endsWith('.internal') || host.includes(':') ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host);
}

// Shared by Vite's release gate and lazy runtime initialization. Never called at module load.
export function getApiConfiguration(env: Environment, production: boolean) {
  for (const key of required) {
    if (typeof env[key] !== 'string' || !(env[key] as string).trim()) {
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
  const authDomain = value('VITE_FIREBASE_AUTH_DOMAIN');
  if (!/^[a-zA-Z0-9.-]+$/.test(authDomain)) throw new Error('Invalid Firebase auth domain.');
  if (production && (url.protocol !== 'https:' || localHost(url.hostname) || localHost(authDomain) ||
    value('VITE_FIREBASE_PROJECT_ID').startsWith('demo-') ||
    Object.entries(env).some(([key, setting]) => /(?:EMULATOR|DEBUG_TOKEN)/i.test(key) && Boolean(setting)))) {
    throw new Error('Production generation configuration cannot use local, emulator, or debug settings.');
  }
  return {
    apiUrl: url.href.replace(/\/$/, ''),
    firebase: {
      apiKey: value('VITE_FIREBASE_API_KEY'), authDomain,
      projectId: value('VITE_FIREBASE_PROJECT_ID'), appId: value('VITE_FIREBASE_APP_ID'),
    },
    siteKey: value('VITE_RECAPTCHA_ENTERPRISE_SITE_KEY'),
  };
}
