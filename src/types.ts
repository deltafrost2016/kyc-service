import type { Extracted } from './domain/extractionSchema';
import type { RuleResults } from './domain/rules/types';
import type { Confidence } from './domain/confidence';

/** A row of the `jobs` table (per-request lifecycle). */
export interface JobRow {
  id: string;
  status: string;
  source: string | null;
  content_hash: string | null;
  reused_from: string | null;
  document_type: string | null;
  extracted: Extracted | null;
  rule_results: RuleResults | null;
  confidence: Confidence | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** A row of the `analyses` table (RAG knowledge base). */
export interface AnalysisRow {
  id: string;
  content_hash: string;
  embedding: string;
  document_type: string | null;
  extracted: Extracted;
  created_at: string;
}

/** Message enqueued to the dedup queue (stage-only; no routing decision). */
export interface DedupMessage {
  jobId: string;
  s3Key: string;
  mimeType: string;
  contentHash: string;
}

/** Message enqueued to the analyse queue on a dedup miss (carries the embedding). */
export interface AnalyseMessage extends DedupMessage {
  embedding: number[];
}

/** Message for the rules/confidence stages — only the job id is needed. */
export interface JobStageMessage {
  jobId: string;
}

/**
 * Outcome of `resolveDedup`: exact/semantic cache hit (with the matched
 * analysis) or a miss carrying the freshly computed embedding for reuse.
 */
export type DedupResult =
  | {
      hit: true;
      source: 'CACHE_EXACT' | 'CACHE_SEMANTIC';
      analysis: AnalysisRow;
      similarity?: number;
    }
  | { hit: false; embedding: number[] };

/**
 * Events the API and stage workers publish to the orchestrator queue. The
 * orchestrator is the only component that mutates job state and decides
 * which stage queue to invoke next — workers just report what happened.
 */
export type OrchestratorEvent =
  | ({ type: 'JOB_CREATED' } & DedupMessage)
  | ({ type: 'DEDUP_RESOLVED'; result: DedupResult } & DedupMessage)
  | {
      type: 'EXTRACT_DONE';
      jobId: string;
      documentType: Extracted['documentType'];
      extracted: Extracted;
    }
  | { type: 'RULES_DONE'; jobId: string; ruleResults: RuleResults }
  | { type: 'CONFIDENCE_DONE'; jobId: string; confidence: Confidence; rulesPassed: boolean };
