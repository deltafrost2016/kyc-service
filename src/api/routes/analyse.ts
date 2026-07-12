import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { sha256 } from '../../lib/hash';
import * as s3 from '../../lib/s3';
import { sendMessage } from '../../lib/sqs';
import { createJob } from '../../database/repositories/jobRepository';
import { config } from '../../config/index.js';
import { childLogger } from '../../lib/logger';

const log = childLogger('api:analyse');
const router = Router();

const bodySchema = z.object({
  documentBase64: z.string().min(1, 'documentBase64 is required'),
  mimeType: z.enum(['image/jpeg', 'image/png', 'application/pdf']),
});

/**
 * POST /analyse
 * Validate -> hash -> stage raw bytes in S3 -> create job -> enqueue a
 * JOB_CREATED event to the orchestrator -> respond 202 with the jobId.
 * No processing happens inline; the orchestrator owns pipeline routing.
 */
router.post('/analyse', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parsed.error.issues,
      });
    }
    const { documentBase64, mimeType } = parsed.data;

    const contentHash = sha256(documentBase64);
    const job = await createJob({ contentHash });

    const s3Key = `staging/${job.id}`;
    await s3.putBase64(s3Key, documentBase64, mimeType);

    await sendMessage(config.ORCHESTRATOR_QUEUE_URL, {
      type: 'JOB_CREATED',
      jobId: job.id,
      s3Key,
      mimeType,
      contentHash,
    });

    log.info({ jobId: job.id }, 'analyse job queued');
    return res.status(202).json({
      jobId: job.id,
      status: 'QUEUED',
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
