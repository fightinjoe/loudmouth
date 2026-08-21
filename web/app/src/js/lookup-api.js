/**
 * Client for the /lookup endpoint (docs/API_DESIGN.md). Same Cloud API
 * Gateway the legacy /translate client used (see git history of the deleted
 * translation-panel.js) — the gateway now also routes /lookup to the same
 * Cloud Run service (api/config/api-gateway.yaml).
 *
 * Base URL is overridable for local development against `cd api/src &&
 * npm run dev` (see README.md "Local development against a local API").
 * Set `VITE_API_URL` in `.env.local` (gitignored) to point at
 * `http://localhost:8080` instead of the deployed gateway.
 */

const GATEWAY_URL = import.meta.env.VITE_API_URL || "https://translation-api-gateway-2qqw247r.uc.gateway.dev";

/**
 * Calls /lookup and returns the parsed `{ blocks }` response.
 *
 * @param {Object} params
 * @param {string} params.term
 * @param {string} params.language  - 'zh' | 'ja' | 'es' | 'cs'
 * @param {string} [params.ability]
 * @param {string} [params.formality]
 * @param {string} [params.audience]
 * @param {string} [params.llm]
 * @returns {Promise<{ blocks: Array }>}
 */
export async function lookup({ term, language, ability, formality, audience, llm }) {
  const res = await fetch(`${GATEWAY_URL}/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ term, language, ability, formality, audience, llm }),
  });

  if (!res.ok) {
    let message = `/lookup failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* body wasn't JSON — keep the generic message */
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  return res.json();
}
