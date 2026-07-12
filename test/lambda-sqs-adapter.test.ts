import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { createSqsBatchHandler } from '../src/lambda/sqsBatchHandler';

// Only the fields the adapter actually reads (`messageId`, `body`) are populated;
// the rest are cast through `as unknown as SQSRecord` to keep the fixture minimal.
const makeRecord = (messageId: string, body: unknown): SQSRecord =>
  ({
    messageId,
    body: JSON.stringify(body),
  }) as unknown as SQSRecord;

const makeEvent = (records: SQSRecord[]): SQSEvent => ({ Records: records });

describe('createSqsBatchHandler', () => {
  let handle: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handle = vi.fn();
  });

  it('returns empty batchItemFailures when every record succeeds', async () => {
    handle.mockResolvedValue(undefined);
    const handler = createSqsBatchHandler(handle);

    const event = makeEvent([
      makeRecord('msg-1', { jobId: 'job-1' }),
      makeRecord('msg-2', { jobId: 'job-2' }),
    ]);

    const result = await handler(event);

    expect(result).toEqual({ batchItemFailures: [] });
    expect(handle).toHaveBeenCalledTimes(2);
    expect(handle).toHaveBeenNthCalledWith(1, { jobId: 'job-1' });
    expect(handle).toHaveBeenNthCalledWith(2, { jobId: 'job-2' });
  });

  it('reports only the failing record in batchItemFailures', async () => {
    handle.mockImplementation(async (body: { jobId: string }) => {
      if (body.jobId === 'job-bad') {
        throw new Error('boom');
      }
    });
    const handler = createSqsBatchHandler(handle);

    const event = makeEvent([
      makeRecord('msg-good', { jobId: 'job-good' }),
      makeRecord('msg-bad', { jobId: 'job-bad' }),
      makeRecord('msg-good-2', { jobId: 'job-good-2' }),
    ]);

    const result = await handler(event);

    expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: 'msg-bad' }] });
    expect(handle).toHaveBeenCalledTimes(3);
  });

  it('reports an unparseable record body as a batch item failure without throwing', async () => {
    const handler = createSqsBatchHandler(handle);

    const badRecord = {
      messageId: 'msg-unparseable',
      body: '{not-json',
    } as unknown as SQSRecord;
    const event = makeEvent([badRecord]);

    const result = await handler(event);

    expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: 'msg-unparseable' }] });
    expect(handle).not.toHaveBeenCalled();
  });
});
