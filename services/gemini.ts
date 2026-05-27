import { GoogleGenAI } from '@google/genai';
import { env } from './env';

const genAI = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
const MODEL = 'gemini-2.5-flash';

export interface TokenUsage {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
}

function extractTokenUsage(response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } }): TokenUsage {
  return {
    promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
    candidatesTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
  };
}

export async function generateStructuredJSON<T>(
  systemInstruction: string,
  userMessage: string,
  schema: Record<string, unknown>,
): Promise<{ data: T; tokens: TokenUsage }> {
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

  return {
    data: JSON.parse(text) as T,
    tokens: extractTokenUsage(response),
  };
}

export async function generateMarkdown(
  systemInstruction: string,
  userMessage: string,
): Promise<{ text: string; tokens: TokenUsage }> {
  const response = await genAI.models.generateContent({
    model: MODEL,
    config: {
      systemInstruction,
    },
    contents: userMessage,
  });

  if (!response.text) throw new Error('Respuesta vacía de Gemini');
  return {
    text: response.text,
    tokens: extractTokenUsage(response),
  };
}
