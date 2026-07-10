import { parseISODate, yearsBetween } from './dateUtils.js';
import type { Extracted } from '../extractionSchema.js';
import type { RuleContext, RuleOutcome } from './types.js';

export const field = 'dateOfBirth';

/** DOB checks: presence, validity (parses, not future, sane range), adulthood. */
export const evaluate = (
  { dateOfBirth }: Pick<Extracted, 'dateOfBirth'>,
  { now }: RuleContext,
): RuleOutcome => {
  const datePresent = dateOfBirth != null && dateOfBirth !== '';
  const parsed = datePresent ? parseISODate(dateOfBirth) : null;

  const notFuture = parsed ? parsed <= now : false;
  const inSaneRange = parsed ? parsed.getUTCFullYear() >= 1900 : false;
  const isValidDate = Boolean(parsed) && notFuture && inSaneRange;

  const isAdult = isValidDate && parsed ? yearsBetween(parsed, now) >= 18 : false;

  return {
    datePresent,
    isValidDate,
    isAdult,
  };
};

export default {
  field,
  evaluate,
};
