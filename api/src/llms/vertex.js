const { VertexAI } = require('@google-cloud/vertexai');

let client = null;

function getClient() {
  if (!client) {
    const project = process.env.GCP_PROJECT_ID;
    const location = process.env.GCP_LOCATION || 'us-central1';
    if (!project) {
      throw new Error('GCP_PROJECT_ID environment variable is not set');
    }
    client = new VertexAI({ project, location });
  }
  return client;
}

async function callVertexAI(prompt) {
  const vertex = getClient();
  const model = vertex.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1024,
    },
  });

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('Vertex AI returned a response with no text content');
  }

  return text;
}

module.exports = { callVertexAI };
