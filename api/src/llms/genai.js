const { GoogleGenAI, ThinkingLevel } = require('@google/genai');
const { serializeInput, checkResponse } = require('./bounds');
const { recordProviderReply, recordProviderFailure } = require('../protection/work');

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
      httpOptions: { retryOptions: { attempts: 1 } },
    });
  }
  return client;
}

function usageFromMetadata(meta = {}) {
  return {
    inputTokens: meta.promptTokenCount,
    outputTokens: Number.isFinite(meta.candidatesTokenCount)
      ? meta.candidatesTokenCount + (meta.thoughtsTokenCount ?? 0) : undefined,
  };
}
function buildGenerationConfig(maxOutputTokens, signal, responseJsonSchema, systemInstruction, reasoning) {
  return {
    maxOutputTokens,
    responseMimeType: 'application/json',
    systemInstruction,
    ...(responseJsonSchema ? { responseJsonSchema } : {}),
    // Only callers that ask for minimal reasoning set a level; others keep the model default.
    ...(reasoning === 'minimal' ? { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } } : {}),
    ...(signal ? { abortSignal: signal } : {}),
  };
}

/**
 * @param {string} model
 * @param {{ instructions: string, input: string }} prompt
 * @param {{ maxOutputTokens?: number, signal?: AbortSignal, responseJsonSchema?: object, reasoning?: 'minimal' }} options
 */
async function callGenAIModel(model, prompt, { maxOutputTokens = 1024, signal, responseJsonSchema, reasoning } = {}) {
  const ai = getClient();
  const request = {
    model,
    contents: prompt.input,
    config: buildGenerationConfig(
      maxOutputTokens,
      signal,
      responseJsonSchema,
      prompt.instructions,
      reasoning,
    ),
  };
  // Bound the serialized Vertex wire shape, including SDK content wrappers.
  serializeInput({
    model,
    contents: [{ role: 'user', parts: [{ text: prompt.input }] }],
    systemInstruction: { parts: [{ text: prompt.instructions }] },
    generationConfig: { maxOutputTokens, responseMimeType: 'application/json',
      ...(responseJsonSchema ? { responseJsonSchema } : {}) },
  });
  const result = await ai.models.generateContent(request).catch(error => {
    recordProviderFailure(error);
    throw error;
  });
  const reply = { model, usage: usageFromMetadata(result.usageMetadata) };
  recordProviderReply(reply);
  checkResponse(result);

  const text = result.text;
  if (!text) {
    throw new Error('Google Gen AI returned a response with no text content');
  }

  return { ...reply, text };
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

