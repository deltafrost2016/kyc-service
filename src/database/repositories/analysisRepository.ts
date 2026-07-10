import { QueryTypes, Sequelize } from 'sequelize';
import { sequelize } from '../../lib/db.js';
import { Analysis } from '../models/Analysis.js';
import { toVectorLiteral } from '../../lib/embeddings.js';
import type { Extracted } from '../../domain/extractionSchema.js';
import type { AnalysisRow } from '../../types.js';

/**
 * Access to the `analyses` RAG knowledge base: exact-hash lookup, vector
 * nearest-neighbor search, and create-if-absent. The vector column has no
 * native Sequelize type, so `embedding` is written as an escaped SQL literal
 * (embeddingLiteral) that Sequelize inlines into the INSERT rather than
 * binding as text. pgvector's `<=>` operator isn't expressible via the query
 * builder, so nearest-neighbor search stays a raw parameterized query.
 */

/** Wrap a pgvector text literal so Sequelize inlines it verbatim instead of binding it as text. */
const embeddingLiteral = (embedding: number[]) =>
  Sequelize.literal(sequelize.escape(toVectorLiteral(embedding)));

export const findByHash = async (contentHash: string): Promise<AnalysisRow | null> => {
  const row = await Analysis.findOne({ where: { content_hash: contentHash } });
  return row ? (row.get({ plain: true }) as AnalysisRow) : null;
};

/**
 * Nearest neighbor by cosine distance. Returns { analysis, similarity } or null.
 * similarity = 1 - cosine_distance (pgvector `<=>` is cosine distance).
 */
export const findNearest = async (
  embedding: number[],
): Promise<{ analysis: AnalysisRow; similarity: number } | null> => {
  const literal = toVectorLiteral(embedding);
  const rows = await sequelize.query<AnalysisRow & { similarity: number }>(
    `SELECT *, 1 - (embedding <=> :literal) AS similarity
       FROM analyses
       ORDER BY embedding <=> :literal
       LIMIT 1`,
    {
      replacements: { literal },
      type: QueryTypes.SELECT,
    },
  );
  if (rows.length === 0) {
    return null;
  }
  const { similarity, ...analysis } = rows[0];
  return {
    analysis,
    similarity: Number(similarity),
  };
};

export interface UpsertAnalysisParams {
  contentHash: string;
  embedding: number[];
  documentType: string | null;
  extracted: Extracted;
}

/**
 * Create a new analysis row, or return the existing one on content_hash
 * conflict. Existing rows are never overwritten.
 */
export const upsert = async ({
  contentHash,
  embedding,
  documentType,
  extracted,
}: UpsertAnalysisParams): Promise<AnalysisRow> => {
  const [row] = await Analysis.findOrCreate({
    where: { content_hash: contentHash },
    defaults: {
      content_hash: contentHash,
      embedding: embeddingLiteral(embedding) as unknown as string,
      document_type: documentType,
      extracted,
    },
  });
  return row.get({ plain: true }) as AnalysisRow;
};

export default {
  findByHash,
  findNearest,
  upsert,
};
