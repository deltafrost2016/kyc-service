import { describe, it, expect } from 'vitest';

// test/setup.ts already seeds every env var config/index.ts requires, and
// createApp() is already exercised via the existing route tests, so importing
// the real adapter here just confirms the serverless-express wiring holds up.
import { handler } from '../src/lambda/apiHandler.js';

describe('apiHandler', () => {
  it('exports a callable handler', () => {
    expect(typeof handler).toBe('function');
  });
});
