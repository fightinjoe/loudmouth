import type { Lang } from '@catchphrase/card-schema';
import { escapeHTML } from '../js/utils';

export interface LanguageOptions {
  lang: Lang;
  flag: string;
  name: string;
  subtitle: string;
}

/** One language shelf tile; the navigation owner supplies its counts and labels. */
export function renderLanguage({ lang, flag, name, subtitle }: LanguageOptions): string {
  return `<button type="button" class="nav-language" data-action="nav/browse-lang" data-lang="${escapeHTML(lang)}">
    <span>${escapeHTML(flag)} ${escapeHTML(name)}</span><small>${escapeHTML(subtitle)}</small>
  </button>`;
}
