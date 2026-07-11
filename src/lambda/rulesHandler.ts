import { createSqsBatchHandler } from './sqsBatchHandler';
import { handle } from '../workers/rulesWorker';
import type { JobStageMessage } from '../types';

export const handler = createSqsBatchHandler<JobStageMessage>(handle);
