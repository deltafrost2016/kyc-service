import { describe, it, expect } from 'vitest';
import { runRules } from '../src/domain/rules/index';
import * as dob from '../src/domain/rules/dob';
import * as validity from '../src/domain/rules/validity';
import * as motherName from '../src/domain/rules/motherName';
import * as address from '../src/domain/rules/address';
import * as documentType from '../src/domain/rules/documentType';
import type { Extracted } from '../src/domain/extractionSchema';

const NOW = new Date('2026-07-02T00:00:00Z');
const ctx = { now: NOW };

describe('dob rule', () => {
  it('passes for a valid adult DOB', () => {
    expect(dob.evaluate({ dateOfBirth: '2000-01-01' }, ctx)).toEqual({
      datePresent: true,
      isValidDate: true,
      isAdult: true,
    });
  });

  it('marks a minor as not adult', () => {
    expect(dob.evaluate({ dateOfBirth: '2010-06-01' }, ctx).isAdult).toBe(false);
  });

  it('treats exactly-18 as adult and one day short as not', () => {
    expect(dob.evaluate({ dateOfBirth: '2008-07-02' }, ctx).isAdult).toBe(true);
    expect(dob.evaluate({ dateOfBirth: '2008-07-03' }, ctx).isAdult).toBe(false);
  });

  it('rejects impossible and future dates', () => {
    expect(dob.evaluate({ dateOfBirth: '2023-13-40' }, ctx).isValidDate).toBe(false);
    expect(dob.evaluate({ dateOfBirth: '2030-01-01' }, ctx).isValidDate).toBe(false);
  });

  it('handles a missing DOB', () => {
    expect(dob.evaluate({ dateOfBirth: null }, ctx)).toEqual({
      datePresent: false,
      isValidDate: false,
      isAdult: false,
    });
  });
});

describe('validity rule', () => {
  it('validates a non-expired passport', () => {
    expect(
      validity.evaluate({ validityDate: '2030-01-01', documentType: 'PASSPORT' }, ctx),
    ).toEqual({ notApplicable: false, isValid: true });
  });

  it('fails an expired passport', () => {
    expect(
      validity.evaluate({ validityDate: '2020-01-01', documentType: 'PASSPORT' }, ctx).isValid,
    ).toBe(false);
  });

  it('marks validity not applicable (pass) for PAN', () => {
    expect(validity.evaluate({ validityDate: null, documentType: 'PAN' }, ctx)).toEqual({
      notApplicable: true,
      isValid: true,
    });
  });
});

describe('mothersName rule', () => {
  it('requires mothers name on a passport', () => {
    expect(motherName.evaluate({ mothersName: 'Sita Devi', documentType: 'PASSPORT' })).toEqual({
      notApplicable: false,
      isPresent: true,
    });
    expect(motherName.evaluate({ mothersName: null, documentType: 'PASSPORT' }).isPresent).toBe(
      false,
    );
  });

  it('is not applicable for Aadhaar', () => {
    expect(motherName.evaluate({ mothersName: null, documentType: 'AADHAAR' })).toEqual({
      notApplicable: true,
      isPresent: true,
    });
  });
});

describe('address rule', () => {
  it('accepts a plausible Indian address', () => {
    const a = '12 MG Road, Bengaluru, Karnataka 560001';
    expect(address.evaluate({ address: a })).toEqual({
      isPresent: true,
      isValidIndianAddress: true,
    });
  });

  it('rejects an address with no PIN or state', () => {
    expect(address.evaluate({ address: 'somewhere nice' }).isValidIndianAddress).toBe(false);
  });

  it('handles a missing address', () => {
    expect(address.evaluate({ address: null })).toEqual({
      isPresent: false,
      isValidIndianAddress: false,
    });
  });
});

describe('documentType rule', () => {
  it('recognizes valid types and rejects others', () => {
    expect(documentType.evaluate({ documentType: 'PAN' }).isRecognized).toBe(true);
    expect(documentType.evaluate({ documentType: 'VOTER_ID' }).isRecognized).toBe(false);
    expect(documentType.evaluate({ documentType: null }).isRecognized).toBe(false);
  });
});

describe('runRules aggregate', () => {
  const validPassport: Extracted = {
    documentNumber: 'A1234567',
    name: 'Rahul Kumar',
    dateOfBirth: '1990-05-05',
    address: '12 MG Road, Bengaluru, Karnataka 560001',
    mothersName: 'Sita Devi',
    validityDate: '2030-01-01',
    documentType: 'PASSPORT',
  };

  it('passes for a fully valid passport', () => {
    const res = runRules(validPassport, ctx);
    expect(res.passed).toBe(true);
    expect(res.checks.every((c) => !c.applicable || c.passed)).toBe(true);
  });

  it('fails when a required field is missing', () => {
    const res = runRules({ ...validPassport, mothersName: null }, ctx);
    expect(res.passed).toBe(false);
  });

  it('excludes not-applicable checks from the pass decision', () => {
    const pan: Extracted = {
      documentNumber: 'ABCDE1234F',
      name: 'Rahul Kumar',
      dateOfBirth: '1990-05-05',
      address: '12 MG Road, Bengaluru, Karnataka 560001',
      mothersName: null,
      validityDate: null,
      documentType: 'PAN',
    };
    const res = runRules(pan, ctx);
    expect(res.passed).toBe(true);
    expect(res.results.validity.notApplicable).toBe(true);
    expect(res.results.mothersName.notApplicable).toBe(true);
  });
});
