import { isKnownDocumentType } from '../documentTypes.js';
import type { RuleOutcome } from './types.js';

export const field = 'documentType';

/** Document type must be one of the four supported types. */
export const evaluate = ({ documentType }: { documentType: string | null }): RuleOutcome => ({
  isRecognized: isKnownDocumentType(documentType),
});

export default {
  field,
  evaluate,
};
