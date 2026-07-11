import { generateJson } from '../lib/gemini';
import {
  extractedZodSchema,
  geminiResponseSchema,
  type Extracted,
} from '../domain/extractionSchema';
import { DOCUMENT_TYPES, type DocumentType } from '../domain/documentTypes';

const PROMPT = `You are an OCR extraction engine for Indian identity documents.
The image is one of: UIDAI Aadhaar, Passport, Driving Licence, or PAN card.
Extract exactly these fields and return JSON conforming to the schema:
- documentNumber: the primary ID number on the document
- name: the document holder's full name
- dateOfBirth: date of birth in ISO format YYYY-MM-DD
- address: full address as printed
- mothersName: mother's name if present
- validityDate: expiry/validity date in ISO YYYY-MM-DD (null for PAN and Aadhaar)
- documentType: one of AADHAAR, PASSPORT, DRIVING_LICENCE, PAN
Rules: Use null for any field that is not present or not legible. Do not guess.
Normalize all dates to YYYY-MM-DD.`;

/** Normalize documentType to a known enum value or null. */
const normalizeDocType = (value: unknown): DocumentType | null => {
  if (!value) {
    return null;
  }
  const upper = String(value).toUpperCase().replace(/\s+/g, '_');
  return (DOCUMENT_TYPES as readonly string[]).includes(upper) ? (upper as DocumentType) : null;
};

/**
 * Extract the 6 fields from a base64 document image via Gemini.
 * Returns a validated object; throws on unparseable/invalid model output.
 */
export const extractDocument = async ({
  base64,
  mimeType,
}: {
  base64: string;
  mimeType: string;
}): Promise<Extracted> => {
  const contents = [
    {
      role: 'user',
      parts: [
        { text: PROMPT },
        {
          inlineData: {
            mimeType,
            data: base64,
          },
        },
      ],
    },
  ];

  const raw = (await generateJson({
    contents,
    responseSchema: geminiResponseSchema as unknown as Record<string, unknown>,
  })) as Record<string, unknown>;

  // Coerce documentType before strict validation (models sometimes vary casing).
  const coerced = {
    ...raw,
    documentType: normalizeDocType(raw.documentType),
  };
  return extractedZodSchema.parse(coerced);
};

export default { extractDocument };
