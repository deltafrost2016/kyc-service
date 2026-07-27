import type { GenerateJsonParams } from './types';

/**
 * Class-based seam for structured-JSON multimodal extraction. Each concrete
 * provider (Gemini/Claude/OpenAI/Ollama) owns its own request/response shape;
 * callers only ever see `generateJson`.
 */
export abstract class LlmProvider {
  abstract generateJson(params: GenerateJsonParams): Promise<unknown>;
}

export default LlmProvider;
