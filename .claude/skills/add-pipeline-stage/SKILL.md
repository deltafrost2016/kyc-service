---
name: add-pipeline-stage
description: Use to add a new stage to the async orchestrated pipeline end-to-end (a new SQS-driven worker/Lambda, a new step after dedup/extract/rules/confidence). Triggers - "add a pipeline stage", "add a new worker/queue", "add a step after rules/dedup/extract/confidence".
---

# Add a pipeline stage

This repo is **orchestration, not choreography**: stage workers never decide what runs next —
the `orchestrator` Lambda is the single place that owns the `jobs` state machine and routes
between queues. A new stage must plug into that contract, not grow its own routing logic.

0. **Work inside `kyc-service/`.** Re-read `CLAUDE.md`'s Architecture section end-to-end first.
1. **Add the new outcome event** to the `OrchestratorEvent` discriminated union in `src/types.ts`,
   carrying everything the orchestrator needs to act (mirror the shape of `RULES_DONE` /
   `CONFIDENCE_DONE`).
2. **Write the stage worker** as a pure `handle(body)` in `src/workers/<name>Worker.ts` — it does
   its unit of work and reports the new event; it makes no queue-routing decisions itself. Use an
   existing worker (`workers/dedupWorker.ts`, `workers/rulesWorker.ts`) as the structural
   reference.
3. **Add the thin Lambda adapter** `src/lambda/<name>Handler.ts` using
   `createSqsBatchHandler(handle)` from `src/lambda/sqsBatchHandler.ts` — same pattern as the four
   existing stage handlers. Don't hand-roll batch/error handling; the adapter's only job is
   translating a caught error into a `batchItemFailures` entry.
4. **Route it in the orchestrator.** Add the new branch to the switch statement in
   `src/workers/orchestratorWorker.ts` — this is the *only* place that should decide what happens
   before/after the new stage. Don't add routing logic anywhere else.
5. **Wire the infrastructure in both places** — `template.yaml` (local SAM/LocalStack) and
   `infra/template.yaml` (production, deployed via `.github/workflows/deploy.yml`) — new Lambda +
   SQS queue + DLQ/redrive policy matching the existing queues. These must stay in sync per
   `CLAUDE.md`'s toolchain note. Also add the new queue URL to `src/config/index.ts`'s zod schema
   and to `env.json`.
6. **Add local-dev plumbing:** a sample event file under `events/` and a
   `sam:local:invoke:<name>` script in `package.json`, following the existing four.
7. **Delegate implementation** to `api-implementer`. Infra/production changes
   (`infra/template.yaml`, anything that would affect `sam deploy`) need explicit user
   confirmation before proceeding — never deploy as part of this skill.
8. **Add unit tests** for the new stage's core logic, following `test/dedup.test.ts` /
   `test/extraction.test.ts`'s pattern: `vi.mock` the `lib/`/repository seams and test the pure
   service/worker function in isolation, not against a real DB or queue. Run `test-runner`.
9. **Review** with `code-reviewer` for layering (no routing logic leaking into the worker) and
   ESM import correctness (`.js` extensions on relative imports, per NodeNext rules).
10. **Report:** new event variant, worker/handler files added, orchestrator switch branch, both
    template files updated, config/env changes, tests added.

**Model:** sonnet for wiring; opus if the new stage's business logic itself (not just plumbing) is
non-trivial.
