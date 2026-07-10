import { z } from 'zod';

/**
 * Central, validated configuration. Every module imports from here rather than
 * touching process.env directly (single source of truth; easy to mock in tests).
 */
const schema = z.object({
  NODE_ENV: z.string().default('development'),
  LOG_LEVEL: z.string().default('info'),

  // API
  PORT: z.coerce.number().default(3000),

  // Postgres
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/docanalysis'),

  // AWS / LocalStack. AWS_ENDPOINT_URL empty => real AWS.
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ENDPOINT_URL: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().default('test'),
  AWS_SECRET_ACCESS_KEY: z.string().default('test'),

  // Queues (URLs resolved at runtime from names against the endpoint)
  ORCHESTRATOR_QUEUE_URL: z.string(),
  DEDUP_QUEUE_URL: z.string(),
  ANALYSE_QUEUE_URL: z.string(),
  RULES_QUEUE_URL: z.string(),
  CONFIDENCE_QUEUE_URL: z.string(),

  // SNS
  ANALYSIS_COMPLETE_TOPIC_ARN: z.string(),

  // S3 staging
  STAGING_BUCKET: z.string().default('doc-staging'),

  // Gemini
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),

  // Embeddings / RAG dedup
  EMBEDDING_PROVIDER: z.enum(['vertex', 'hash']).default('hash'),
  EMBEDDING_DIM: z.coerce.number().default(1408),
  SIMILARITY_THRESHOLD: z.coerce.number().default(0.95),

  // Vertex (only used when EMBEDDING_PROVIDER=vertex)
  GCP_PROJECT: z.string().optional(),
  GCP_LOCATION: z.string().default('us-central1'),

  // Worker tuning
  WORKER_WAIT_TIME_SECONDS: z.coerce.number().default(20),
  WORKER_MAX_MESSAGES: z.coerce.number().default(5),
  WORKER_VISIBILITY_TIMEOUT: z.coerce.number().default(60),
});

export type Config = z.infer<typeof schema>;

// Parse lazily so tests can set env before import side effects matter.
export const config: Config = schema.parse(process.env);

export default config;
