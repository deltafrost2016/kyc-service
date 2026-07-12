import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { config } from '../config/index.js';

/**
 * SQS client + the helper workers/API routes actually use (send).
 * Endpoint is configurable so LocalStack and real AWS swap via env alone.
 * Lambda's own SQS event-source-mapping handles polling/deleting messages,
 * so this seam no longer needs receive/delete helpers.
 */
const client = new SQSClient({
  region: config.AWS_REGION,
  endpoint: config.AWS_ENDPOINT_URL || undefined,
});

export const sendMessage = (queueUrl: string, body: unknown) =>
  client.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(body),
    }),
  );

export default {
  sendMessage,
};
