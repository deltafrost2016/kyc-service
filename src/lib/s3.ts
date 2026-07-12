import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { config } from '../config/index.js';

/**
 * S3 staging for raw base64 documents (keeps SQS payloads small and PII out of
 * Postgres). `forcePathStyle` is required for LocalStack.
 */
const client = new S3Client({
  region: config.AWS_REGION,
  endpoint: config.AWS_ENDPOINT_URL || undefined,
  forcePathStyle: Boolean(config.AWS_ENDPOINT_URL),
});

/** Store base64 payload; returns the object key. */
export const putBase64 = async (
  key: string,
  base64: string,
  contentType: string,
): Promise<string> => {
  await client.send(
    new PutObjectCommand({
      Bucket: config.STAGING_BUCKET,
      Key: key,
      Body: Buffer.from(base64, 'base64'),
      ContentType: contentType,
    }),
  );
  return key;
};

/** Fetch the staged object and return it as a base64 string. */
export const getBase64 = async (key: string): Promise<string> => {
  const res = await client.send(
    new GetObjectCommand({
      Bucket: config.STAGING_BUCKET,
      Key: key,
    }),
  );
  if (!res.Body) {
    throw new Error(`S3 object ${key} has no body`);
  }
  const bytes = await res.Body.transformToByteArray();
  return Buffer.from(bytes).toString('base64');
};

export const deleteObject = (key: string) =>
  client.send(
    new DeleteObjectCommand({
      Bucket: config.STAGING_BUCKET,
      Key: key,
    }),
  );

export default {
  putBase64,
  getBase64,
  deleteObject,
};
