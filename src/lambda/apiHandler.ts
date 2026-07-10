import { configure as serverlessExpress } from '@codegenie/serverless-express';
import { createApp } from '../api/server.js';

/**
 * API Gateway HTTP API (v2 proxy) adapter. Wraps the same `createApp()` used
 * by the existing route tests — no route/middleware logic changes for Lambda.
 */
export const handler = serverlessExpress({ app: createApp() });
