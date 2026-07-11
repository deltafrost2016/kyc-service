import type { Extracted } from '../extractionSchema';
import type { RuleOutcome } from './types';

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
