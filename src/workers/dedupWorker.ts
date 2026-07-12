import { resolveDedup } from '../services/dedupService';
import { failJob } from '../database/repositories/jobRepository';
import { sendMessage } from '../lib/sqs';
import * as s3 from '../lib/s3';
import { config } from '../config/index.js';
import { childLogger } from '../lib/logger';
import type { DedupMessage } from '../types';

const log = childLogger('worker:dedup');

/**
 * dedup-queue handler. Pure stage: resolves cache hit/miss and reports the
 * outcome to the orchestrator, which owns job-state updates and routing.
 */
export const handle = async ({ jobId, s3Key, mimeType, contentHash }: DedupMessage): Promise<void> => {
  try {
    const base64 = await s3.getBase64(s3Key);
    const result = await resolveDedup({
      contentHash,
      base64,
    });

    if (result.hit) {
      await s3.deleteObject(s3Key); // no longer needed on the reuse path
    }

    await sendMessage(config.ORCHESTRATOR_QUEUE_URL, {
      type: 'DEDUP_RESOLVED',
      jobId,
      s3Key,
      mimeType,
      contentHash,
      result,
    });
    log.info(
      {
        jobId,
        hit: result.hit,
      },
      'dedup resolved',
    );
  } catch (err) {
    await failJob(jobId, err instanceof Error ? err.message : String(err));
    // Never leave a staged PII document behind, even on failure.
    await s3.deleteObject(s3Key).catch((cleanupErr) =>
      log.warn(
        {
          jobId,
          cleanupErr,
        },
        'failed to delete staged document',
      ),
    );
    throw err;
  }
};
