import type { Extracted } from '../extractionSchema.js';
import type { RuleOutcome } from './types.js';

export const field = 'address';

// Indian states + union territories (lowercased) for a light validity heuristic.
const STATES_UTS = [
  'andhra pradesh',
  'arunachal pradesh',
  'assam',
  'bihar',
  'chhattisgarh',
  'goa',
  'gujarat',
  'haryana',
  'himachal pradesh',
  'jharkhand',
  'karnataka',
  'kerala',
  'madhya pradesh',
  'maharashtra',
  'manipur',
  'meghalaya',
  'mizoram',
  'nagaland',
  'odisha',
  'punjab',
  'rajasthan',
  'sikkim',
  'tamil nadu',
  'telangana',
  'tripura',
  'uttar pradesh',
  'uttarakhand',
  'west bengal',
  'andaman and nicobar islands',
  'chandigarh',
  'dadra and nagar haveli and daman and diu',
  'delhi',
  'jammu and kashmir',
  'ladakh',
  'lakshadweep',
  'puducherry',
];

const PIN_RE = /\b[1-9]\d{5}\b/; // Indian PIN: 6 digits, not starting with 0

/**
 * Address checks: presence + a heuristic "looks like a valid Indian address"
 * (has a 6-digit PIN, mentions a state/UT, and has enough tokens). Heuristic,
 * not authoritative — isolated so it can be swapped for a real geo/PIN dataset.
 */
export const evaluate = ({ address }: Pick<Extracted, 'address'>): RuleOutcome => {
  const isPresent = address != null && String(address).trim() !== '';
  if (!isPresent) {
    return {
      isPresent: false,
      isValidIndianAddress: false,
    };
  }

  const text = String(address).toLowerCase();
  const hasPin = PIN_RE.test(address);
  const hasState = STATES_UTS.some((s) => text.includes(s));
  const enoughTokens = text.split(/[\s,]+/).filter(Boolean).length >= 3;

  const isValidIndianAddress = hasPin && hasState && enoughTokens;
  return {
    isPresent: true,
    isValidIndianAddress,
  };
};

export default {
  field,
  evaluate,
};
