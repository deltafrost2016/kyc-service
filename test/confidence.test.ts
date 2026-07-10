import { describe, it, expect } from 'vitest';
import { scoreConfidence } from '../src/domain/confidence.js';
import { runRules } from '../src/domain/rules/index.js';
import type { Extracted } from '../src/domain/extractionSchema.js';

const NOW = new Date('2026-07-02T00:00:00Z');

const validPassport: Extracted = {
  documentNumber: 'A1234567',
  name: 'Rahul Kumar',
  dateOfBirth: '1990-05-05',
  address: '12 MG Road, Bengaluru, Karnataka 560001',
  mothersName: 'Sita Devi',
  validityDate: '2030-01-01',
  documentType: 'PASSPORT',
};

describe('scoreConfidence', () => {
  it('scores a complete valid document HIGH (100)', () => {
    const rules = runRules(validPassport, { now: NOW });
    const { score, band, breakdown } = scoreConfidence(validPassport, rules);
    expect(score).toBe(100);
    expect(band).toBe('HIGH');
    // Contributions sum to the score.
    const sum = Math.round(breakdown.reduce((s, b) => s + b.contribution, 0));
    expect(sum).toBe(score);
  });

  it('scores an empty extraction LOW', () => {
    const empty: Extracted = {
      documentNumber: null,
      name: null,
      dateOfBirth: null,
      address: null,
      mothersName: null,
      validityDate: null,
      documentType: null,
    };
    const rules = runRules(empty, { now: NOW });
    const { score, band } = scoreConfidence(empty, rules);
    expect(score).toBeLessThan(50);
    expect(band).toBe('LOW');
  });

  it('does not penalize PAN for missing type-inapplicable fields', () => {
    const pan: Extracted = {
      documentNumber: 'ABCDE1234F',
      name: 'Rahul Kumar',
      dateOfBirth: '1990-05-05',
      address: '12 MG Road, Bengaluru, Karnataka 560001',
      mothersName: null,
      validityDate: null,
      documentType: 'PAN',
    };
    const rules = runRules(pan, { now: NOW });
    const { score } = scoreConfidence(pan, rules);
    expect(score).toBe(100);
  });

  it('exposes the three weighted components in the breakdown', () => {
    const rules = runRules(validPassport, { now: NOW });
    const { breakdown } = scoreConfidence(validPassport, rules);
    expect(breakdown.map((b) => b.component)).toEqual(['completeness', 'rulePassRate', 'critical']);
  });
});
