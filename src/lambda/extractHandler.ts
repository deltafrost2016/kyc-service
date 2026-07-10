import { createSqsBatchHandler } from './sqsBatchHandler.js';
import { handle } from '../workers/extractWorker.js';
import type { AnalyseMessage } from '../types.js';

export const handler = createSqsBatchHandler<AnalyseMessage>(handle);
