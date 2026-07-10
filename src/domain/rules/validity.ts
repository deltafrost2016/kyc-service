import { parseISODate } from './dateUtils.js';
import { fieldApplies } from '../documentTypes.js';
import type { Extracted } from '../extractionSchema.js';
import type { RuleContext, RuleOutcome } from './types.js';

export const field = 'validity';

/**
 * Validity check: expiry >= today. For document types without an expiry
 * (PAN, Aadhaar) the field is not applicable and treated as a pass.
 */
export const evaluate = (
  { validityDate, documentType }: Pick<Extracted, 'validityDate' | 'documentType'>,
  { now }: RuleContext,
): RuleOutcome => {
  if (!fieldApplies(documentType, 'validityDate')) {
    return {
      notApplicable: true,
      isValid: true,
    };
  }
  const parsed = parseISODate(validityDate);
  const isValid = Boolean(parsed) && parsed! >= now;
  return {
    notApplicable: false,
    isValid,
  };
};

export default {
  field,
  evaluate,
};
