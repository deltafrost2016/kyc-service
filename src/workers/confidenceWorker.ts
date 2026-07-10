import { scoreConfidence } from '../domain/confidence.js';
import { getJob, failJob } from '../database/repositories/jobRepository.js';
import { sendMessage } from '../lib/sqs.js';
import config from '../config/index.js';
import { childLogger } from '../lib/logger.js';
import type { JobStageMessage } from '../types.js';

const log = childLogger('worker:confidence');

/**
 * confidence-queue handler (final stage). Pure stage: scores the analysis
 * and reports the result to the orchestrator, which marks the job DONE and
 * publishes to the analysis-complete SNS topic.
 */
export const handle = async ({ jobId }: JobStageMessage): Promise<void> => {
  try {
    const job = await getJob(jobId);
    if (!job || !job.extracted || !job.rule_results) {
      throw new Error(`Job ${jobId} missing extraction/rule results`);
    }

    const confidence = scoreConfidence(job.extracted, job.rule_results);

    await sendMessage(config.ORCHESTRATOR_QUEUE_URL, {
      type: 'CONFIDENCE_DONE',
      jobId,
      confidence,
      rulesPassed: job.rule_results.passed,
    });
    log.info(
      {
        jobId,
        score: confidence.score,
        band: confidence.band,
      },
      'scored',
    );
  } catch (err) {
    await failJob(jobId, err instanceof Error ? err.message : String(err));
    throw err;
  }
};
