import { createHash } from 'node:crypto';

/** SHA-256 hex digest of a Buffer or base64 string (the exact-dedup gate). */
export const sha256 = (input: Buffer | string): string => {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'base64');
  return createHash('sha256').update(buf).digest('hex');
};

export default { sha256 };
