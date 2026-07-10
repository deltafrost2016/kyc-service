import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  type Message,
} from '@aws-sdk/client-sqs';
import config from '../config/index.js';

/**
 * SQS client + the few helpers workers actually use (send/receive/delete).
 * Endpoint is configurable so LocalStack and real AWS swap via env alone.
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

export const receiveMessages = (queueUrl: string): Promise<Message[]> =>
  client
    .send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: config.WORKER_MAX_MESSAGES,
        WaitTimeSeconds: config.WORKER_WAIT_TIME_SECONDS,
        VisibilityTimeout: config.WORKER_VISIBILITY_TIMEOUT,
      }),
    )
    .then((res) => res.Messages || []);

export const deleteMessage = (queueUrl: string, receiptHandle: string | undefined) =>
  client.send(
    new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    }),
  );

export default {
  sendMessage,
  receiveMessages,
  deleteMessage,
};
