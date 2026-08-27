/**
 * Client for the /textbook endpoint (docs/API_DESIGN.md "Catchphrase guided
 * phrasebook generation (/textbook)"). Same Cloud API Gateway the /lookup
 * client uses — see lookup-api.js for the gateway/env-override rationale.
 *
 * One route, two calls distinguished by whether `context` is passed:
 * `getTextbookQuestions` omits it (call 1: dynamic context questions +
 * checklist); `generateTextbook` includes it (call 2: bulk-generate the
 * full phrasebook).
 */

const GATEWAY_URL = import.meta.env.VITE_API_URL || "https://translation-api-gateway-2qqw247r.uc.gateway.dev";

async function postTextbook(body) {
  const res = await fetch(`${GATEWAY_URL}/textbook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `/textbook failed (${res.status})`;
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
 * Call 1 — dynamic context questions + a suggested checklist for a topic.
 *
 * @param {Object} params
 * @param {string} params.topic
 * @param {string} params.language  - 'zh' | 'ja' | 'es' | 'cs'
 * @param {string} [params.ability]
 * @param {string} [params.llm]
 * @returns {Promise<{ questions: Array, checklist: Array }>}
 */
export async function getTextbookQuestions({ topic, language, ability, llm }) {
  return postTextbook({ topic, language, ability, llm });
}

/**
 * Call 2 — bulk-generate the full phrasebook content from the topic plus
 * the learner's context answers and checked checklist items.
 *
 * @param {Object} params
 * @param {string} params.topic
 * @param {string} params.language  - 'zh' | 'ja' | 'es' | 'cs'
 * @param {string} [params.ability]
 * @param {string} [params.llm]
 * @param {{ answers: Object, checklist: string[] }} params.context
 * @returns {Promise<{ groups: Array }>}
 */
export async function generateTextbook({ topic, language, ability, llm, context }) {
  return postTextbook({ topic, language, ability, llm, context });
}
