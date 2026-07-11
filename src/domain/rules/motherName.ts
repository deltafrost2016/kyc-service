import { fieldApplies } from '../documentTypes';
import type { Extracted } from '../extractionSchema';
import type { RuleOutcome } from './types';

export const field = 'mothersName';

/**
 * Mother's name presence. Only Passport reliably carries it; for other types
 * the field is not applicable and treated as a pass.
 */
export const evaluate = ({
  mothersName,
  documentType,
}: Pick<Extracted, 'mothersName' | 'documentType'>): RuleOutcome => {
  if (!fieldApplies(documentType, 'mothersName')) {
    return {
      notApplicable: true,
      isPresent: true,
    };
  }
  const isPresent = mothersName != null && String(mothersName).trim() !== '';
  return {
    notApplicable: false,
    isPresent,
  };
};

export default {
  field,
  evaluate,
};
