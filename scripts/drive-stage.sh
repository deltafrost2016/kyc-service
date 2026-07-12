#!/usr/bin/env bash
# Manually drive ONE SQS hop of the local pipeline.
#
# `sam local` does not emulate SQS event source mappings, so nothing drains the
# LocalStack queues automatically — a triggered job just sits in orchestrator-queue.
# This helper does a single hop by hand: receive one real message from a queue,
# wrap it in the SQS event envelope each *Handler expects, invoke the matching
# Lambda via `sam local`, then delete the message (only on a successful invoke).
#
# Because it forwards the *actual* queued message, the dynamic payload (jobId,
# the embedding array, extracted fields) is carried through faithfully — unlike
# a hand-written static event file.
#
# Usage:
#   scripts/drive-stage.sh <queue-name> <SamFunctionName>
#
# Queue -> Function map:
#   orchestrator-queue  OrchestratorFunction
#   dedup-queue         DedupFunction
#   analyse-queue       ExtractFunction
#   rules-queue         RulesFunction
#   confidence-queue    ConfidenceFunction
#
# Requires: awslocal (or set AWSLOCAL="aws --endpoint-url http://localhost:4566"),
#           sam, node, and `docker compose up` running. Run from repo root.
set -euo pipefail

QUEUE="${1:?queue name required (e.g. orchestrator-queue)}"
FUNCTION="${2:?SAM function name required (e.g. OrchestratorFunction)}"

AWSLOCAL="${AWSLOCAL:-awslocal}"
DOCKER_NETWORK="${DOCKER_NETWORK:-kyc-service_default}"
QURL="http://localhost:4566/000000000000/${QUEUE}"
EVENT_FILE="$(mktemp)"
export QUEUE EVENT_FILE
trap 'rm -f "$EVENT_FILE"' EXIT

MSG="$($AWSLOCAL sqs receive-message \
  --queue-url "$QURL" \
  --max-number-of-messages 1 \
  --wait-time-seconds 2 \
  --visibility-timeout 60 \
  --output json)"

if [ -z "${MSG//[[:space:]]/}" ]; then
  echo "no message waiting on ${QUEUE} — nothing to drive."
  exit 0
fi

# Parse the received message and write the SQS event envelope with node (no jq
# dependency). Prints the receipt handle so we can delete after a good invoke.
RECEIPT="$(printf '%s' "$MSG" | node -e '
  const fs = require("fs");
  const inp = JSON.parse(fs.readFileSync(0, "utf8"));
  const m = (inp.Messages || [])[0];
  if (!m) { process.stderr.write("empty receive\n"); process.exit(3); }
  const evt = { Records: [{
    messageId: m.MessageId,
    receiptHandle: m.ReceiptHandle,
    body: m.Body,
    attributes: {
      ApproximateReceiveCount: "1",
      SentTimestamp: "1700000000000",
      SenderId: "000000000000",
      ApproximateFirstReceiveTimestamp: "1700000000000",
    },
    messageAttributes: {},
    md5OfBody: m.MD5OfBody || "",
    eventSource: "aws:sqs",
    eventSourceARN: `arn:aws:sqs:ap-south-1:000000000000:${process.env.QUEUE}`,
    awsRegion: "ap-south-1",
  }]};
  fs.writeFileSync(process.env.EVENT_FILE, JSON.stringify(evt, null, 2));
  process.stdout.write(m.ReceiptHandle);
')"

echo "==> invoking ${FUNCTION} with 1 message from ${QUEUE}"
sam local invoke "$FUNCTION" \
  --docker-network "$DOCKER_NETWORK" \
  --env-vars env.json \
  -e "$EVENT_FILE"

# Only reached if `sam local invoke` exited 0 (set -e). On failure the message
# stays on the queue and reappears after its visibility timeout, just like prod.
$AWSLOCAL sqs delete-message --queue-url "$QURL" --receipt-handle "$RECEIPT"
echo "==> ${QUEUE} message deleted; hop complete."
