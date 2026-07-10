# Document Analysis Service

Async service that analyses Indian identity documents (**UIDAI Aadhaar, Passport,
Driving Licence, PAN**). It extracts key fields with the **Gemini Vision API**, validates
them with a **rule engine**, and assigns a **confidence score** — with a **pgvector RAG
dedup** layer that skips re-processing documents it has already seen.

Written in **TypeScript** and run directly with [`tsx`](https://tsx.is) (no build step);
`npm run typecheck` type-checks with `tsc --noEmit`.

## Pipeline

Orchestrated, not choreographed: stage workers only do their unit of work and report an
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
- **Orchestrator worker**: the only component that updates job status and routes to the
  next queue (or publishes to SNS). Reacts to `JOB_CREATED` / `DEDUP_RESOLVED` /
  `EXTRACT_DONE` / `RULES_DONE` / `CONFIDENCE_DONE` events.
- **Dedup worker** (pure stage): exact SHA-256 gate, then pgvector image-embedding
  nearest-neighbor search; reports the hit/miss outcome — the orchestrator decides whether
  to skip Gemini.
- **Extract worker** (pure stage, reached only on a dedup miss): Gemini structured-output
  extraction → persists to the `analyses` RAG cache → reports completion.
- **Rules worker** (pure stage): document-type-aware validation (DOB, validity, name,
  address, mother's name, document type), re-run against **today's date** even on cache
  hits → reports the result.
- **Confidence worker** (pure stage): weighted score + band → reports the result; the
  orchestrator marks the job `DONE` and publishes to the `analysis-complete` SNS topic.

Poll `GET /jobs/:id` for status and results.

## Extracted fields

`documentNumber`, `name`, `dateOfBirth` (ISO), `address`, `mothersName`, `validityDate`
(ISO), `documentType` — `null` when absent.

> Note: the brief listed 6 extraction fields but the rules require a "name is not null"
> check, so the document holder's `name` is extracted as a 7th field to make that rule
> meaningful.

## Run locally (Docker)

```bash
cp .env.example .env         # set GEMINI_API_KEY for real extraction
docker compose up --build
```

Brings up Postgres (pgvector), LocalStack (SQS/SNS/S3, auto-provisioned), the API, the
orchestrator, and the four stage workers. Migrations run once via the `migrate` service
before the API starts.

### Try it

```bash
# Submit a document
curl -s -X POST localhost:3000/analyse \
  -H 'content-type: application/json' \
  -d '{"documentBase64":"<BASE64>","mimeType":"image/jpeg"}'
# => { "jobId": "...", "status": "QUEUED" }

# Poll for the result
curl -s localhost:3000/jobs/<jobId>
```

`status` moves `QUEUED → EXTRACTED → VALIDATED → DONE`; `source` is `FRESH`,
`CACHE_EXACT`, or `CACHE_SEMANTIC`.

## Local dev (without Docker)

```bash
npm install
# start Postgres+LocalStack via compose, or point .env at your own
npm run migrate
npm run start:api        # in separate terminals:
npm run start:orchestrator
npm run start:dedup
npm run start:extract
npm run start:rules
npm run start:confidence
```

## Tests

```bash
npm test         # vitest: rules, confidence, dedup routing, extraction/schema
npm run typecheck  # tsc --noEmit
```

## Configuration

See `.env.example`. Key settings:

| Var                               | Purpose                                                    |
| --------------------------------- | ---------------------------------------------------------- |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Google AI Studio key; default `gemini-2.5-flash`           |
| `AWS_ENDPOINT_URL`                | LocalStack endpoint; unset ⇒ real AWS                      |
| `EMBEDDING_PROVIDER`              | `hash` (local stub, default) or `vertex` (real multimodal) |
| `EMBEDDING_DIM`                   | Vector dimension (must match the migration; default 1408)  |
| `SIMILARITY_THRESHOLD`            | Cosine similarity for a semantic cache hit (default 0.95)  |

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

## Project layout

```
src/
  api/        Express app + routes (/analyse, /jobs/:id)
  workers/    orchestrator (owns routing) + dedup, extract, rules, confidence (pure stages) + shared runner
  domain/     documentTypes, extractionSchema, rules/*, confidence (pure logic)
  services/   extraction, dedup, jobService, analysisRepo
  lib/        db, sqs, sns, s3, gemini, embeddings, hash, logger (thin client seams)
migrations/   pgvector + jobs + analyses
localstack/   queue/topic/bucket provisioning
```
