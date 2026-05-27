import { GoogleGenAI } from '@google/genai';
import { env } from './env';

const genAI = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
const MODEL = 'gemini-2.5-flash';

export async function generateStructuredJSON<T>(
  systemInstruction: string,
  userMessage: string,
  schema: Record<string, unknown>,
): Promise<T> {
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

  return JSON.parse(text) as T;
}

export async function generateMarkdown(
  systemInstruction: string,
  userMessage: string,
): Promise<string> {
  const response = await genAI.models.generateContent({
    model: MODEL,
    config: {
      systemInstruction,
    },
    contents: userMessage,
  });

  if (!response.text) throw new Error('Respuesta vacía de Gemini');
  return response.text;
}
