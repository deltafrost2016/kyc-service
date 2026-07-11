import { fieldApplies } from './documentTypes';
import type { Extracted } from './extractionSchema';
import type { RuleResults } from './rules/types';

/**
 * Deterministic weighted confidence score in [0,100].
 *  - Completeness (40%): applicable fields that are non-null.
 *  - Rule pass rate (45%): applicable rule checks that passed.
 *  - Critical fields (15%): documentNumber present, documentType recognized, DOB valid.
 * Weights are tunable; `breakdown` records each component for explainability.
 */
const WEIGHTS: Record<string, number> = {
  completeness: 40,
  rulePassRate: 45,
  critical: 15,
};

// Fields considered for completeness; validityDate/mothersName are type-aware.
const COMPLETENESS_FIELDS: (keyof Extracted)[] = [
  'documentNumber',
  'name',
  'dateOfBirth',
  'address',
  'mothersName',
  'validityDate',
  'documentType',
];

export interface ConfidenceComponent {
  component: string;
  weight: number;
  value: number;
  contribution: number;
}

export interface Confidence {
  score: number;
  band: 'HIGH' | 'MEDIUM' | 'LOW';
  breakdown: ConfidenceComponent[];
}

const isFilled = (v: unknown): boolean => v != null && String(v).trim() !== '';

const completenessScore = (extracted: Extracted): number => {
  const applicable = COMPLETENESS_FIELDS.filter((f) => fieldApplies(extracted.documentType, f));
  if (applicable.length === 0) {
    return 1;
  }
  const filled = applicable.filter((f) => isFilled(extracted[f])).length;
  return filled / applicable.length;
};

const rulePassRate = (ruleResults: RuleResults): number => {
  const applicable = ruleResults.checks.filter((c) => c.applicable);
  if (applicable.length === 0) {
    return 1;
  }
  return applicable.filter((c) => c.passed).length / applicable.length;
};

const criticalScore = (extracted: Extracted, ruleResults: RuleResults): number => {
  const dobValid = ruleResults.results.dateOfBirth?.isValidDate === true;
  const typeOk = ruleResults.results.documentType?.isRecognized === true;
  const numberOk = isFilled(extracted.documentNumber);
  const satisfied = [numberOk, typeOk, dobValid].filter(Boolean).length;
  return satisfied / 3;
};

const bandFor = (score: number): Confidence['band'] => {
  if (score >= 80) {
    return 'HIGH';
  }
  if (score >= 50) {
    return 'MEDIUM';
  }
  return 'LOW';
};

export const scoreConfidence = (extracted: Extracted, ruleResults: RuleResults): Confidence => {
  const components: Record<string, number> = {
    completeness: completenessScore(extracted),
    rulePassRate: rulePassRate(ruleResults),
    critical: criticalScore(extracted, ruleResults),
  };

  const breakdown: ConfidenceComponent[] = Object.entries(WEIGHTS).map(([component, weight]) => ({
    component,
    weight,
    value: Number(components[component].toFixed(4)),
    contribution: Number((components[component] * weight).toFixed(2)),
  }));

  const score = Math.round(breakdown.reduce((sum, b) => sum + b.contribution, 0));

  return {
    score,
    band: bandFor(score),
    breakdown,
  };
};

export default { scoreConfidence };
