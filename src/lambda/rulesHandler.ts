import { createSqsBatchHandler } from './sqsBatchHandler.js';
import { handle } from '../workers/rulesWorker.js';
import type { JobStageMessage } from '../types.js';

export const handler = createSqsBatchHandler<JobStageMessage>(handle);
