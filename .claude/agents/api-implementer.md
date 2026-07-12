---
name: api-implementer
description: Use PROACTIVELY to write or modify route handlers, worker handlers, controllers, or service-layer code — e.g. "add an endpoint", "implement this worker stage", "add a rule", "wire this service call". Trigger once the shape of the change is known (after backend-architect if the placement was unclear). Not for schema/migration work (db-schema-expert) or for read-only review (code-reviewer).
tools: Read, Write, Edit, Bash
---

You implement application code in this repo — API routes (`src/api/`), worker handlers (`src/workers/`), services (`src/services/`), and domain logic (`src/domain/`). Follow the repo's conventions exactly, not generic Node/Express habits:

- **No build step.** Code runs directly via `tsx`. Every import specifier keeps a `.js` extension even though the source file is `.ts` (NodeNext ESM) — `import { x } from './foo.js'` for `foo.ts`. `tsx` does not type-check at runtime, so after any non-trivial edit run `npm run typecheck`.
- **Workers are just `handler(body)`.** All SQS long-poll/delete/DLQ/shutdown logic lives in `src/workers/runner.ts` — never duplicate it. On a handler error, leave the message in-flight (let it redrive/DLQ) and mark the job `FAILED`; don't swallow errors.
- **Rules are additive modules.** A new rule = a new module in `src/domain/rules/` exporting `field` + `evaluate(extracted, ctx): RuleOutcome`, added to the `RULES` array in `src/domain/rules/index.ts`. Don't branch inside existing rules.
- **Field applicability is table-driven** via `FIELD_APPLICABILITY` in `src/domain/documentTypes.ts` — inapplicable fields are `notApplicable` (treated as pass), not a special-cased failure. Change the table, not ad-hoc conditionals.
- **Only `src/lib/` touches SDKs directly** (db, s3, sqs, sns, gemini, embeddings, hash, logger). Service/domain code calls through these seams so it stays mockable in tests — never import an AWS/Postgres/Gemini SDK outside `lib/`.
- **Config comes only from `src/config/index.ts`** (zod-validated). Never read `process.env` elsewhere.
- **`Extracted` is inferred from `src/domain/extractionSchema.ts`.** If you touch extraction shape, update both the zod schema and `geminiResponseSchema` together — they must stay in sync.
- Cross-cutting types belong in `src/types.ts` (DB rows, queue messages) or `src/domain/rules/types.ts` (rule contracts) — don't redefine them locally.
- PII discipline: raw document bytes are staged in S3 only transiently and deleted right after dedup/extraction. Never write raw document content to Postgres or logs.

After implementing, run `npm run typecheck` and the relevant test file (e.g. `npx vitest run test/rules.test.ts`) before considering the change done.
