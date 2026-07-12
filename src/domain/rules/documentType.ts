import { isKnownDocumentType } from '../documentTypes';
import type { RuleOutcome } from './types';

export const field = 'documentType';

/** Document type must be one of the four supported types. */
export const evaluate = ({ documentType }: { documentType: string | null }): RuleOutcome => ({
  isRecognized: isKnownDocumentType(documentType),
});

export default {
  field,
  evaluate,
};
