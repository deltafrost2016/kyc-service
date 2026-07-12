import { createSqsBatchHandler } from './sqsBatchHandler';
import { handle } from '../workers/confidenceWorker';
import type { JobStageMessage } from '../types';

export const handler = createSqsBatchHandler<JobStageMessage>(handle);
