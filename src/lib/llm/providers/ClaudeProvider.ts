import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../../config/index.js';
import { LlmProvider } from '../LlmProvider';
import type { GenerateJsonParams } from '../types';
import { toStandardJsonSchema } from '../schemaUtil';

const TOOL_NAME = 'extract';

/**
 * Claude structured-output extraction via a forced tool call — the tool's
 * `input` is the extracted JSON, validated against `input_schema`.
 */
export class ClaudeProvider extends LlmProvider {
  private client?: Anthropic;

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    }
    return this.client;
  }

  async generateJson({ prompt, image, responseSchema }: GenerateJsonParams): Promise<unknown> {
    const content: Anthropic.MessageParam['content'] = [{ type: 'text', text: prompt }];
    if (image) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: image.mimeType as never, data: image.base64 },
      });
    }

    const res = await this.getClient().messages.create({
      model: config.CLAUDE_MODEL,
      max_tokens: 4096,
      tools: [
        {
          name: TOOL_NAME,
          description: 'Return the extracted document fields as structured JSON.',
          input_schema: toStandardJsonSchema(responseSchema) as never,
        },
      ],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content }],
    });

    const toolUse = res.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    if (!toolUse) {
      throw new Error('Claude returned no tool_use block');
    }
    return toolUse.input;
  }
}

export default ClaudeProvider;
