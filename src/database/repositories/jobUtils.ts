import type { Extracted } from '../../domain/extractionSchema.js';
import type { RuleResults } from '../../domain/rules/types.js';
import type { Confidence } from '../../domain/confidence.js';

/** Columns that may be updated via updateJob. */
export interface JobUpdate {
  status?: string;
  source?: string | null;
  reused_from?: string | null;
  document_type?: string | null;
  extracted?: Extracted | null;
  rule_results?: RuleResults | null;
  confidence?: Confidence | null;
  error?: string | null;
  completed_at?: string | null;
}

const UPDATABLE_FIELDS = new Set<string>([
  'status',
  'source',
  'reused_from',
  'document_type',
  'extracted',
  'rule_results',
  'confidence',
  'error',
  'completed_at',
]);

/** Keep only the columns updateJob is allowed to touch. */
export const pickUpdatableFields = (fields: JobUpdate): Partial<JobUpdate> =>
  Object.fromEntries(
    Object.entries(fields).filter(([col]) => UPDATABLE_FIELDS.has(col)),
  ) as Partial<JobUpdate>;

const MAX_ERROR_LENGTH = 2000;

/** Patch that marks a job FAILED, truncating the error message to a storable length. */
export const buildFailedJobPatch = (message: unknown): JobUpdate => ({
  status: 'FAILED',
  error: String(message).slice(0, MAX_ERROR_LENGTH),
});

export default {
  pickUpdatableFields,
  buildFailedJobPatch,
};
