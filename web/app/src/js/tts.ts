import type { Card, Lang } from "@catchphrase/card-schema";

export interface SpeakOptions {
  onEnd?: (event: SpeechSynthesisEvent) => void;
  onError?: (event: SpeechSynthesisErrorEvent) => void;
}

export const ttsAvailable = typeof window !== "undefined" && "speechSynthesis" in window;

const LANG_MAP: Partial<Record<Lang, string>> = {
  zh: "zh-CN",
  ja: "ja-JP",
};

/** Speaks text with the browser Web Speech API when it is available. */
export function speak(
  text: string,
  lang: Lang,
  { onEnd, onError }: SpeakOptions = {},
): void {
  if (!ttsAvailable) return;
  cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = LANG_MAP[lang] ?? lang;
  if (onEnd) utterance.addEventListener("end", onEnd);
  if (onError) utterance.addEventListener("error", onError);
  window.speechSynthesis.speak(utterance);
}

/** Returns the text that should be spoken for a validated card. */
export function ttsText(card: Card): string {
  if (card.lang === "ja" && card.reading) {
    return card.reading.map(([base, annotation]) => annotation || base).join("");
  }
  return card.text;
}

/** Cancels the active browser utterance when present. */
export function cancel(): void {
  if (ttsAvailable) window.speechSynthesis.cancel();
}
