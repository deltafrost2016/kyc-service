import { GoogleGenAI } from '@google/genai';
import { config } from '../../../config/index.js';
import { LlmProvider } from '../LlmProvider';
import type { GenerateJsonParams } from '../types';

/** Gemini structured-output extraction via `@google/genai`. */
export class GeminiProvider extends LlmProvider {
  private client?: GoogleGenAI;

  private getClient(): GoogleGenAI {
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
    }
    return this.client;
  }

  async generateJson({ prompt, image, responseSchema }: GenerateJsonParams): Promise<unknown> {
    const parts: Array<Record<string, unknown>> = [{ text: prompt }];
    if (image) {
      parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
    }

    const res = await this.getClient().models.generateContent({
      model: config.GEMINI_MODEL,
      contents: [{ role: 'user', parts }],
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
  }
}

export default GeminiProvider;
