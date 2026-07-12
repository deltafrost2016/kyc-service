# Driving the pipeline by hand (local dev)

`sam local` does **not** emulate SQS event source mappings, so nothing drains the
LocalStack queues on its own — a job created via `POST /analyse` lands in
`orchestrator-queue` and stays `QUEUED` forever. In real AWS the event source
mappings in `template.yaml` do this polling for you; locally you drive each hop
yourself.

Each stage worker's `handle` drops its outcome message into the next queue, so
you drive the pipeline one hop at a time with `scripts/drive-stage.sh`, which
receives the real queued message, wraps it as an SQS event, invokes the matching
Lambda, and deletes the message on success.

## Prerequisites

```bash
docker compose up -d            # Postgres + LocalStack (queues, topic, bucket)
npm run migrate                 # apply schema (DATABASE_URL=...@localhost:5432/...)
npm run sam:build               # bundle the 6 handlers into .aws-sam/
```

`scripts/drive-stage.sh` needs `awslocal`, `sam`, and `node` on PATH (run it from
a Bash shell, e.g. Git Bash). If you don't have `awslocal`, set
`export AWSLOCAL="aws --endpoint-url http://localhost:4566"`.

## 1. Trigger a job

Start the API and POST a document:

```bash
npm run sam:local:api           # separate terminal; serves POST /analyse
curl -s localhost:3000/analyse \
  -H 'content-type: application/json' \
  --data @events/analyse-api-body.json      # or your own {documentBase64, mimeType}
# -> 202 {"jobId":"<uuid>","status":"QUEUED"}
```

(`events/analyse-api.json` is the full API-Gateway proxy event if you'd rather
`sam local invoke ApiFunction -e events/analyse-api.json` instead of curl.)

## 2. Drive each hop

Run these in order. Every other hop is the orchestrator (the only thing that
mutates job state and routes to the next queue).

```bash
# JOB_CREATED  -> enqueues DedupMessage on dedup-queue
scripts/drive-stage.sh orchestrator-queue OrchestratorFunction

# dedup        -> DEDUP_RESOLVED back to orchestrator-queue
scripts/drive-stage.sh dedup-queue        DedupFunction

# route dedup result: miss -> analyse-queue, hit -> rules-queue
scripts/drive-stage.sh orchestrator-queue OrchestratorFunction

# --- fresh (dedup MISS) path only: Gemini extraction ---
scripts/drive-stage.sh analyse-queue      ExtractFunction     # needs a real GEMINI_API_KEY
scripts/drive-stage.sh orchestrator-queue OrchestratorFunction   # EXTRACT_DONE -> rules-queue
# --------------------------------------------------------

# rules        -> RULES_DONE back to orchestrator-queue
scripts/drive-stage.sh rules-queue        RulesFunction
scripts/drive-stage.sh orchestrator-queue OrchestratorFunction   # -> confidence-queue

# confidence   -> CONFIDENCE_DONE back to orchestrator-queue
scripts/drive-stage.sh confidence-queue   ConfidenceFunction
scripts/drive-stage.sh orchestrator-queue OrchestratorFunction   # marks job DONE + SNS publish
```

On a **cache hit** the orchestrator routes straight to `rules-queue`, so skip the
`analyse-queue`/`ExtractFunction` hop and the `EXTRACT_DONE` orchestrator turn.

## 3. Check progress

```bash
curl -s localhost:3000/jobs/<jobId>          # status advances QUEUED -> ... -> DONE

# how many messages are still parked on a queue:
awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/orchestrator-queue \
  --attribute-names ApproximateNumberOfMessages
```

## Notes

- **Extraction needs a real key.** The fresh path calls Gemini; set a working
  `GEMINI_API_KEY` for `ExtractFunction` in `env.json` first. To smoke-test
  without Gemini, pre-seed the `analyses` table so dedup hits and the extract hop
  is skipped.
- **Failures behave like prod.** If a `sam local invoke` exits non-zero the
  message is left on the queue (the script deletes only on success) and reappears
  after its visibility timeout; after `maxReceiveCount` (5) it goes to that
  queue's `-dlq`.
- **Single-stage testing.** To exercise one worker in isolation with fixed input,
  hand-invoke it against a static event file, e.g.
  `sam local invoke DedupFunction --docker-network kyc-service_default --env-vars env.json -e events/dedup-sample.json`.
