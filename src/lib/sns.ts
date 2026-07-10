import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import config from '../config/index.js';

/** SNS publish helper for the analysis-complete topic. */
const client = new SNSClient({
  region: config.AWS_REGION,
  endpoint: config.AWS_ENDPOINT_URL || undefined,
});

export const publish = (
  topicArn: string,
  message: unknown,
  attributes: Record<string, unknown> = {},
) =>
  client.send(
    new PublishCommand({
      TopicArn: topicArn,
      Message: JSON.stringify(message),
      MessageAttributes: Object.fromEntries(
        Object.entries(attributes).map(([k, v]) => [
          k,
          {
            DataType: 'String',
            StringValue: String(v),
          },
        ]),
      ),
    }),
  );

export default { publish };
