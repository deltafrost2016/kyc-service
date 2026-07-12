import { createSqsBatchHandler } from './sqsBatchHandler';
import { handle } from '../workers/orchestratorWorker';
import type { OrchestratorEvent } from '../types';

export const handler = createSqsBatchHandler<OrchestratorEvent>(handle);
