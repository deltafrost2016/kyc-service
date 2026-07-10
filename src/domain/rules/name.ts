import type { Extracted } from '../extractionSchema.js';
import type { RuleOutcome } from './types.js';

export const field = 'name';

/** Holder name must be present (not null / non-empty). */
export const evaluate = ({ name }: Pick<Extracted, 'name'>): RuleOutcome => {
  const isPresent = name != null && String(name).trim() !== '';
  return { isPresent };
};

export default {
  field,
  evaluate,
};
