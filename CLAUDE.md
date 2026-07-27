# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run typecheck          # tsc --noEmit — run after non-trivial edits; tsx does NOT type-check at runtime
npm test                   # vitest run (all suites)
npm run test:watch
npx vitest run test/rules.test.ts          # single test file
npx vitest run -t "scores a complete valid document"   # single test by name
npm run migrate            # sequelize-cli db:migrate (needs Postgres; reads DATABASE_URL)
npm run migrate:undo       # sequelize-cli db:migrate:undo
npm run migrate:create -- <name>   # sequelize-cli migration:generate --name <name>
docker compose up --build  # backing services only: Postgres+pgvector, LocalStack (SQS/SNS/S3) — Lambda compute runs via SAM local, not docker-compose

npm run sam:build          # sam build — bundles all 6 Lambda functions via esbuild (see template.yaml)
npm run sam:local:api      # sam local start-api — run the api Lambda locally against API Gateway HTTP API v2 semantics
npm run sam:local:invoke:dedup   # example: sam local invoke DedupFunction -e events/dedup-sample.json
# same pattern for the other roles, e.g.:
sam local invoke OrchestratorFunction -e events/<sample>.json --docker-network kyc-service_default --env-vars env.json
```

Tests need no external services (all seams are mocked or pure). `docker compose up` (Postgres/LocalStack) must be running before `sam local invoke`/`sam local start-api` — those SAM commands join the compose network via `--docker-network kyc-service_default` and read LocalStack-pointing env vars from `env.json` (via `--env-vars env.json`). Run `npm run migrate` from the host against `DATABASE_URL=...@localhost:5432/...` to apply the schema — there is no dedicated migration container/Dockerfile; production migrations run as a step in the GitHub Actions deployment workflow (`.github/workflows/deploy.yml`), *after* `sam deploy` since the RDS instance doesn't exist yet on a first-ever deploy. `template.yaml` + `env.json` are **local-dev tooling only** (LocalStack, not deployed anywhere); the real production IaC is `infra/template.yaml`, deployed by `deploy.yml` via `sam deploy` on every push to `main`. Postgres in production is RDS (`db.t3.micro`, free tier, pgvector-capable at engine 15.2+), deliberately **publicly accessible with Lambda staying VPC-less** — Lambda-in-a-VPC can't reach the public Gemini API without a NAT Gateway (~$32/month), so this stack trades DB network isolation for staying inside the free tier; see the disclaimer at the top of `infra/template.yaml`.

## TypeScript toolchain

- No build step for day-to-day dev/tests: vitest transpiles TS natively, and `npm run typecheck` (`tsc --noEmit`) is the only type-checking pass — TS itself never emits JS in this repo. `tsx` is a leftover dependency from the pre-Lambda entrypoint and is no longer invoked by any script; don't rely on it.
- `npm run sam:build` **is** a real build step, but scoped to packaging: it runs `sam build` (esbuild, per `template.yaml`'s `BuildMethod: esbuild`) to bundle each `src/lambda/*Handler.ts` into a `.mjs` file for `sam local`/deployment. Output goes to `.aws-sam/` (gitignored), never committed — don't add a project-wide `dist/`.
- **NodeNext ESM**: every import specifier keeps a `.js` extension even though the file is `.ts` (e.g. `import { x } from './foo.js'` resolves to `foo.ts`). Preserve this when adding imports.
- Migrations are run through **`sequelize-cli`** (`.sequelizerc` + `config/sequelize-cli.cjs`), not tsx — there are no custom migration scripts. `src/database/migrations/` carries its own `package.json` with `"type": "commonjs"` so the plain `.js` migration files sequelize-cli generates (`module.exports = { up(queryInterface), down(queryInterface) }`) load correctly via `require()` despite the root project being `"type": "module"`. `config/sequelize-cli.cjs` uses `use_env_variable: 'DATABASE_URL'` so the connection string stays the single source of truth from `.env` / `src/config/index.ts`.

## Architecture

An **async, SQS-decoupled, orchestrator-routed pipeline** that analyses Indian ID documents. One codebase, **six independent AWS Lambda functions** (`src/lambda/*Handler.ts`): the `api`, the `orchestrator`, and four **stage workers** (`dedup`, `extract`, `rules`, `confidence`). Each is packaged/deployed separately — zip + esbuild bundling, not a shared container image. API Gateway (HTTP API) invokes the api Lambda instead of an Express `app.listen()`; SQS event source mappings invoke each worker Lambda directly instead of a long-poll loop. Locally, `template.yaml` (AWS SAM, local-dev tooling only — see disclaimer at its top) drives `sam build`/`sam local invoke`/`sam local start-api` against the same handlers. Production deploys use the separate `infra/template.yaml` via `.github/workflows/deploy.yml`.

This is **orchestration, not choreography**: the stage workers never decide what runs next or touch job state — each one does its unit of work and reports an outcome event to the orchestrator. The `orchestrator` Lambda is the single place that owns the `jobs` state machine and decides which queue to invoke next. All routing logic lives in one file (`workers/orchestratorWorker.ts`) instead of being scattered across each stage worker.

**Request flow** (each `→` is an SQS queue; only the orchestrator decides where an event goes next):

```
POST /analyse → orchestrator-queue ⇄ dedup-queue
                       ⇅          ⇄ analyse-queue    (Gemini extraction)
                       ⇅          ⇄ rules-queue       (validation)
                       ⇅          ⇄ confidence-queue  (score) → SNS
  (202 jobId)
```

- **API** (`src/api/` via `src/lambda/apiHandler.ts`) stages raw base64 in S3, creates a `jobs` row, publishes a `JOB_CREATED` event to `orchestrator-queue`, returns `202 {jobId}`. Poll `GET /jobs/:id`. No inline processing. `src/api/server.ts`'s `createApp(): Express` is unchanged and still what the existing route tests exercise; `apiHandler.ts` just wraps it with `@codegenie/serverless-express` for API Gateway HTTP API v2 proxy events.
- **orchestrator worker** (`workers/orchestratorWorker.ts`, invoked via `src/lambda/orchestratorHandler.ts`) — reads `OrchestratorEvent`s (`src/types.ts`) and is the *only* place that calls `updateJob`/`failJob` for stage transitions and `sendMessage` to route to the next stage queue (or `publish` to SNS on completion). Adding, reordering, or branching a pipeline stage means editing this one switch statement, not hunting through worker files.
- **dedup worker** — pure stage: two-tier cache in `services/dedupService.ts` (exact SHA-256 gate, then pgvector cosine nearest-neighbor, threshold `SIMILARITY_THRESHOLD`). A *semantic* hit also upserts the new hash into the `analyses` RAG knowledge base (pointing at the matched extraction) so a byte-identical resubmission of that document hits the exact gate next time instead of paying for another vector search. Reports `DEDUP_RESOLVED` (hit or miss, with the embedding on a miss) to the orchestrator — it does not decide whether to skip Gemini itself.
- **extract worker** — pure stage: Gemini structured-output extraction (`services/extractionService.ts`), upserts into the `analyses` RAG knowledge base so future docs can reuse it, reports `EXTRACT_DONE`.
- **rules worker** — pure stage: runs the rule engine against **today's date** (re-run even on cache hits, so time-sensitive checks stay correct), reports `RULES_DONE`.
- **confidence worker** — pure stage: computes the weighted score + band, reports `CONFIDENCE_DONE` (the orchestrator marks the job `DONE` and publishes to SNS, not this worker).

Each worker's core `handle(body)` function (in `workers/{dedup,extract,rules,confidence,orchestrator}Worker.ts`) is unchanged business logic — it is exported and invoked by a thin Lambda adapter (`src/lambda/*Handler.ts`) instead of the old `runWorker` poll loop.

### Key structural patterns

- **Orchestrator events** (`OrchestratorEvent` in `src/types.ts`): a discriminated union (`JOB_CREATED` / `DEDUP_RESOLVED` / `EXTRACT_DONE` / `RULES_DONE` / `CONFIDENCE_DONE`) carrying everything the orchestrator needs to act — stage workers never re-fetch job state to report an outcome.
- **SQS batch handler adapter** (`src/lambda/sqsBatchHandler.ts`): the new shared seam, parallel in role to the now-deleted `workers/runner.ts`. `createSqsBatchHandler(handle)` wraps a stage worker's pure `handle(body)` for direct invocation by an SQS event source mapping. `handle` already owns its own error handling (calls `failJob` internally, then rethrows); the adapter's only job is to translate a caught error into a `batchItemFailures` entry (`{ itemIdentifier: record.messageId }`) so SQS's own `maxReceiveCount`/redrive-to-DLQ policy on each queue takes over — this replaces the old "leave the message in flight on error" behaviour, and partial-batch failure reporting (`batchItemFailures`) is the new mechanism for reporting which records failed without failing the whole batch. Records are processed sequentially, same rationale as the old runner: simple, ordering-friendly.
- **Rule registry** (`domain/rules/index.ts`): each rule is a module exporting `field` + `evaluate(extracted, ctx): RuleOutcome` (named boolean checks, optional `notApplicable`). Add a rule = add a module to the `RULES` array (OCP). `runRules` flattens outcomes into `checks[]` and an overall `passed`.
- **Type-aware applicability** (`domain/documentTypes.ts`): `FIELD_APPLICABILITY` decides whether a field (e.g. expiry, mother's name) applies per document type. Inapplicable checks are marked `notApplicable` and treated as a pass, not a failure — flip this one table to change policy.
- **Embedding seam** (`lib/embeddings.ts`): `EMBEDDING_PROVIDER` = `hash` (deterministic local stub, default, **not semantic**) or `vertex` (real multimodal). Only this file changes to swap providers. `EMBEDDING_DIM` **must match** the vector column in the migration.
- **LLM extraction seam** (`lib/llm/`): class-based provider substitution — `LlmProvider` (`lib/llm/LlmProvider.ts`) is the abstract base with a single `generateJson({ prompt, image, responseSchema })` method; `lib/llm/providers/{Gemini,Claude,OpenAi,Ollama}Provider.ts` each implement it against their own SDK/API. `lib/llm/index.ts` picks the concrete class via `config.LLM_PROVIDER` (`gemini` default, or `claude`/`openai`/`ollama`) and re-exports a `generateJson` function as the stable seam `extractionService.ts` calls — swapping providers is an env var, not a code change. Non-Gemini providers convert the Gemini-flavored `geminiResponseSchema` (OpenAPI-subset, uppercase types) to a standard JSON Schema via `lib/llm/schemaUtil.ts`.
- **`lib/` = thin client seams** (db, s3, sqs, sns, llm, embeddings, hash, logger). Domain/service code depends on these, never on the SDKs directly — this is what makes them mockable in tests.
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
