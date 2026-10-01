import { generatePhrasebookImage } from './phrasebook-api';
import { setDeckIllustration } from './db';
import type { DeckIllustration } from './library-types';
import { uuid } from './utils';

export interface IllustrationTask {
  snapshot(): DeckIllustration;
  bind(deckId: string): Promise<void>;
  cancel(): void;
}

/** One seed-based request, owned by its context until an atomic text commit binds it. */
export function createIllustrationTask(
  prompt: string,
  onUpdated: (deckId: string, illustration: DeckIllustration) => void,
): IllustrationTask {
  const requestId = uuid();
  const controller = new AbortController();
  let illustration: DeckIllustration = { requestId, prompt, state: 'pending' };
  let boundDeckId: string | null = null;
  let cancelled = false;

  async function persist(): Promise<void> {
    const deckId = boundDeckId;
    if (!deckId || cancelled || illustration.state === 'pending') return;
    const settled = illustration;
    // An image-storage failure must not undo or hide a successful text commit.
    // Pending state is marked failed on reload, never restarted as paid work.
    try {
      if (await setDeckIllustration(deckId, requestId, settled)) {
        onUpdated(deckId, settled);
      }
    } catch { /* Keep the last durable deck state when local storage is unavailable. */ }
  }

  void generatePhrasebookImage({ prompt, signal: controller.signal }).then(
    ({ image }) => {
      if (cancelled) return;
      illustration = { requestId, prompt, state: 'ready', image };
      return persist();
    },
    () => {
      if (cancelled) return;
      illustration = { requestId, prompt, state: 'failed' };
      return persist();
    },
  );

  return {
    snapshot: () => illustration,
    bind(deckId) {
      if (cancelled) return Promise.resolve();
      if (boundDeckId !== null && boundDeckId !== deckId) {
        return Promise.reject(new Error('Illustration already belongs to another phrasebook'));
      }
      boundDeckId = deckId;
      // Attach synchronously; only an already-settled result can be awaited here.
      return persist();
    },
    cancel() {
      if (boundDeckId !== null || cancelled) return;
      cancelled = true;
      controller.abort();
      illustration = { requestId, prompt, state: 'failed' };
    },
  };
}
