# Document Analysis Service (kyc-service)

Async service that analyses Indian identity documents (**UIDAI Aadhaar, Passport,
Driving Licence, PAN**). It extracts key fields with the **Gemini Vision API**, validates
them with a **rule engine**, and assigns a **confidence score** — with a **pgvector RAG
dedup** layer that skips re-processing documents it has already seen.

Written in **TypeScript**, run directly with [`tsx`](https://tsx.is) for local dev (no
build step); `npm run typecheck` type-checks with `tsc --noEmit`. For local end-to-end
testing the compute layer runs as **AWS Lambda functions** via the **AWS SAM CLI**
(`sam local`), backed by Postgres + LocalStack (SQS/SNS/S3) from `docker compose`.

## Pipeline

Orchestrated, not choreographed: stage Lambdas only do their unit of work and report an
outcome event — the **orchestrator** is the single place that owns job state and decides
which stage runs next.

```
POST /analyse ──► orchestrator-queue ⇄ dedup-queue        (hash + RAG)
       (202 jobId)        ⇅         ⇄ analyse-queue       (Gemini, miss only)
                           ⇅         ⇄ rules-queue         (validation)
                           ⇅         ⇄ confidence-queue    (score) ──► SNS
```

- **API** (`POST /analyse`): validates base64 input, `sha256`-hashes it, stages the raw
  bytes in S3, creates a job, publishes a `JOB_CREATED` event to `orchestrator-queue`,
  returns `202 { jobId }`.
- **Orchestrator**: the only component that updates job status and routes to the next
  queue (or publishes to SNS). Reacts to `JOB_CREATED` / `DEDUP_RESOLVED` / `EXTRACT_DONE`
  / `RULES_DONE` / `CONFIDENCE_DONE` events.
- **Dedup** (pure stage): exact SHA-256 gate, then pgvector image-embedding
  nearest-neighbor search; reports the hit/miss outcome — the orchestrator decides whether
  to skip Gemini.
- **Extract** (pure stage, reached only on a dedup miss): Gemini structured-output
  extraction → persists to the `analyses` RAG cache → reports completion.
