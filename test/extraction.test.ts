import { describe, it, expect, vi, beforeEach } from 'vitest';

import { extractDocument } from '../src/services/extractionService';
import { generateJson } from '../src/lib/llm/index';
import { extractedZodSchema } from '../src/domain/extractionSchema';

vi.mock('../src/lib/llm/index', () => ({
  generateJson: vi.fn(),
}));

const base = {
  documentNumber: 'A1234567',
  name: 'Rahul Kumar',
  dateOfBirth: '1990-05-05',
  address: '12 MG Road, Bengaluru, Karnataka 560001',
  mothersName: 'Sita Devi',
  validityDate: '2030-01-01',
  documentType: 'PASSPORT',
};

beforeEach(() => vi.clearAllMocks());

describe('extractDocument', () => {
  it('returns validated fields for a well-formed model response', async () => {
    vi.mocked(generateJson).mockResolvedValue(base);
    const out = await extractDocument({
      base64: 'x',
      mimeType: 'image/jpeg',
    });
    expect(out).toEqual(base);
  });

  it('preserves nulls for absent fields', async () => {
    vi.mocked(generateJson).mockResolvedValue({
      ...base,
      mothersName: null,
      validityDate: null,
      documentType: 'PAN',
    });
    const out = await extractDocument({
      base64: 'x',
      mimeType: 'image/jpeg',
    });
    expect(out.mothersName).toBeNull();
    expect(out.validityDate).toBeNull();
  });

  it('coerces document type casing/spacing to the enum', async () => {
    vi.mocked(generateJson).mockResolvedValue({
      ...base,
      documentType: 'driving licence',
    });
    const out = await extractDocument({
      base64: 'x',
      mimeType: 'image/jpeg',
    });
    expect(out.documentType).toBe('DRIVING_LICENCE');
  });

  it('coerces an unknown document type to null', async () => {
    vi.mocked(generateJson).mockResolvedValue({
      ...base,
      documentType: 'ration card',
    });
    const out = await extractDocument({
      base64: 'x',
      mimeType: 'image/jpeg',
    });
    expect(out.documentType).toBeNull();
  });
});

describe('extractedZodSchema', () => {
  it('rejects a response missing required keys', () => {
    expect(extractedZodSchema.safeParse({ documentNumber: 'x' }).success).toBe(false);
  });
});
