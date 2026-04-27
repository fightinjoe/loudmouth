const { GoogleGenAI } = require('@google/genai');

let client = null;

function getClient() {
  if (!client) {
    const project = process.env.GCP_PROJECT_ID;
    const location = process.env.GCP_LOCATION || 'us-central1';
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

async function callGenAI(prompt) {
  const ai = getClient();
  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: prompt,
    config: {
      temperature: 0.2,
      maxOutputTokens: 1024,
    },
  });

  const text = result.text;
  if (!text) {
    throw new Error('Google Gen AI returned a response with no text content');
  }

  return text;
}

module.exports = { callGenAI };
