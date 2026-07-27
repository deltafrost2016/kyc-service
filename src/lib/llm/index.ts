import { config } from '../../config/index.js';
import { LlmProvider } from './LlmProvider';
import { GeminiProvider } from './providers/GeminiProvider';
import { ClaudeProvider } from './providers/ClaudeProvider';
import { OpenAiProvider } from './providers/OpenAiProvider';
import { OllamaProvider } from './providers/OllamaProvider';
import type { GenerateJsonParams } from './types';

export type { GenerateJsonParams, LlmImageInput } from './types';
export { LlmProvider };

type Config = typeof config;

const PROVIDERS: Record<Config['LLM_PROVIDER'], () => LlmProvider> = {
  gemini: () => new GeminiProvider(),
  claude: () => new ClaudeProvider(),
  openai: () => new OpenAiProvider(),
  ollama: () => new OllamaProvider(),
};

let provider: LlmProvider | undefined;

/** Swap providers by setting `LLM_PROVIDER` in config — no caller changes needed. */
export const getLlmProvider = (): LlmProvider => {
  if (!provider) {
    provider = PROVIDERS[config.LLM_PROVIDER]();
  }
  return provider;
};

export const generateJson = (params: GenerateJsonParams): Promise<unknown> =>
  getLlmProvider().generateJson(params);

export default { generateJson, getLlmProvider };
