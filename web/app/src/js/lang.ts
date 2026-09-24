import type { Lang } from "@catchphrase/card-schema";

export const LANG_FLAGS = {
  zh: "🇨🇳",
  ja: "🇯🇵",
  ko: "🇰🇷",
  es: "🇪🇸",
  cs: "🇨🇿",
  fr: "🇫🇷",
  de: "🇩🇪",
  pt: "🇵🇹",
  it: "🇮🇹",
  ru: "🇷🇺",
} as const;

export const LANG_NAMES = {
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  es: "Spanish",
  cs: "Czech",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
  ru: "Russian",
} as const satisfies Record<keyof typeof LANG_FLAGS, string>;

export type LanguageCode = keyof typeof LANG_FLAGS;

/** Languages accepted by the v2 content schema. */
export const CONTENT_LANGUAGES = ["zh", "ja", "es", "cs"] as const satisfies readonly Lang[];

export function isContentLanguage(value: unknown): value is Lang {
  return value === "zh" || value === "ja" || value === "es" || value === "cs";
}
