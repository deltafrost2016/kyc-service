import { extractDocument } from '../services/extractionService';
import { failJob } from '../database/repositories/jobRepository';
import { upsert as upsertAnalysis } from '../database/repositories/analysisRepository';
import { sendMessage } from '../lib/sqs';
import * as s3 from '../lib/s3';
import config from '../config/index';
import { childLogger } from '../lib/logger';
import type { AnalyseMessage } from '../types';

const log = childLogger('worker:extract');

/**
 * analyse-queue handler (reached only on a dedup miss). Pure stage: Gemini
 * extraction, builds the RAG knowledge base, and reports completion to the
 * orchestrator, which owns job-state updates and routing.
 * The raw S3 object is deleted immediately after extraction.
 */
export const handle = async ({
  jobId,
  s3Key,
  mimeType,
  contentHash,
  embedding,
}: AnalyseMessage): Promise<void> => {
  try {
    const base64 = await s3.getBase64(s3Key);
    const extracted = await extractDocument({
      base64,
      mimeType,
    });
    await s3.deleteObject(s3Key); // raw image never persisted

    // Add to the RAG knowledge base so future documents can reuse this result.
    await upsertAnalysis({
      contentHash,
      embedding,
      documentType: extracted.documentType,
      extracted,
    });

    await sendMessage(config.ORCHESTRATOR_QUEUE_URL, {
      type: 'EXTRACT_DONE',
      jobId,
      documentType: extracted.documentType,
      extracted,
    });
    log.info(
      {
        jobId,
        documentType: extracted.documentType,
      },
      'extracted',
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
