import { GoogleGenAI, type Content } from '@google/genai';
import config from '../config/index';

/**
 * Gemini client wrapper. Only exposes `generateJson` — the single capability the
 * extraction service needs — so the SDK stays isolated behind this seam.
 */
let ai: GoogleGenAI | undefined;
const getClient = (): GoogleGenAI => {
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  }
  return ai;
};

export interface GenerateJsonParams {
  contents: Content[];
  responseSchema: Record<string, unknown>;
}

/**
 * Run a multimodal generate call constrained to JSON output. Returns the parsed
 * JSON object; throws on an empty response.
 */
export const generateJson = async ({
  contents,
  responseSchema,
}: GenerateJsonParams): Promise<unknown> => {
  const res = await getClient().models.generateContent({
    model: config.GEMINI_MODEL,
    contents,
    config: {
      responseMimeType: 'application/json',
      // The response schema is an OpenAPI-subset object; cast at the SDK seam.
      responseSchema: responseSchema as never,
    },
  });

  const { text } = res;
  if (!text) {
    throw new Error('Gemini returned an empty response');
  }
  return JSON.parse(text);
};

export default { generateJson };
