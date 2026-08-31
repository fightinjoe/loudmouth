const { GoogleGenAI } = require('@google/genai');

const GENAI_MODEL = 'gemini-3.5-flash-lite';

let client = null;

function getClient() {
  if (!client) {
    const project = process.env.GCP_PROJECT_ID;
    const location = process.env.GCP_VERTEX_LOCATION || 'global';
    if (!project) {
      throw new Error('GCP_PROJECT_ID environment variable is not set');
    }
    client = new GoogleGenAI({
      vertexai: true,
      project,
      location,
    });
  }
  return client;
}

async function callGenAI(prompt, { maxOutputTokens = 1024 } = {}) {
  const ai = getClient();
  const result = await ai.models.generateContent({
    model: GENAI_MODEL,
    contents: prompt,
    config: {
      // gemini-3.5-flash-lite ignores custom temperature/top-K/top-P (defaults
      // temperature 1.0) and defaults to MINIMAL thinking — fine for the
      // low-latency JSON generation here. See the Vertex model card.
      maxOutputTokens,
    },
  });

  const text = result.text;
  if (!text) {
    throw new Error('Google Gen AI returned a response with no text content');
  }

  const meta = result.usageMetadata || {};
  return {
    text,
    model: GENAI_MODEL,
    usage: {
      inputTokens: meta.promptTokenCount ?? 0,
      outputTokens: meta.candidatesTokenCount ?? 0,
    },
  };
}

module.exports = { callGenAI, GENAI_MODEL };
