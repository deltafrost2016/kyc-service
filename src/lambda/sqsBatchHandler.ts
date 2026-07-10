import type { SQSEvent, SQSBatchResponse, SQSRecord } from 'aws-lambda';
import { childLogger } from '../lib/logger.js';

const log = childLogger('lambda:sqsBatchHandler');

/**
 * Shared SQS batch-handler adapter (Lambda's analogue of the old
 * `workers/runner.ts` poll loop). Wraps a stage worker's pure `handle(body)`
 * function so it can run as a Lambda invoked by an SQS event source mapping.
 *
 * `handle` already owns its own error handling (it calls `failJob` internally
 * and rethrows) — this adapter's only job is to translate a thrown error into
 * a `batchItemFailures` entry so SQS's own redrive/DLQ policy (maxReceiveCount
 * per queue) takes over, mirroring the "leave message in flight on error"
 * behaviour the old long-poll loop relied on.
 *
 * Records are processed sequentially — same rationale as the old runner:
 * simple, ordering-friendly, easy to reason about.
 */
export const createSqsBatchHandler =
  <T>(handle: (body: T) => Promise<void>) =>
  async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: { itemIdentifier: string }[] = [];

    // eslint-disable-next-line no-restricted-syntax -- intentional sequential processing
    for (const record of event.Records as SQSRecord[]) {
      try {
        const body = JSON.parse(record.body) as T;
        // eslint-disable-next-line no-await-in-loop -- intentional sequential processing
        await handle(body);
      } catch (err) {
        log.error(
          {
            err,
            messageId: record.messageId,
          },
          'message handling failed',
        );
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures };
  };

export default createSqsBatchHandler;
