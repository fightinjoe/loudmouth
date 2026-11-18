import type { AppUI } from './js/app-types';
import type * as library from './js/db';

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_URL?: string;
    readonly VITE_DEV_PORT?: string;
    readonly VITE_FIREBASE_API_KEY?: string;
    readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
    readonly VITE_FIREBASE_PROJECT_ID?: string;
    readonly VITE_FIREBASE_APP_ID?: string;
    readonly VITE_RECAPTCHA_ENTERPRISE_SITE_KEY?: string;
  }
  interface Window {
    __loudmouth?: {
      ui: AppUI;
      db: typeof library;
    };
  }
}

export {};
