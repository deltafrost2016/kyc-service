import * as dob from './dob';
import * as validity from './validity';
import * as name from './name';
import * as motherName from './motherName';
import * as address from './address';
import * as documentType from './documentType';
import type { Extracted } from '../extractionSchema';
import type { Rule, RuleContext, RuleOutcome, RuleCheck, RuleResults } from './types';

export type { Rule, RuleContext, RuleOutcome, RuleCheck, RuleResults } from './types';

/**
 * Rule registry. Add a rule = add a module here (OCP). Each rule exports
 * `field` and `evaluate(extracted, ctx)` returning an object of boolean checks
 * (plus an optional `notApplicable` flag).
 */
const RULES: Rule[] = [dob, validity, name, motherName, address, documentType];

/** Run all rules against the extracted fields. */
export const runRules = (
  extracted: Extracted,
  { now = new Date() }: Partial<RuleContext> = {},
): RuleResults => {
  const ctx: RuleContext = { now };
  const results: Record<string, RuleOutcome> = {};
  const checks: RuleCheck[] = [];

  // eslint-disable-next-line no-restricted-syntax -- straightforward sequential accumulation
  for (const rule of RULES) {
    const outcome = rule.evaluate(extracted, ctx);
    results[rule.field] = outcome;

    const applicable = outcome.notApplicable !== true;
    // eslint-disable-next-line no-restricted-syntax -- straightforward sequential accumulation
    for (const [checkName, value] of Object.entries(outcome)) {
      if (checkName !== 'notApplicable' && typeof value === 'boolean') {
        checks.push({
          field: rule.field,
          name: checkName,
          passed: value,
          applicable,
        });
      }
    }
  }

  const passed = checks.every((c) => !c.applicable || c.passed);
  return {
    results,
    checks,
    passed,
  };
};

export default { runRules };
