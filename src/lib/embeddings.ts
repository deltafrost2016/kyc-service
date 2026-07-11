import { createHash } from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';
import config from '../config/index';

/**
 * Multimodal image-embedding seam for RAG dedup. `embed(base64, mimeType)`
 * returns a unit-length number[] of length EMBEDDING_DIM.
 *
 * Providers:
 *  - hash   : deterministic local stub (no external calls). Identical images map
 *             to identical vectors (cosine 1.0); distinct images map elsewhere.
 *             Good enough for dev/tests; NOT semantically meaningful.
 *  - vertex : Vertex AI multimodalembedding@001 (real semantic similarity).
 *             Requires GCP creds + `google-auth-library`.
 */

const l2normalize = (vec: number[]): number[] => {
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
  return vec.map((x) => x / norm);
};

/** Deterministic pseudo-embedding derived from the image bytes. */
const hashEmbed = (base64: string): number[] => {
  const dim = config.EMBEDDING_DIM;
  const out = new Array<number>(dim);
  const seed = Buffer.from(base64, 'base64');
  let block = Buffer.alloc(0);
  let i = 0;
  let counter = 0;
  while (i < dim) {
    if (block.length < 4) {
      block = createHash('sha256')
        .update(seed)
        // eslint-disable-next-line no-plusplus -- simple counter increment
        .update(Buffer.from([counter++, counter, counter]))
        .digest();
    }
    // Map 4 bytes -> float in [-1, 1].
    const v = block.readUInt32BE(0) / 0xffffffff;
    // eslint-disable-next-line no-plusplus -- simple counter increment
    out[i++] = v * 2 - 1;
    block = block.subarray(4);
  }
  return l2normalize(out);
};

const vertexEmbed = async (base64: string): Promise<number[]> => {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const token = await auth.getAccessToken();
  const { GCP_PROJECT, GCP_LOCATION } = config;
  const url = `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT}/locations/${GCP_LOCATION}/publishers/google/models/multimodalembedding@001:predict`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ instances: [{ image: { bytesBase64Encoded: base64 } }] }),
  });
  if (!res.ok) {
    throw new Error(`Vertex embedding failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    predictions?: Array<{ imageEmbedding?: number[] }>;
  };
  const vec = json.predictions?.[0]?.imageEmbedding;
  if (!vec) {
    throw new Error('Vertex embedding response missing imageEmbedding');
  }
  return l2normalize(vec);
};

export const embed = async (base64: string): Promise<number[]> => {
  if (config.EMBEDDING_PROVIDER === 'vertex') {
    return vertexEmbed(base64);
  }
  return hashEmbed(base64);
};

/** Serialize a number[] to the pgvector text literal, e.g. "[0.1,0.2,...]". */
export const toVectorLiteral = (vec: number[]): string => `[${vec.join(',')}]`;

export default {
  embed,
  toVectorLiteral,
};
