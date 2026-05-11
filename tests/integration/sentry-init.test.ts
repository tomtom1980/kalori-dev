/**
 * Integration test: Sentry init contract.
 *
 * Kalori is errors-only (design-doc §16):
 *   - Must pass `environment: process.env.KALORI_ENV` to Sentry.init
 *   - Must register a `beforeSend` filter that strips PII fields
 *   - `tracesSampleRate` must be 0 (no perf)
 *   - No `replayIntegration` / no `@sentry/replay` load
 *
 * We mock `@sentry/nextjs` and then import the server-side Sentry config,
 * which must invoke `Sentry.init(...)` at import time with the above shape.
 *
 * This test is at the integration level because it crosses the config
 * file boundary and asserts real SDK API calls.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mock of @sentry/nextjs
const initSpy = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  init: initSpy,
}));

const ORIGINAL_ENV = { ...process.env };

describe('sentry.server.config.ts', () => {
  beforeEach(() => {
    initSpy.mockReset();
    vi.resetModules();
    process.env.KALORI_ENV = 'production';
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';
  });

  afterEach(() => {
    vi.resetModules();
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('calls Sentry.init with environment from KALORI_ENV, no tracing, and a beforeSend filter', async () => {
    await import('../../sentry.server.config');

    expect(initSpy).toHaveBeenCalledOnce();
    const arg = initSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg).toBeDefined();
    expect(arg.environment).toBe('production');
    expect(arg.dsn).toBeTruthy();
    // Errors-only: no tracing
    expect(arg.tracesSampleRate ?? 0).toBe(0);
    // beforeSend present
    expect(typeof arg.beforeSend).toBe('function');
  });

  it('beforeSend drops the /api/sentry-test event in production', async () => {
    process.env.KALORI_ENV = 'production';
    await import('../../sentry.server.config');
    const arg = initSpy.mock.calls[0]?.[0] as { beforeSend: (event: unknown) => unknown };
    const result = arg.beforeSend({
      transaction: '/api/sentry-test',
      request: { data: 'something' },
    });
    expect(result).toBeNull();
  });

  it('beforeSend lets /api/sentry-test events through in development', async () => {
    vi.resetModules();
    initSpy.mockReset();
    process.env.KALORI_ENV = 'development';
    await import('../../sentry.server.config');
    const arg = initSpy.mock.calls[0]?.[0] as { beforeSend: (event: unknown) => unknown };
    const result = arg.beforeSend({
      transaction: '/api/sentry-test',
    });
    expect(result).not.toBeNull();
  });

  it('beforeSend scrubs PII fields from the event payload', async () => {
    vi.resetModules();
    initSpy.mockReset();
    process.env.KALORI_ENV = 'development';
    await import('../../sentry.server.config');
    const arg = initSpy.mock.calls[0]?.[0] as {
      beforeSend: (event: Record<string, unknown>) => Record<string, unknown> | null;
    };
    const event = {
      transaction: '/api/entries/save',
      request: {
        data: {
          items: [{ name: 'pho bo', kcal: 450 }],
          weight_kg: 72.4,
          current_weight_kg: 72.4,
          bio_sex: 'male',
          age: 34,
          notes: 'skipped breakfast',
          ai_reasoning: 'classical pho with beef',
          keep_me: 'ok',
        },
      },
      extra: {
        items: ['should be stripped'],
      },
    };
    const out = arg.beforeSend(event);
    expect(out).not.toBeNull();
    const outData = (out?.request as { data?: Record<string, unknown> } | undefined)?.data ?? {};
    expect(outData.items).toBeUndefined();
    expect(outData.weight_kg).toBeUndefined();
    expect(outData.current_weight_kg).toBeUndefined();
    expect(outData.bio_sex).toBeUndefined();
    expect(outData.age).toBeUndefined();
    expect(outData.notes).toBeUndefined();
    expect(outData.ai_reasoning).toBeUndefined();
    expect(outData.keep_me).toBe('ok');
    const outExtra = (out?.extra as Record<string, unknown> | undefined) ?? {};
    expect(outExtra.items).toBeUndefined();
  });

  it('beforeSend redacts identity fields and auth tokens from request metadata', async () => {
    vi.resetModules();
    initSpy.mockReset();
    process.env.KALORI_ENV = 'development';
    await import('../../sentry.server.config');
    const arg = initSpy.mock.calls[0]?.[0] as {
      beforeSend: (event: Record<string, unknown>) => Record<string, unknown> | null;
    };

    const out = arg.beforeSend({
      transaction: '/api/profile/save',
      user: {
        email: 'user@example.com',
        id: 'user-123',
        ip_address: '127.0.0.1',
        username: 'kalori-user',
      },
      request: {
        headers: {
          Authorization: 'Bearer secret',
          Cookie: 'sb-access-token=secret; theme=dark',
          'X-Supabase-Auth': 'supabase-secret',
          'x-access-token': 'access-secret',
          'X-Trace-Id': 'trace-123',
        },
        cookies: {
          'sb-access-token': 'secret',
          'SB-REFRESH-TOKEN': 'refresh-secret',
          session: 'ok',
        },
        data: {
          access_token: 'secret',
          refresh_token: 'refresh-secret',
          provider_token: 'provider-secret',
          keep_me: 'ok',
        },
      },
    });

    expect(out).not.toBeNull();
    expect(out?.user).toEqual({});

    const request = (out?.request as Record<string, unknown> | undefined) ?? {};
    expect(request.headers).toEqual({
      Authorization: '[REDACTED]',
      Cookie: '[REDACTED]',
      'X-Supabase-Auth': '[REDACTED]',
      'x-access-token': '[REDACTED]',
      'X-Trace-Id': 'trace-123',
    });
    expect(request.cookies).toEqual({
      'sb-access-token': '[REDACTED]',
      'SB-REFRESH-TOKEN': '[REDACTED]',
      session: 'ok',
    });
    expect(request.data).toEqual({
      keep_me: 'ok',
    });
  });

  it('beforeSend scrubs PII from event.message strings wrapped as templates', async () => {
    vi.resetModules();
    initSpy.mockReset();
    process.env.KALORI_ENV = 'development';
    await import('../../sentry.server.config');
    const arg = initSpy.mock.calls[0]?.[0] as {
      beforeSend: (event: Record<string, unknown>) => Record<string, unknown> | null;
    };

    // When Sentry receives a logMessage event, `message` may be a string or
    // an object. Both forms must have PII keys scrubbed from the object form.
    const out = arg.beforeSend({
      message: {
        formatted: 'captured at top-level',
        items: [{ name: 'pho bo', kcal: 450 }],
        weight_kg: 72.4,
        keep_me: 'ok',
      },
    });
    expect(out).not.toBeNull();
    const message = (out?.message as Record<string, unknown> | undefined) ?? {};
    expect(message.items).toBeUndefined();
    expect(message.weight_kg).toBeUndefined();
    expect(message.keep_me).toBe('ok');
    expect(message.formatted).toBe('captured at top-level');
  });

  it('beforeSend scrubs PII from exception.values[].value payload objects', async () => {
    vi.resetModules();
    initSpy.mockReset();
    process.env.KALORI_ENV = 'development';
    await import('../../sentry.server.config');
    const arg = initSpy.mock.calls[0]?.[0] as {
      beforeSend: (event: Record<string, unknown>) => Record<string, unknown> | null;
    };

    const out = arg.beforeSend({
      exception: {
        values: [
          {
            type: 'ZodError',
            value: {
              message: 'parse failed',
              items: [{ name: 'pho bo' }],
              access_token: 'secret',
              ai_reasoning: 'classical pho with beef',
              keep_me: 'ok',
            },
          },
          {
            type: 'TypeError',
            value: 'string values pass through unchanged',
          },
        ],
      },
    });

    expect(out).not.toBeNull();
    const values = (out?.exception as { values?: unknown[] } | undefined)?.values ?? [];
    const firstValue = (values[0] as { value?: Record<string, unknown> } | undefined)?.value ?? {};
    expect(firstValue.items).toBeUndefined();
    expect(firstValue.access_token).toBeUndefined();
    expect(firstValue.ai_reasoning).toBeUndefined();
    expect(firstValue.keep_me).toBe('ok');
    expect(firstValue.message).toBe('parse failed');
    // String values still pass through.
    expect((values[1] as { value?: unknown } | undefined)?.value).toBe(
      'string values pass through unchanged',
    );
  });

  it('beforeSend scrubs PII from breadcrumbs[].data + breadcrumbs[].message', async () => {
    vi.resetModules();
    initSpy.mockReset();
    process.env.KALORI_ENV = 'development';
    await import('../../sentry.server.config');
    const arg = initSpy.mock.calls[0]?.[0] as {
      beforeSend: (event: Record<string, unknown>) => Record<string, unknown> | null;
    };

    const out = arg.beforeSend({
      breadcrumbs: [
        {
          category: 'fetch',
          message: {
            url: '/api/entries/save',
            items: [{ name: 'pho bo' }],
            access_token: 'secret',
            keep_me: 'ok',
          },
          data: {
            weight_kg: 72.4,
            notes: 'skipped breakfast',
            bio_sex: 'male',
            age: 34,
            url: '/api/entries/save',
          },
        },
        {
          category: 'navigation',
          message: 'plain string breadcrumb unchanged',
          data: { from: '/', to: '/dashboard' },
        },
      ],
    });

    expect(out).not.toBeNull();
    const breadcrumbs = (out?.breadcrumbs as unknown[] | undefined) ?? [];
    const firstData =
      (breadcrumbs[0] as { data?: Record<string, unknown> } | undefined)?.data ?? {};
    expect(firstData.weight_kg).toBeUndefined();
    expect(firstData.notes).toBeUndefined();
    expect(firstData.bio_sex).toBeUndefined();
    expect(firstData.age).toBeUndefined();
    expect(firstData.url).toBe('/api/entries/save');

    const firstMessage =
      (breadcrumbs[0] as { message?: Record<string, unknown> } | undefined)?.message ?? {};
    expect(firstMessage.items).toBeUndefined();
    expect(firstMessage.access_token).toBeUndefined();
    expect(firstMessage.keep_me).toBe('ok');

    // String breadcrumb messages are passed through unchanged.
    expect((breadcrumbs[1] as { message?: unknown } | undefined)?.message).toBe(
      'plain string breadcrumb unchanged',
    );
    expect((breadcrumbs[1] as { data?: Record<string, unknown> } | undefined)?.data).toEqual({
      from: '/',
      to: '/dashboard',
    });
  });

  it('beforeSend scrubs PII keys from the event.tags object', async () => {
    vi.resetModules();
    initSpy.mockReset();
    process.env.KALORI_ENV = 'development';
    await import('../../sentry.server.config');
    const arg = initSpy.mock.calls[0]?.[0] as {
      beforeSend: (event: Record<string, unknown>) => Record<string, unknown> | null;
    };

    const out = arg.beforeSend({
      tags: {
        route: '/dashboard',
        weight_kg: '72.4',
        bio_sex: 'male',
        age: '34',
        access_token: 'secret',
        refresh_token: 'secret',
        feature_flag: 'meal_bulletin_v2',
      },
    });

    expect(out).not.toBeNull();
    const tags = (out?.tags as Record<string, unknown> | undefined) ?? {};
    expect(tags.weight_kg).toBeUndefined();
    expect(tags.bio_sex).toBeUndefined();
    expect(tags.age).toBeUndefined();
    expect(tags.access_token).toBeUndefined();
    expect(tags.refresh_token).toBeUndefined();
    expect(tags.route).toBe('/dashboard');
    expect(tags.feature_flag).toBe('meal_bulletin_v2');
  });
});
