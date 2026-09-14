/**
 * Clients for guided phrasebook creation. VITE_API_URL can point all
 * requests at a local API during development.
 */

const GATEWAY_URL = import.meta.env.VITE_API_URL || "https://translation-api-gateway-2qqw247r.uc.gateway.dev";

async function post(path, body, { signal } = {}) {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    let message = `${path} failed (${res.status})`;
    try {
      const errBody = await res.json();
      if (errBody?.error) message = errBody.error;
    } catch {
      /* body wasn't JSON — keep the generic message */
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

/**
 * Fetches the context questions and suggested checklist for a seed.
 *
 * @param {{ seed: string, language: string, signal?: AbortSignal }} params
 * @returns {Promise<{ questions: Array, checklist: Array, usage?: Object }>}
 */
export async function getContext({ seed, language, signal }) {
  return post("/context", { seed, language }, { signal });
}

/**
 * Generates phrasebook cards from the user's context answers and every
 * checklist topic. Creation always uses the API's basic ability level;
 * historical deck preferences are intentionally not part of this request.
 *
 * @param {{ seed: string, language: string, answers: Object, checklist: string[], signal?: AbortSignal }} params
 * @returns {Promise<{ title: string, groups: Array<{ title: string, cards: Array, vocab: Array }>, usage?: Object }>}
 */
export async function generatePhrasebook({ seed, language, answers, checklist, signal }) {
  return post("/phrasebook", {
    seed,
    language,
    ability: "basics",
    answers,
    checklist,
  }, { signal });
}

/** Fetches an English UI title independently of context and card generation. */
export async function getPhrasebookTitle({ seed, signal }) {
  return post("/phrasebook-title", { seed }, { signal });
}
