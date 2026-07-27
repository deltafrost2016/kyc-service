---
name: add-extraction-field
description: Use to add or extend a field extracted from the identity document end-to-end (a new document attribute, a new Gemini-extracted value). Triggers - "add a field to extraction", "extract a new field from the document", "add a new document attribute".
---

# Add an extraction field

`src/domain/extractionSchema.ts` keeps **two** representations of the same 6(+) fields in sync:
the zod schema that validates Gemini's output, and `geminiResponseSchema`, which constrains what
Gemini is allowed to return. Editing only one silently breaks the other half of the contract.

0. **Work inside `kyc-service/`.** Re-read `CLAUDE.md`'s "Types" note: `Extracted` is *inferred*
   from the zod schema — never hand-write a parallel interface for it.
1. **Add the field to both representations together** in `src/domain/extractionSchema.ts`:
   `extractedZodSchema` (the zod type) and `geminiResponseSchema.properties` (plus its `required`
   array). These must describe the same field or extraction validation and Gemini's structured
   output diverge.
2. **Applicability:** if the field is type-dependent (like `validityDate`/`mothersName`), add it
   to `FieldApplicability` and `FIELD_APPLICABILITY` in `src/domain/documentTypes.ts`.
3. **Decide downstream wiring:**
   - Needs its own pass/fail check? Use the **add-rule** skill.
   - Should count toward confidence scoring? `src/domain/confidence.ts` computes the completeness
     component from a fixed `COMPLETENESS_FIELDS` list — add the field there if it should count.
     Weights are per-*component* (`completeness`/`rulePassRate`/`critical`), not per-field — a new
     field never needs its own weight entry.
4. **Update fixtures.** Any `test/` fixture or mock that constructs a full `Extracted` object
   (`test/extraction.test.ts`, and anything `test/rules.test.ts` / `test/confidence.test.ts` share)
   needs the new field or it'll fail schema validation as missing-required.
5. **Delegate** schema/domain wiring to `api-implementer`; involve `db-schema-expert` only if the
   field needs persisting somewhere beyond the existing `extracted` JSON column on `analyses`/`jobs`.
6. **Verify:** `npm run typecheck` and `npm test` (use `test-runner` to report only failures).
7. **Review** with `code-reviewer` for schema-sync between the two representations, and for PII —
   a new field may be sensitive; confirm it isn't logged or persisted anywhere unexpected.
8. **Report:** field name, both schema edits, applicability change (if any), fixtures updated.

**Model:** sonnet; escalate to opus only if the field changes confidence-scoring logic
non-trivially.
