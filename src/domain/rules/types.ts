import type { Extracted } from '../extractionSchema';

/** Context passed to every rule (currently just the reference "now"). */
export interface RuleContext {
  now: Date;
}

/**
 * A rule's output: a set of named boolean checks, plus an optional
 * `notApplicable` flag marking the whole rule as not-applicable for this doc.
 */
export interface RuleOutcome {
  notApplicable?: boolean;
  [check: string]: boolean | undefined;
}

/** A rule module: the field it covers and its pure evaluation function. */
export interface Rule {
  field: string;
  evaluate: (extracted: Extracted, ctx: RuleContext) => RuleOutcome;
}

/** One flattened check extracted from a rule outcome. */
export interface RuleCheck {
  field: string;
  name: string;
  passed: boolean;
  applicable: boolean;
}

/** Aggregate result of running all rules. */
export interface RuleResults {
  results: Record<string, RuleOutcome>;
  checks: RuleCheck[];
  passed: boolean;
}
