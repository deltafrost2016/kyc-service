import { runWorker } from './runner.js';
import { updateJob, failJob } from '../database/repositories/jobRepository.js';
import { sendMessage } from '../lib/sqs.js';
import { publish } from '../lib/sns.js';
import config from '../config/index.js';
import { childLogger } from '../lib/logger.js';
import type { OrchestratorEvent } from '../types.js';

const log = childLogger('worker:orchestrator');

/**
 * orchestrator-queue handler. The only component that mutates job state and
 * decides which stage queue runs next — every other worker is a pure stage
 * function that reports its outcome here as an event.
 */
const handle = async (event: OrchestratorEvent): Promise<void> => {
  try {
    switch (event.type) {
      case 'JOB_CREATED': {
        await sendMessage(config.DEDUP_QUEUE_URL, {
          jobId: event.jobId,
          s3Key: event.s3Key,
          mimeType: event.mimeType,
          contentHash: event.contentHash,
        });
        break;
      }

      case 'DEDUP_RESOLVED': {
        const { result } = event;
        if (result.hit) {
          await updateJob(event.jobId, {
            status: 'EXTRACTED',
            source: result.source,
            reused_from: result.analysis.id,
            document_type: result.analysis.document_type,
            extracted: result.analysis.extracted,
          });
          await sendMessage(config.RULES_QUEUE_URL, { jobId: event.jobId });
        } else {
          await sendMessage(config.ANALYSE_QUEUE_URL, {
            jobId: event.jobId,
            s3Key: event.s3Key,
            mimeType: event.mimeType,
            contentHash: event.contentHash,
            embedding: result.embedding,
          });
        }
        break;
      }

      case 'EXTRACT_DONE': {
        await updateJob(event.jobId, {
          status: 'EXTRACTED',
          source: 'FRESH',
          document_type: event.documentType,
          extracted: event.extracted,
        });
        await sendMessage(config.RULES_QUEUE_URL, { jobId: event.jobId });
        break;
      }

      case 'RULES_DONE': {
        await updateJob(event.jobId, {
          status: 'VALIDATED',
          rule_results: event.ruleResults,
        });
        await sendMessage(config.CONFIDENCE_QUEUE_URL, { jobId: event.jobId });
        break;
      }

      case 'CONFIDENCE_DONE': {
        const done = await updateJob(event.jobId, {
          status: 'DONE',
          confidence: event.confidence,
          completed_at: new Date().toISOString(),
        });
        await publish(
          config.ANALYSIS_COMPLETE_TOPIC_ARN,
          {
            jobId: event.jobId,
            source: done.source,
            documentType: done.document_type,
            rulesPassed: event.rulesPassed,
            confidence: event.confidence,
          },
          {
            documentType: done.document_type || 'UNKNOWN',
            band: event.confidence.band,
          },
        );
        break;
      }

      default: {
        const exhaustive: never = event;
        throw new Error(`Unknown orchestrator event: ${JSON.stringify(exhaustive)}`);
      }
    }

    log.info(
      {
        jobId: event.jobId,
        type: event.type,
      },
      'routed',
    );
  } catch (err) {
    await failJob(event.jobId, err instanceof Error ? err.message : String(err));
    throw err;
  }
};

export const start = (): Promise<void> =>
  runWorker<OrchestratorEvent>({
    name: 'orchestrator',
    queueUrl: config.ORCHESTRATOR_QUEUE_URL,
    handler: handle,
  });

export default { start };
