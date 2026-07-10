#!/bin/bash
# Provisions SQS queues (+ DLQs with redrive), the SNS topic and the S3 staging
# bucket. Runs automatically via LocalStack's ready.d hook on container start.
set -euo pipefail

REGION="us-east-1"
ACCOUNT="000000000000"

create_queue_with_dlq() {
  local name="$1"
  local dlq="${name}-dlq"

  awslocal sqs create-queue --queue-name "$dlq" >/dev/null
  local dlq_arn="arn:aws:sqs:${REGION}:${ACCOUNT}:${dlq}"

  awslocal sqs create-queue \
    --queue-name "$name" \
    --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"${dlq_arn}\\\",\\\"maxReceiveCount\\\":\\\"5\\\"}\"}" \
    >/dev/null
  echo "queue ready: $name (dlq: $dlq)"
}

create_queue_with_dlq orchestrator-queue
create_queue_with_dlq dedup-queue
create_queue_with_dlq analyse-queue
create_queue_with_dlq rules-queue
create_queue_with_dlq confidence-queue

# SNS topic for completed analyses (fresh + cache-hit).
awslocal sns create-topic --name analysis-complete >/dev/null
echo "topic ready: analysis-complete"

# S3 staging bucket for raw base64 (short-lived; deleted after use).
awslocal s3 mb s3://doc-staging >/dev/null || true
awslocal s3api put-bucket-lifecycle-configuration \
  --bucket doc-staging \
  --lifecycle-configuration '{"Rules":[{"ID":"expire-1d","Status":"Enabled","Filter":{},"Expiration":{"Days":1}}]}' \
  >/dev/null || true
echo "bucket ready: doc-staging"

echo "localstack init complete"
