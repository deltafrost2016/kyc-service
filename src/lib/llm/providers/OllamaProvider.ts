import { config } from '../../../config/index.js';
import { LlmProvider } from '../LlmProvider';
import type { GenerateJsonParams } from '../types';
import { toStandardJsonSchema } from '../schemaUtil';

/** Local Ollama structured-output extraction via `/api/chat` + `format`. */
export class OllamaProvider extends LlmProvider {
  async generateJson({ prompt, image, responseSchema }: GenerateJsonParams): Promise<unknown> {
    const res = await fetch(`${config.OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.OLLAMA_MODEL,
        messages: [
          {
            role: 'user',
            content: prompt,
            ...(image ? { images: [image.base64] } : {}),
          },
        ],
        format: toStandardJsonSchema(responseSchema),
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama request failed: ${res.status} ${await res.text()}`);
    }

    const json = (await res.json()) as { message?: { content?: string } };
    const text = json.message?.content;
    if (!text) {
      throw new Error('Ollama returned an empty response');
    }
    return JSON.parse(text);
  }
}

export default OllamaProvider;
