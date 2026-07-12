/** The four supported Indian identity document types. */
export const DOCUMENT_TYPES = ['AADHAAR', 'PASSPORT', 'DRIVING_LICENCE', 'PAN'] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const isKnownDocumentType = (t: unknown): t is DocumentType =>
  typeof t === 'string' && (DOCUMENT_TYPES as readonly string[]).includes(t);

type FieldApplicability = Partial<Record<'validityDate' | 'mothersName', boolean>>;

/**
 * Field applicability per document type. Used by rules to mark fields
 * `notApplicable` (rather than failing) when a document simply doesn't carry
 * them. Adjust here to change policy in one place (OCP).
 */
export const FIELD_APPLICABILITY: Record<DocumentType, FieldApplicability> = {
  AADHAAR: {
    validityDate: false,
    mothersName: false,
  },
  PAN: {
    validityDate: false,
    mothersName: false,
  },
  DRIVING_LICENCE: {
    validityDate: true,
    mothersName: false,
  },
  PASSPORT: {
    validityDate: true,
    mothersName: true,
  },
};

/** Whether `field` applies to `docType`. Unknown types => field applies. */
export const fieldApplies = (docType: string | null | undefined, field: string): boolean => {
  const rules = docType != null ? FIELD_APPLICABILITY[docType as DocumentType] : undefined;
  const value = rules?.[field as keyof FieldApplicability];
  if (value === undefined) {
    return true;
  }
  return value;
};

export default {
  DOCUMENT_TYPES,
  isKnownDocumentType,
  FIELD_APPLICABILITY,
  fieldApplies,
};
