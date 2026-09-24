import type { AppUI } from './js/app-types';
import type * as library from './js/db';

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_URL?: string;
    readonly VITE_DEV_PORT?: string;
  }
  interface Window {
    __loudmouth: {
      ui: AppUI;
      db: typeof library;
    };
  }
}

export {};
