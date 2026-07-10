import { createSqsBatchHandler } from './sqsBatchHandler.js';
import { handle } from '../workers/dedupWorker.js';
import type { DedupMessage } from '../types.js';

export const handler = createSqsBatchHandler<DedupMessage>(handle);
