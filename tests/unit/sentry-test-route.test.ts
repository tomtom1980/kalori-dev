import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = process.env.NODE_ENV;

afterEach(() => {
  process.env = { ...process.env, NODE_ENV: ORIGINAL_ENV };
  vi.resetModules();
});

describe('app/api/sentry-test/route.ts', () => {
  it('returns 404 in production', async () => {
    process.env = { ...process.env, NODE_ENV: 'production' };
    const route = await import('../../app/api/sentry-test/route');

    const response = route.GET();

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(404);
  });

  it('still throws the smoke-test error outside production', async () => {
    process.env = { ...process.env, NODE_ENV: 'development' };
    const route = await import('../../app/api/sentry-test/route');

    expect(() => route.GET()).toThrowError('kalori:sentry-test');
  });
});