- **Rules** (pure stage): document-type-aware validation (DOB, validity, name, address,
  mother's name, document type), re-run against **today's date** even on cache hits →
  reports the result.
- **Confidence** (pure stage): weighted score + band → reports the result; the
  orchestrator marks the job `DONE` and publishes to the `analysis-complete` SNS topic.

Poll `GET /jobs/:id` for status and results.

Each stage is both a plain handler function (`src/workers/*Worker.ts`, unit-testable with
no AWS SDK involved) and a thin Lambda entrypoint that adapts it to the Lambda event shape
(`src/lambda/*Handler.ts`). `template.yaml` wires those six Lambdas to their HTTP/SQS
triggers for local dev only — it is **not** the production deployment artifact; that IaC
lives elsewhere.

## Extracted fields

`documentNumber`, `name`, `dateOfBirth` (ISO), `address`, `mothersName`, `validityDate`
(ISO), `documentType` — `null` when absent.

## Prerequisites

Install these on Mac, Windows, or Linux — the rest of the setup is identical across all
three once they're in place:

| Tool                                                                           | Why                                                                        | Install                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Node.js 20+**                                                                | runtime for the app and tests                                              | [nodejs.org](https://nodejs.org) or a version manager (`nvm`, `fnm`, `volta`)                                                                                                                                                                      |
| **Docker Desktop** (Mac/Windows) or **Docker Engine + Compose plugin** (Linux) | runs Postgres (pgvector) + LocalStack                                      | [docs.docker.com/get-docker](https://docs.docker.com/get-docker/)                                                                                                                                                                                  |
| **AWS SAM CLI**                                                                | runs the Lambda handlers locally against LocalStack for end-to-end testing | [SAM CLI install guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) — macOS: `brew install aws-sam-cli`; Windows: the `.msi` installer from that guide; Linux: the guide's install script |
| **git**                                                                        | clone the repo                                                             | —                                                                                                                                                                                                                                                  |

Notes:

- Windows: run everything below from **PowerShell**, **Git Bash**, or **WSL2** — all work.
  If using WSL2, install Docker Desktop with the WSL2 backend and run the commands inside
  your WSL distro.
- You only need SAM CLI if you want to exercise the API/workers end-to-end. Running
  `npm test` / `npm run typecheck` needs nothing beyond Node — no Docker, no SAM.

## Setup

```bash
git clone <repo-url>
cd kyc-service
npm install
cp .env.example .env        # local defaults are fine; set GEMINI_API_KEY for real extraction
```

`.env` is used by `npm test`/`npm run typecheck` tooling and as the reference for the
values baked into `env.json` (used by `sam local`, see below) — it is not read directly
by the Lambda handlers when they run under SAM.

### Run the backing services

```bash
docker compose up postgres localstack
npm run migrate
```

`docker compose up` starts Postgres (pgvector) and LocalStack (SQS/SNS/S3, auto-provisioned
queues/topic/bucket via `localstack/init-resources.sh`) — leave it running in a terminal (or
add `-d` to detach). `npm run migrate` then applies the schema from the host, against
`DATABASE_URL=...@localhost:5432/...` in your `.env`. There's no dedicated migration
container for this — production migrations run as part of the GitHub Actions deployment
workflow instead.

### Run the app (API + workers) via SAM local

In another terminal, from the repo root:

```bash
npm run sam:build
npm run sam:local:api
```

`sam:local:api` starts a local API Gateway on `http://localhost:3000` backed by the
`ApiFunction` Lambda, joined to the `docker compose` network so it can reach Postgres and
LocalStack by their container hostnames (`postgres`, `localstack`) — see `env.json`. The
SQS-triggered stage Lambdas (`orchestrator`, `dedup`, `extract`, `rules`, `confidence`)
aren't polled automatically by `sam local start-api`; invoke a specific one directly to
step through the pipeline, e.g.:

```bash
npm run sam:local:invoke:dedup
```

(uses the sample event in `events/dedup-sample.json`). Add similar `sam local invoke
<FunctionName> --docker-network kyc-service_default --env-vars env.json -e <event.json>`
invocations for the other stages as needed — see `template.yaml` for the function names.

### Try it

```bash
curl -s -X POST localhost:3000/analyse \
  -H 'content-type: application/json' \
  -d '{"documentBase64":"<BASE64>","mimeType":"image/jpeg"}'
# => { "jobId": "...", "status": "QUEUED" }

curl -s localhost:3000/jobs/<jobId>
```

`status` moves `QUEUED → EXTRACTED → VALIDATED → DONE`; `source` is `FRESH`,
`CACHE_EXACT`, or `CACHE_SEMANTIC`.

### Tear down

```bash
docker compose down          # add -v to also drop the Postgres volume
```

## Tests

```bash
npm test              # vitest: rules, confidence, dedup routing, extraction/schema, Lambda adapters
npm run test:watch
npx vitest run test/rules.test.ts                        # single file
npx vitest run -t "scores a complete valid document"     # single test by name
npm run typecheck      # tsc --noEmit — tsx does not type-check at runtime, run this after edits
```

Tests need no external services — all seams (db, SQS, SNS, S3, Gemini, embeddings) are
mocked or pure, so `npm test` and `npm run typecheck` work with just `npm install`, no
Docker or SAM required.

## Configuration

See `.env.example` (and `env.json` for the SAM-local equivalents). Key settings:

| Var                               | Purpose                                                    |
| --------------------------------- | ---------------------------------------------------------- |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Google AI Studio key; default `gemma-4-31b-it`             |
| `AWS_ENDPOINT_URL`                | LocalStack endpoint; unset ⇒ real AWS                      |
| `EMBEDDING_PROVIDER`              | `hash` (local stub, default) or `vertex` (real multimodal) |
| `EMBEDDING_DIM`                   | Vector dimension (must match the migration; default 1408)  |
| `SIMILARITY_THRESHOLD`            | Cosine similarity for a semantic cache hit (default 0.95)  |

All config is parsed once through a zod schema in `src/config/index.ts` — never read
`process.env` elsewhere in the app code.

## Migrations

```bash
npm run migrate              # sequelize-cli db:migrate — needs Postgres reachable via DATABASE_URL
npm run migrate:undo
npm run migrate:create -- <name>
```

Run these from the host against the `docker compose` Postgres
(`DATABASE_URL=postgres://postgres:postgres@localhost:5432/docanalysis` from your `.env`)
after `docker compose up postgres localstack`. In CI/CD, migrations run as a step in the
GitHub Actions deployment workflow rather than a dedicated Docker image.

## Design notes / assumptions

1. **Type-aware rules.** PAN & Aadhaar have no expiry; mother's name appears reliably only
   on passports. Those checks are marked `notApplicable` (not failed) for documents that
   don't carry the field. Flip `FIELD_APPLICABILITY` in `src/domain/documentTypes.ts` for
   strict "must not be null regardless of type".
2. **Indian address validation is heuristic** (PIN + state/UT + token count), isolated in
   `src/domain/rules/address.ts` so it can be swapped for a real PIN/geo dataset.
3. **Embeddings.** Default `hash` provider is a deterministic local stub — identical images
   match exactly but it is **not semantically meaningful**. Set `EMBEDDING_PROVIDER=vertex`
   (Vertex AI `multimodalembedding@001`, needs GCP creds; `google-auth-library` is already a
   dependency) for real re-scan/re-photo similarity. Only `src/lib/embeddings.ts` changes.
4. **PII.** The raw document is staged in S3 only transiently and deleted after use; it is
   never written to Postgres. `analyses` stores extracted fields + embedding + hash, never
   the image or the (time-sensitive) rule/score results.
5. **No auth** on the API in v1 — intended to sit behind a gateway.
6. **`template.yaml` / `sam local` are local-dev-only.** They exist so the six Lambda
   handlers can be exercised end-to-end on a laptop; the production deployment IaC (and
   build/packaging pipeline) is owned elsewhere.

## Project layout

```
src/
  api/          Express app + routes (/analyse, /jobs/:id), wrapped for Lambda via @codegenie/serverless-express
  lambda/       thin Lambda entrypoints (apiHandler, orchestratorHandler, dedupHandler, extractHandler, rulesHandler, confidenceHandler) + sqsBatchHandler adapter
  workers/      plain handler functions the Lambda entrypoints wrap: orchestratorWorker (owns routing) + dedup/extract/rules/confidenceWorker (pure stages)
  domain/       documentTypes, extractionSchema, rules/*, confidence (pure logic)
  services/     extraction, dedup, jobService, analysisRepo
  database/     models/ (Sequelize), repositories/ (all queries), migrations/ (sequelize-cli)
  lib/          db, sqs, sns, s3, gemini, embeddings, hash, logger (thin client seams)
  config/       zod-validated env config (single source of truth)
template.yaml   local-dev-only SAM template wiring the six Lambdas to HTTP/SQS triggers
env.json        env vars for `sam local`, mirroring .env.example
localstack/     queue/topic/bucket provisioning script (init-resources.sh)
events/         sample SQS event payloads for `sam local invoke`
```
