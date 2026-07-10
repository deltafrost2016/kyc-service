import { createSqsBatchHandler } from './sqsBatchHandler.js';
import { handle } from '../workers/orchestratorWorker.js';
import type { OrchestratorEvent } from '../types.js';

export const handler = createSqsBatchHandler<OrchestratorEvent>(handle);
