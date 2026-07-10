# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run start:api          # run one role locally (api|orchestrator|dedup|extract|rules|confidence)
npm run dev:api            # api with tsx watch (auto-reload)
npm run typecheck          # tsc --noEmit — run after non-trivial edits; tsx does NOT type-check at runtime
npm test                   # vitest run (all suites)
npm run test:watch
npx vitest run test/rules.test.ts          # single test file
npx vitest run -t "scores a complete valid document"   # single test by name
npm run migrate            # sequelize-cli db:migrate (needs Postgres; reads DATABASE_URL)
npm run migrate:undo       # sequelize-cli db:migrate:undo
npm run migrate:create -- <name>   # sequelize-cli migration:generate --name <name>
docker compose up --build  # full stack: Postgres+pgvector, LocalStack (SQS/SNS/S3), api + orchestrator + 4 stage workers, migrate
```

Tests need no external services (all seams are mocked or pure); `migrate` and the workers need Postgres/LocalStack (via `docker compose`).

## TypeScript toolchain (no build step)

- Runs directly via **`tsx`** — a _runtime_ dependency (not dev), so it ships in the Docker image. There is no `dist/`; do not add a build step.
- **NodeNext ESM**: every import specifier keeps a `.js` extension even though the file is `.ts` (e.g. `import { x } from './foo.js'` resolves to `foo.ts`). Preserve this when adding imports.
- `tsx` skips type errors at runtime — always run `npm run typecheck` to catch them. vitest transpiles TS natively.
- Migrations are run through **`sequelize-cli`** (`.sequelizerc` + `config/sequelize-cli.cjs`), not tsx — there are no custom migration scripts. `src/database/migrations/` carries its own `package.json` with `"type": "commonjs"` so the plain `.js` migration files sequelize-cli generates (`module.exports = { up(queryInterface), down(queryInterface) }`) load correctly via `require()` despite the root project being `"type": "module"`. `config/sequelize-cli.cjs` uses `use_env_variable: 'DATABASE_URL'` so the connection string stays the single source of truth from `.env` / `src/config/index.ts`.

## Architecture

An **async, SQS-decoupled, orchestrator-routed pipeline** that analyses Indian ID documents. One codebase runs as six roles from a single entrypoint (`src/index.ts`, role = first CLI arg): the `api`, the `orchestrator`, and four **stage workers** (`dedup`, `extract`, `rules`, `confidence`). `docker compose` runs each as its own container from one image.

This is **orchestration, not choreography**: the stage workers never decide what runs next or touch job state — each one does its unit of work and reports an outcome event to the orchestrator. The `orchestrator` worker is the single place that owns the `jobs` state machine and decides which queue to invoke next. All routing logic lives in one file (`workers/orchestratorWorker.ts`) instead of being scattered across each stage worker.

**Request flow** (each `→` is an SQS queue; only the orchestrator decides where an event goes next):

```
POST /analyse → orchestrator-queue ⇄ dedup-queue
                       ⇅          ⇄ analyse-queue    (Gemini extraction)
                       ⇅          ⇄ rules-queue       (validation)
                       ⇅          ⇄ confidence-queue  (score) → SNS
  (202 jobId)
