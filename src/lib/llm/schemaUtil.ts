/**
 * Converts the Gemini-flavored OpenAPI-subset schema (uppercase `type`,
 * `nullable: true`) used by `domain/extractionSchema.ts` into a standard
 * JSON Schema (lowercase `type`, nullable via a `type` union) — the shape
 * Claude/OpenAI/Ollama structured-output APIs expect. Gemini's own provider
 * uses the source schema unchanged.
 */
export const toStandardJsonSchema = (schema: Record<string, unknown>): Record<string, unknown> => {
  const type = schema.type;
  const nullable = schema.nullable === true;

  if (type === 'OBJECT') {
    const properties = schema.properties as Record<string, unknown> | undefined;
    return {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(properties ?? {}).map(([key, value]) => [
          key,
          toStandardJsonSchema(value as Record<string, unknown>),
        ]),
      ),
      ...(schema.required ? { required: schema.required } : {}),
      additionalProperties: false,
    };
  }

  if (type === 'ARRAY') {
    return {
      type: 'array',
      items: toStandardJsonSchema(schema.items as Record<string, unknown>),
    };
  }

  const primitiveType = String(type).toLowerCase();
  const enumValues = schema.enum as unknown[] | undefined;
  return {
    type: nullable ? [primitiveType, 'null'] : primitiveType,
    ...(enumValues ? { enum: nullable ? [...enumValues, null] : enumValues } : {}),
  };
};

export default { toStandardJsonSchema };
