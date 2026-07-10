import type { Message } from '@aws-sdk/client-sqs';
import { receiveMessages, deleteMessage } from '../lib/sqs.js';
import { childLogger } from '../lib/logger.js';

export interface WorkerOptions<T> {
  name: string;
  queueUrl: string;
  handler: (body: T, raw: Message) => Promise<void>;
}

/**
 * Shared SQS long-poll loop. Each worker supplies a name, queue URL and a
 * `handler(body, raw)` that processes one message. On success the message is
 * deleted; on error it is left to become visible again and, after the queue's
 * maxReceiveCount, moved to the DLQ. Workers contain no polling boilerplate.
 */
export const runWorker = <T extends { jobId?: string }>({
  name,
  queueUrl,
  handler,
}: WorkerOptions<T>): Promise<void> => {
  const log = childLogger(`worker:${name}`);
  let running = true;

  const shutdown = () => {
    log.info('shutting down');
    running = false;
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  const processOne = async (msg: Message): Promise<void> => {
    let body: T;
    try {
      body = JSON.parse(msg.Body as string) as T;
    } catch (err) {
      // Unparseable message: delete so it doesn't wedge the queue.
      log.error({ err }, 'dropping unparseable message');
      await deleteMessage(queueUrl, msg.ReceiptHandle);
      return;
    }

    try {
      await handler(body, msg);
      await deleteMessage(queueUrl, msg.ReceiptHandle);
    } catch (err) {
      // Leave in flight -> redrive/DLQ. Handlers own job-level FAILED marking.
      log.error(
        {
          err,
          jobId: body.jobId,
        },
        'message handling failed',
      );
    }
  };

  const loop = async (): Promise<void> => {
    log.info({ queueUrl }, 'worker started');
    while (running) {
      try {
        // eslint-disable-next-line no-await-in-loop -- sequential SQS long-poll by design
        const messages = await receiveMessages(queueUrl);
        // Process sequentially: simple, ordering-friendly, easy to reason about.
        // eslint-disable-next-line no-restricted-syntax -- intentional sequential processing
        for (const msg of messages) {
          if (!running) {
            break;
          }
          // eslint-disable-next-line no-await-in-loop -- intentional sequential processing
          await processOne(msg);
        }
      } catch (err) {
        log.error({ err }, 'receive loop error; backing off');
        // eslint-disable-next-line no-await-in-loop -- intentional backoff before retrying
        await new Promise<void>((r) => {
          setTimeout(r, 2000);
        });
      }
    }
    log.info('worker stopped');
  };

  return loop();
};

export default { runWorker };
