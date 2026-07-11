import { createSqsBatchHandler } from './sqsBatchHandler';
import { handle } from '../workers/extractWorker';
import type { AnalyseMessage } from '../types';

export const handler = createSqsBatchHandler<AnalyseMessage>(handle);
