// Regenerates env.json (sam local's --env-vars file) from .env so secrets
// like GEMINI_API_KEY never have to be hand-copied/committed as a placeholder.
// .env is written for host-side tools (migrate, tests) so it uses `localhost`
// for Postgres/LocalStack; sam local's containers join the compose network
// under the service names, so those two hosts are rewritten here.
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const root = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(root, '.env') });

const toContainerHost = (value) =>
  value?.replace('localhost:5432', 'postgres:5432').replace('localhost:4566', 'localstack:4566');

const env = (name, fallback) => toContainerHost(process.env[name]) ?? fallback;

const COMMON = {
  NODE_ENV: env('NODE_ENV', 'development'),
  LOG_LEVEL: env('LOG_LEVEL', 'info'),
  DATABASE_URL: env('DATABASE_URL'),
  AWS_ENDPOINT_URL: env('AWS_ENDPOINT_URL'),
  AWS_REGION: env('AWS_REGION', 'ap-south-1'),
  AWS_ACCESS_KEY_ID: env('AWS_ACCESS_KEY_ID', 'test'),
  AWS_SECRET_ACCESS_KEY: env('AWS_SECRET_ACCESS_KEY', 'test'),
  ORCHESTRATOR_QUEUE_URL: env('ORCHESTRATOR_QUEUE_URL'),
  DEDUP_QUEUE_URL: env('DEDUP_QUEUE_URL'),
  ANALYSE_QUEUE_URL: env('ANALYSE_QUEUE_URL'),
  RULES_QUEUE_URL: env('RULES_QUEUE_URL'),
  CONFIDENCE_QUEUE_URL: env('CONFIDENCE_QUEUE_URL'),
  ANALYSIS_COMPLETE_TOPIC_ARN: env('ANALYSIS_COMPLETE_TOPIC_ARN'),
  STAGING_BUCKET: env('STAGING_BUCKET'),
  EMBEDDING_PROVIDER: env('EMBEDDING_PROVIDER', 'hash'),
  EMBEDDING_DIM: env('EMBEDDING_DIM', '1408'),
  SIMILARITY_THRESHOLD: env('SIMILARITY_THRESHOLD', '0.95'),
};

const envJson = {
  ApiFunction: { ...COMMON, PORT: env('PORT', '3000') },
  OrchestratorFunction: { ...COMMON },
  DedupFunction: { ...COMMON },
  ExtractFunction: {
    ...COMMON,
    LLM_PROVIDER: env('LLM_PROVIDER', 'gemini'),
    GEMINI_API_KEY: env('GEMINI_API_KEY'),
    GEMINI_MODEL: env('GEMINI_MODEL', 'gemma-3-4b-it'),
    ANTHROPIC_API_KEY: env('ANTHROPIC_API_KEY'),
    CLAUDE_MODEL: env('CLAUDE_MODEL', 'claude-haiku-4-5'),
    OPENAI_API_KEY: env('OPENAI_API_KEY'),
    OPENAI_MODEL: env('OPENAI_MODEL', 'gpt-4o-mini'),
    OLLAMA_BASE_URL: env('OLLAMA_BASE_URL', 'http://localhost:11434'),
    OLLAMA_MODEL: env('OLLAMA_MODEL', 'gemma3:12b'),
  },
  RulesFunction: { ...COMMON },
  ConfidenceFunction: { ...COMMON },
};

fs.writeFileSync(path.join(root, 'env.json'), `${JSON.stringify(envJson, null, 2)}\n`);
console.log('Wrote env.json from .env');
