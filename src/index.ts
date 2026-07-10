import { childLogger } from './lib/logger.js';

const log = childLogger('bootstrap');

/**
 * Entrypoint dispatcher. The role is the first CLI arg (or ROLE env), letting a
 * single image run as the API or any of the workers via different CMD.
 *   tsx src/index.ts api | orchestrator | dedup | extract | rules | confidence
 */
const role = process.argv[2] || process.env.ROLE || 'api';

const roles: Record<string, () => Promise<unknown>> = {
  api: () => import('./api/server.js').then((m) => m.startApi()),
  orchestrator: () => import('./workers/orchestratorWorker.js').then((m) => m.start()),
  dedup: () => import('./workers/dedupWorker.js').then((m) => m.start()),
  extract: () => import('./workers/extractWorker.js').then((m) => m.start()),
  rules: () => import('./workers/rulesWorker.js').then((m) => m.start()),
  confidence: () => import('./workers/confidenceWorker.js').then((m) => m.start()),
};

const run = roles[role];
if (!run) {
  log.error(`Unknown role "${role}". Valid: ${Object.keys(roles).join(', ')}`);
  process.exit(1);
}

run().catch((err) => {
  log.error({ err }, `role "${role}" failed to start`);
  process.exit(1);
});
