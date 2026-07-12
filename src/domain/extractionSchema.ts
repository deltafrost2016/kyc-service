import { z } from 'zod';
import { DOCUMENT_TYPES } from './documentTypes';

/**
 * The 6 extracted fields. Two representations kept in sync:
 *  - `extractedZodSchema`: validates/normalizes whatever Gemini returns.
 *  - `geminiResponseSchema`: constrains Gemini's JSON output (structured output).
 */

export const extractedZodSchema = z.object({
  documentNumber: z.string().nullable(),
  name: z.string().nullable(), // document holder's name (needed by the name rule)
  dateOfBirth: z.string().nullable(), // ISO YYYY-MM-DD
  address: z.string().nullable(),
  mothersName: z.string().nullable(),
  validityDate: z.string().nullable(), // ISO YYYY-MM-DD; null for PAN/Aadhaar
  documentType: z.enum(DOCUMENT_TYPES).nullable(),
});

export type Extracted = z.infer<typeof extractedZodSchema>;

/** Gemini structured-output schema (OpenAPI subset). */
export const geminiResponseSchema = {
  type: 'OBJECT',
  properties: {
    documentNumber: {
      type: 'STRING',
      nullable: true,
    },
    name: {
      type: 'STRING',
      nullable: true,
      description: "document holder's full name",
    },
    dateOfBirth: {
      type: 'STRING',
      nullable: true,
      description: 'ISO YYYY-MM-DD',
    },
    address: {
      type: 'STRING',
      nullable: true,
    },
    mothersName: {
      type: 'STRING',
      nullable: true,
    },
    validityDate: {
      type: 'STRING',
      nullable: true,
      description: 'ISO YYYY-MM-DD, null if none',
    },
    documentType: {
      type: 'STRING',
      nullable: true,
      enum: DOCUMENT_TYPES,
    },
  },
  required: [
    'documentNumber',
    'name',
    'dateOfBirth',
    'address',
    'mothersName',
    'validityDate',
    'documentType',
  ],
} as const;

export default {
  extractedZodSchema,
  geminiResponseSchema,
};
