---
name: add-rule
description: Use to add a new validation rule to the KYC rule registry end-to-end (a new field check, a new document-level check). Triggers - "add a rule", "add a validation check", "new field check".
---

# Add a validation rule

The rule registry (`src/domain/rules/index.ts`) is built for OCP extension: adding a rule should
never require touching `runRules` itself, only adding a module and registering it.

0. **Work inside `kyc-service/`.** Re-read `CLAUDE.md`'s "Rule registry" and "Type-aware
   applicability" notes.
1. **Create `src/domain/rules/<field>.ts`** exporting `field` and
   `evaluate(extracted, ctx): RuleOutcome` — a pure function returning named boolean checks.
   Mirror `src/domain/rules/dob.ts`'s shape: destructure only the fields it needs from `Extracted`,
   no side effects, no DB/network calls.
2. **Handle type-dependent applicability in the data, not the function.** If the field doesn't
   apply to every document type, don't special-case it inside `evaluate` — set the policy in
   `FIELD_APPLICABILITY` in `src/domain/documentTypes.ts` and have the rule return
   `notApplicable: true` when `!fieldApplies(docType, field)`, same as the existing rules do.
3. **Register the module** in the `RULES` array in `src/domain/rules/index.ts` (import + add to
   the array). This is the only wiring step — nothing else references individual rules by name.
4. **Add unit tests** under `test/rules.test.ts`, following its existing per-rule case pattern:
   applicable pass, applicable fail, and (if relevant) the notApplicable path.
5. **Delegate the write** to `api-implementer` if you're not writing it directly; run
   `test-runner` after.
6. **Verify:** `npm run typecheck` and `npx vitest run test/rules.test.ts`.
7. **Report:** rule field name, file added, applicability change (if any), test cases added.

**Model:** sonnet.
