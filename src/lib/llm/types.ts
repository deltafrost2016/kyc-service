/** Multimodal input image for a generateJson call. */
export interface LlmImageInput {
  mimeType: string;
  base64: string;
}

export interface GenerateJsonParams {
  prompt: string;
  image?: LlmImageInput;
  /** Gemini-flavored OpenAPI-subset JSON schema (uppercase `type`, `nullable`). */
  responseSchema: Record<string, unknown>;
}
