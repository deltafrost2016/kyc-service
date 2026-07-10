import { embed } from '../lib/embeddings.js';
import { findByHash, findNearest, upsert } from '../database/repositories/analysisRepository.js';
import config from '../config/index.js';
import type { DedupResult } from '../types.js';

export type { DedupResult };

/**
 * Decide whether a document has been analysed before.
 * Two-tier: exact SHA-256 gate, then pgvector semantic nearest-neighbor.
 * A semantic hit also upserts the new hash into the RAG knowledge base
 * (pointing at the matched extraction), promoting future exact resubmissions
 * of this document to the fast hash gate.
 *
 * @returns one of:
 *   { hit: true,  source: 'CACHE_EXACT',    analysis }
 *   { hit: true,  source: 'CACHE_SEMANTIC', analysis, similarity }
 *   { hit: false, embedding }   // miss; embedding computed for later reuse
 */
export const resolveDedup = async ({
  contentHash,
  base64,
}: {
  contentHash: string;
  base64: string;
}): Promise<DedupResult> => {
  const exact = await findByHash(contentHash);
  if (exact) {
    return {
      hit: true,
      source: 'CACHE_EXACT',
      analysis: exact,
    };
  }

  const embedding = await embed(base64);
  const nearest = await findNearest(embedding);
  if (nearest && nearest.similarity >= config.SIMILARITY_THRESHOLD) {
    // Memoize this hash against the matched analysis so a byte-identical
    // resubmission of *this* document hits the exact gate next time instead
    // of paying for another vector search — dedup also builds the RAG cache.
    await upsert({
      contentHash,
      embedding,
      documentType: nearest.analysis.document_type,
      extracted: nearest.analysis.extracted,
    });
    return {
      hit: true,
      source: 'CACHE_SEMANTIC',
      analysis: nearest.analysis,
      similarity: nearest.similarity,
    };
  }

  return {
    hit: false,
    embedding,
  };
};

export default { resolveDedup };
