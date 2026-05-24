import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY no está configurada en .env');
}

const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const MODEL = 'gemini-2.5-flash';

export async function generateStructuredJSON(systemInstruction, userMessage, schema) {
  const response = await genAI.models.generateContent({
    model: MODEL,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
    contents: userMessage,
  });

  const text = response.text;
  if (!text) throw new Error('Respuesta vacía de Gemini');

  return JSON.parse(text);
}

export async function generateMarkdown(systemInstruction, userMessage) {
  const response = await genAI.models.generateContent({
    model: MODEL,
    config: {
      systemInstruction,
    },
    contents: userMessage,
  });

  return response.text;
}
