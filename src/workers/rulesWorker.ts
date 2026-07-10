import { runWorker } from './runner.js';
import { runRules } from '../domain/rules/index.js';
import { getJob, failJob } from '../database/repositories/jobRepository.js';
import { sendMessage } from '../lib/sqs.js';
import config from '../config/index.js';
import { childLogger } from '../lib/logger.js';
import type { JobStageMessage } from '../types.js';

const log = childLogger('worker:rules');

/**
 * rules-queue handler. Pure stage: loads the job's extracted fields, runs the
 * rule engine against today's date, and reports the result to the
 * orchestrator, which owns job-state updates and routing. Identical for
 * fresh and cache-hit jobs (only extraction differed).
 */
const handle = async ({ jobId }: JobStageMessage): Promise<void> => {
  try {
    const job = await getJob(jobId);
    if (!job || !job.extracted) {
      throw new Error(`Job ${jobId} missing extracted fields`);
    }

    const ruleResults = runRules(job.extracted, { now: new Date() });

    await sendMessage(config.ORCHESTRATOR_QUEUE_URL, {
      type: 'RULES_DONE',
      jobId,
      ruleResults,
    });
    log.info(
      {
        jobId,
        passed: ruleResults.passed,
      },
      'validated',
    );
  } catch (err) {
    await failJob(jobId, err instanceof Error ? err.message : String(err));
    throw err;
  }
};

export const start = (): Promise<void> =>
  runWorker<JobStageMessage>({
    name: 'rules',
    queueUrl: config.RULES_QUEUE_URL,
    handler: handle,
  });

export default { start };
