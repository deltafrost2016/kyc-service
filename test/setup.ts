// Provide the env the config schema requires so modules that transitively import
// ./src/config load cleanly in tests. Runs before any test module is imported.
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  ORCHESTRATOR_QUEUE_URL: 'http://localhost:4566/000000000000/orchestrator-queue',
  DEDUP_QUEUE_URL: 'http://localhost:4566/000000000000/dedup-queue',
  ANALYSE_QUEUE_URL: 'http://localhost:4566/000000000000/analyse-queue',
  RULES_QUEUE_URL: 'http://localhost:4566/000000000000/rules-queue',
  CONFIDENCE_QUEUE_URL: 'http://localhost:4566/000000000000/confidence-queue',
  ANALYSIS_COMPLETE_TOPIC_ARN: 'arn:aws:sns:us-east-1:000000000000:analysis-complete',
  EMBEDDING_PROVIDER: 'hash',
  EMBEDDING_DIM: '64',
  SIMILARITY_THRESHOLD: '0.95',
};

for (const [k, v] of Object.entries(defaults)) {
  if (process.env[k] === undefined) process.env[k] = v;
}
