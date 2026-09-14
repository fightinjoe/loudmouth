const { GoogleGenAI } = require('@google/genai');

const GENAI_MODEL = 'gemini-3.5-flash-lite';
const GENAI_FLASH_MODEL = 'gemini-3.8-flash';

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

function usageFromMetadata(meta = {}) {
  return {
    inputTokens: meta.promptTokenCount ?? 0,
    outputTokens: (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0),
  };
}
function buildGenerationConfig(maxOutputTokens, signal, responseJsonSchema, systemInstruction) {
  return {
    maxOutputTokens,
    responseMimeType: 'application/json',
    systemInstruction,
    ...(responseJsonSchema ? { responseJsonSchema } : {}),
    ...(signal ? { abortSignal: signal } : {}),
  };
}

/**
 * @param {string} model
 * @param {{ instructions: string, input: string }} prompt
 * @param {{ maxOutputTokens?: number, signal?: AbortSignal, responseJsonSchema?: object }} options
 */
async function callGenAIModel(model, prompt, { maxOutputTokens = 1024, signal, responseJsonSchema } = {}) {
  const ai = getClient();
  const result = await ai.models.generateContent({
    model,
    contents: prompt.input,
    config: buildGenerationConfig(
      maxOutputTokens,
      signal,
      responseJsonSchema,
      prompt.instructions,
    ),
  });

  const text = result.text;
  if (!text) {
    throw new Error('Google Gen AI returned a response with no text content');
  }

  const meta = result.usageMetadata || {};
  return {
    text,
    model,
    usage: usageFromMetadata(meta),
  };
}

function callGenAI(prompt, options) {
  return callGenAIModel(GENAI_MODEL, prompt, options);
}

function callGenAIFlash(prompt, options) {
  return callGenAIModel(GENAI_FLASH_MODEL, prompt, options);
}

// Gemini 3.8 Flash may spend longer reasoning before returning structured JSON.
callGenAIFlash.timeoutMs = 60000;

module.exports = {
  callGenAI,
  callGenAIFlash,
  GENAI_MODEL,
  GENAI_FLASH_MODEL,
  usageFromMetadata,
  buildGenerationConfig,
};

