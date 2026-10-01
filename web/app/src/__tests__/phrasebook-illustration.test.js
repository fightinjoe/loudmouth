// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

const { generatePhrasebookImage, setDeckIllustration } = vi.hoisted(() => ({
  generatePhrasebookImage: vi.fn(),
  setDeckIllustration: vi.fn(),
}));
vi.mock('../js/phrasebook-api', () => ({ generatePhrasebookImage }));
vi.mock('../js/db', async (original) => ({ ...(await original()), setDeckIllustration }));

import { createDb } from '../js/db';
import { createIllustrationTask } from '../js/phrasebook-illustration';

const image = {
  dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAYAAAA7KqwyAAAAFklEQVR4nGP4sGVaAyWYYdSAUQOAGAAeWIiwsY03XwAAAABJRU5ErkJggg==',
  mediaType: 'image/png', width: 16, height: 9,
};
let store;
let persistIllustration;
let provider;

beforeAll(async () => {
  ({ setDeckIllustration: persistIllustration } = await vi.importActual('../js/db'));
});
beforeEach(async () => {
  store = createDb({ indexedDB: new IDBFactory(), IDBKeyRange });
  await store.open();
  let resolve, reject;
  provider = { promise: new Promise((yes, no) => { resolve = yes; reject = no; }) };
  Object.assign(provider, { resolve, reject });
  generatePhrasebookImage.mockReset().mockReturnValue(provider.promise);
  setDeckIllustration.mockReset().mockImplementation((deckId, requestId, next) =>
    persistIllustration(deckId, requestId, next, store));
});
afterEach(() => store.close());

async function saveDeck(task, id = 'saved-deck') {
  await store.decks.add({
    id, name: 'Dancing', lang: 'es', createdAt: '2026-01-01T00:00:00.000Z',
    mode: 'study', order: 'default', readingDisplay: 'reading', illustration: task.snapshot(),
  });
  return id;
}

describe('context-owned illustration lifetime', () => {
  it('binds pending work without awaiting it and survives dismissal after text commit', async () => {
    const updated = vi.fn();
    const task = createIllustrationTask('A watercolor of dancing shoes.', updated);
    const id = await saveDeck(task);
    await task.bind(id);
    expect((await store.decks.get(id)).illustration.state).toBe('pending');
    task.cancel();
    expect(generatePhrasebookImage.mock.calls[0][0].signal.aborted).toBe(false);
    provider.resolve({ image });
    await vi.waitFor(() => expect(updated).toHaveBeenCalledWith(id, expect.objectContaining({ state: 'ready', image })));
    expect((await store.decks.get(id)).illustration).toEqual(task.snapshot());
  });

  it('persists ready-before-commit art at bind and never attaches it to a second deck', async () => {
    const task = createIllustrationTask('A watercolor of dancing shoes.', () => {});
    provider.resolve({ image });
    await vi.waitFor(() => expect(task.snapshot().state).toBe('ready'));
    const id = await saveDeck(task);
    await task.bind(id);
    expect((await store.decks.get(id)).illustration.image).toEqual(image);
    await expect(task.bind('another-deck')).rejects.toThrow(/another phrasebook/);
  });

  it('aborts discarded contexts and ignores a provider that resolves after cancellation', async () => {
    const updated = vi.fn();
    const task = createIllustrationTask('An old seed.', updated);
    task.cancel();
    expect(generatePhrasebookImage.mock.calls[0][0].signal.aborted).toBe(true);
    provider.resolve({ image });
    await provider.promise;
    await Promise.resolve();
    await task.bind('not-created');
    expect(task.snapshot().state).toBe('failed');
    expect(await store.decks.count()).toBe(0);
    expect(updated).not.toHaveBeenCalled();
  });

  it('records image failure without affecting committed text or another open deck', async () => {
    const updated = vi.fn();
    const task = createIllustrationTask('A watercolor of dancing shoes.', updated);
    const id = await saveDeck(task);
    await task.bind(id);
    await store.decks.add({ ...(await store.decks.get(id)), id: 'viewed-deck', name: 'Other topic', illustration: undefined });
    provider.reject(new Error('Matting failed'));
    await vi.waitFor(() => expect(updated).toHaveBeenCalledWith(id, expect.objectContaining({ state: 'failed' })));
    expect((await store.decks.get(id)).name).toBe('Dancing');
    expect((await store.decks.get('viewed-deck')).illustration).toBeUndefined();
  });

  it.each(['deleted', 'superseded', 'already-ready'])('does not replace %s deck ownership on late completion', async (condition) => {
    const updated = vi.fn();
    const task = createIllustrationTask('An old seed.', updated);
    const id = await saveDeck(task);
    await task.bind(id);
    let expected;
    if (condition === 'deleted') {
      await store.decks.delete(id);
    } else {
      expected = condition === 'superseded'
        ? { requestId: crypto.randomUUID(), prompt: 'A replacement seed.', state: 'pending' }
        : { ...task.snapshot(), state: 'ready', image };
      await store.decks.update(id, { illustration: expected });
    }
    provider.reject(new Error('Old image failed'));
    await vi.waitFor(() => expect(setDeckIllustration).toHaveBeenCalledTimes(1));
    await setDeckIllustration.mock.results[0].value;
    expect((await store.decks.get(id))?.illustration).toEqual(expected);
    expect(updated).not.toHaveBeenCalled();
  });
});
