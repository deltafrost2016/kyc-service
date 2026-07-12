import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the repo and embedding seams so dedupService logic is tested in isolation.
vi.mock('../src/database/repositories/analysisRepository', () => ({
  findByHash: vi.fn(),
  findNearest: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock('../src/lib/embeddings', () => ({
  embed: vi.fn(async () => [0.1, 0.2, 0.3]),
  toVectorLiteral: (v: number[]) => `[${v.join(',')}]`,
}));

import { resolveDedup } from '../src/services/dedupService';
import { findByHash, findNearest, upsert } from '../src/database/repositories/analysisRepository';
import { embed } from '../src/lib/embeddings';

const args = { contentHash: 'abc', base64: 'ZGF0YQ==' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveDedup', () => {
  it('returns CACHE_EXACT on hash match without embedding', async () => {
    vi.mocked(findByHash).mockResolvedValue({
      id: 'a1',
      extracted: { documentType: 'PAN' },
    } as never);

    const res = await resolveDedup(args);

    expect(res).toMatchObject({ hit: true, source: 'CACHE_EXACT' });
    expect(res).toHaveProperty('analysis');
    expect(embed).not.toHaveBeenCalled(); // exact gate skips embedding
    expect(upsert).not.toHaveBeenCalled(); // already in the KB under this hash
  });

  it('returns CACHE_SEMANTIC when similarity >= threshold and memoizes the new hash', async () => {
    vi.mocked(findByHash).mockResolvedValue(null);
    vi.mocked(findNearest).mockResolvedValue({
      analysis: { id: 'a2', document_type: 'PAN', extracted: { documentType: 'PAN' } },
      similarity: 0.97,
    } as never);

    const res = await resolveDedup(args);

    expect(res).toMatchObject({ hit: true, source: 'CACHE_SEMANTIC', similarity: 0.97 });
    expect(embed).toHaveBeenCalledOnce();
    // dedup builds the RAG KB: promotes this hash to the exact gate next time
    expect(upsert).toHaveBeenCalledWith({
      contentHash: args.contentHash,
      embedding: [0.1, 0.2, 0.3],
      documentType: 'PAN',
      extracted: { documentType: 'PAN' },
    });
  });

  it('is a miss when nearest similarity is below threshold', async () => {
    vi.mocked(findByHash).mockResolvedValue(null);
    vi.mocked(findNearest).mockResolvedValue({ analysis: { id: 'a3' }, similarity: 0.5 } as never);

    const res = await resolveDedup(args);

    expect(res.hit).toBe(false);
    if (!res.hit) expect(res.embedding).toEqual([0.1, 0.2, 0.3]); // passed on for reuse
    expect(upsert).not.toHaveBeenCalled();
  });

  it('is a miss when there is no neighbor at all', async () => {
    vi.mocked(findByHash).mockResolvedValue(null);
    vi.mocked(findNearest).mockResolvedValue(null);

    const res = await resolveDedup(args);

    expect(res.hit).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });
});
