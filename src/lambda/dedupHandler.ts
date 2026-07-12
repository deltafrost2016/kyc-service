import { createSqsBatchHandler } from './sqsBatchHandler';
import { handle } from '../workers/dedupWorker';
import type { DedupMessage } from '../types';

export const handler = createSqsBatchHandler<DedupMessage>(handle);
