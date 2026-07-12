import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import type { Server } from 'node:http';
import analyseRoute from './routes/analyse';
import jobsRoute from './routes/jobs';
import { childLogger } from '../lib/logger';
import { config } from '../config/index.js';

const log = childLogger('api');

export const createApp = (): Express => {
  const app = express();
  app.use(express.json({ limit: '15mb' })); // base64 documents can be large

  app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }));
  app.use(analyseRoute);
  app.use(jobsRoute);

  // Centralized error handler.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    log.error({ err }, 'request failed');
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
};

export const startApi = (): Server => {
  const app = createApp();
  return app.listen(config.PORT, () => log.info(`API listening on :${config.PORT}`));
};

export default {
  createApp,
  startApi,
};
