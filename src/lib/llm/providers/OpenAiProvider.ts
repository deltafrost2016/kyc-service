import OpenAI from 'openai';
import { config } from '../../../config/index.js';
import { LlmProvider } from '../LlmProvider';
import type { GenerateJsonParams } from '../types';
import { toStandardJsonSchema } from '../schemaUtil';

/** OpenAI structured-output extraction via `response_format: json_schema`. */
export class OpenAiProvider extends LlmProvider {
  private client?: OpenAI;

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
    }
    return this.client;
  }

  async generateJson({ prompt, image, responseSchema }: GenerateJsonParams): Promise<unknown> {
    const content: OpenAI.Chat.ChatCompletionContentPart[] = [
      {
        type: 'text',
        text: prompt,
      },
    ];
    if (image) {
      content.push({
        type: 'image_url',
        image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
      });
    }

    const res = await this.getClient().chat.completions.create({
      model: config.OPENAI_MODEL,
      messages: [
        {
          role: 'user',
          content,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'extraction',
          schema: toStandardJsonSchema(responseSchema),
          strict: true,
        },
      },
    });

    const text = res.choices[0]?.message?.content;
    if (!text) {
      throw new Error('OpenAI returned an empty response');
    }
    return JSON.parse(text);
  }
}

export default OpenAiProvider;