```

- **API** (`src/api/`) stages raw base64 in S3, creates a `jobs` row, publishes a `JOB_CREATED` event to `orchestrator-queue`, returns `202 {jobId}`. Poll `GET /jobs/:id`. No inline processing.
- **orchestrator worker** (`workers/orchestratorWorker.ts`) — reads `OrchestratorEvent`s (`src/types.ts`) and is the *only* place that calls `updateJob`/`failJob` for stage transitions and `sendMessage` to route to the next stage queue (or `publish` to SNS on completion). Adding, reordering, or branching a pipeline stage means editing this one switch statement, not hunting through worker files.
- **dedup worker** — pure stage: two-tier cache in `services/dedupService.ts` (exact SHA-256 gate, then pgvector cosine nearest-neighbor, threshold `SIMILARITY_THRESHOLD`). A *semantic* hit also upserts the new hash into the `analyses` RAG knowledge base (pointing at the matched extraction) so a byte-identical resubmission of that document hits the exact gate next time instead of paying for another vector search. Reports `DEDUP_RESOLVED` (hit or miss, with the embedding on a miss) to the orchestrator — it does not decide whether to skip Gemini itself.
- **extract worker** — pure stage: Gemini structured-output extraction (`services/extractionService.ts`), upserts into the `analyses` RAG knowledge base so future docs can reuse it, reports `EXTRACT_DONE`.
- **rules worker** — pure stage: runs the rule engine against **today's date** (re-run even on cache hits, so time-sensitive checks stay correct), reports `RULES_DONE`.
- **confidence worker** — pure stage: computes the weighted score + band, reports `CONFIDENCE_DONE` (the orchestrator marks the job `DONE` and publishes to SNS, not this worker).

### Key structural patterns

- **Orchestrator events** (`OrchestratorEvent` in `src/types.ts`): a discriminated union (`JOB_CREATED` / `DEDUP_RESOLVED` / `EXTRACT_DONE` / `RULES_DONE` / `CONFIDENCE_DONE`) carrying everything the orchestrator needs to act — stage workers never re-fetch job state to report an outcome.
- **Worker runner** (`workers/runner.ts`): the _only_ place with SQS long-poll/delete/DLQ boilerplate and graceful shutdown. Each worker (including the orchestrator) is just a typed `handler(body)`. On handler error the message is left in-flight (→ redrive/DLQ) and the handler marks the job `FAILED` via `failJob` — this still happens locally in each stage worker (and in the orchestrator for its own routing failures), not centrally, so a failure is recorded even if the orchestrator itself is unreachable.
- **Rule registry** (`domain/rules/index.ts`): each rule is a module exporting `field` + `evaluate(extracted, ctx): RuleOutcome` (named boolean checks, optional `notApplicable`). Add a rule = add a module to the `RULES` array (OCP). `runRules` flattens outcomes into `checks[]` and an overall `passed`.
- **Type-aware applicability** (`domain/documentTypes.ts`): `FIELD_APPLICABILITY` decides whether a field (e.g. expiry, mother's name) applies per document type. Inapplicable checks are marked `notApplicable` and treated as a pass, not a failure — flip this one table to change policy.
- **Embedding seam** (`lib/embeddings.ts`): `EMBEDDING_PROVIDER` = `hash` (deterministic local stub, default, **not semantic**) or `vertex` (real multimodal). Only this file changes to swap providers. `EMBEDDING_DIM` **must match** the vector column in the migration.
- **`lib/` = thin client seams** (db, s3, sqs, sns, gemini, embeddings, hash, logger). Domain/service code depends on these, never on the SDKs directly — this is what makes them mockable in tests.
- **`database/`** (`src/database/`): `models/` holds Sequelize model definitions (`Analysis`, `Job`); `repositories/` holds all model queries (`analysisRepository.ts`, `jobRepository.ts`) — services and workers call these, never the models directly; `migrations/` holds `sequelize-cli` migrations (see toolchain note above).
- **Config** (`config/index.ts`): a single zod-validated object parsed from `process.env`. Never read `process.env` elsewhere. Tests seed required env in `test/setup.ts`.

### Types

- `Extracted` is **inferred** from the zod schema (`domain/extractionSchema.ts`) — the schema is the source of truth; don't hand-write a parallel interface.
- Shared cross-cutting types: `src/types.ts` (DB row shapes `JobRow`/`AnalysisRow`, queue message shapes, the `OrchestratorEvent` union) and `src/domain/rules/types.ts` (rule contracts).
- `extractionSchema.ts` keeps **two** representations in sync: the zod schema (validates model output) and `geminiResponseSchema` (constrains Gemini's JSON output). Change both together.

### Data & PII

- Postgres has two tables (`src/database/migrations/`): `analyses` (persistent RAG cache: hash + embedding + extracted fields, **never the image**) and `jobs` (per-request lifecycle). Rule/score results live only on `jobs` because they're time-sensitive.
- The raw document is staged in S3 only transiently and deleted right after dedup/extraction — it is never written to Postgres.

## Claude Code subagents (`.claude/agents/`)

Specialist subagents for this repo, each scoped to one concern:

- **task-orchestrator** — coordinates the others for any multi-concern task (e.g. "add a rule end-to-end"); decomposes the work and delegates each step rather than editing code itself. Use this for anything that isn't a single-specialist request.
- **backend-architect** — read-only design advisor for placement/module-boundary decisions before code is written.
- **db-schema-expert** — Postgres schema, migrations, models, indexing (`src/database/`).
- **api-implementer** — route handlers, worker handlers, services, domain/rule logic.
- **code-reviewer** — read-only review after implementation (PII/security, config discipline, layering, ESM imports, schema sync).
- **test-runner** — runs `vitest`, reports only failures.

Trigger a specialist directly for single-concern work; trigger `task-orchestrator` when a task spans more than one of these.
