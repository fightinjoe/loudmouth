/**
 * Clients for guided phrasebook creation. Both calls use the same API base as
 * /lookup, with VITE_API_URL available for local development.
 */

const GATEWAY_URL = import.meta.env.VITE_API_URL || "https://translation-api-gateway-2qqw247r.uc.gateway.dev";

async function post(path, body) {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
 * @param {{ seed: string, language: string }} params
 * @returns {Promise<{ questions: Array, checklist: Array, usage?: Object }>}
 */
export async function getContext({ seed, language }) {
  return post("/context", { seed, language });
}

/**
 * Generates phrasebook cards from the user's context answers and selected
 * checklist topics. Creation always uses the API's basic ability level;
 * historical deck preferences are intentionally not part of this request.
 *
 * @param {{ seed: string, language: string, answers: Object, checklist: string[] }} params
 * @returns {Promise<{ title: string, groups: Array, usage?: Object }>}
 */
export async function generatePhrasebook({ seed, language, answers, checklist }) {
  return post("/phrasebook", {
    seed,
    language,
    ability: "basics",
    answers,
    checklist,
  });
}
