import type { Lang } from '@catchphrase/card-schema';
import type { SpeakOptions } from '../../js/tts';
export { ttsText } from 'storybook:actual/tts';
export type { SpeakOptions } from '../../js/tts';

export interface SpeechEvent {
  kind: 'speak' | 'cancel';
  text?: string;
  lang?: Lang;
}
export const speechEvents: SpeechEvent[] = [];
export const ttsAvailable = true;

function record(event: SpeechEvent): void {
  speechEvents.push(event);
  window.dispatchEvent(new CustomEvent('workbench:speech', { detail: event }));
}
export function speak(text: string, lang: Lang, _options: SpeakOptions = {}): void {
  cancel();
  record({ kind: 'speak', text, lang });
}
export function cancel(): void {
  record({ kind: 'cancel' });
}
export function resetSpeech(): void {
  speechEvents.length = 0;
}
