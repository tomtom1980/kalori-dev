import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getDeviceTimeZone,
  isValidTimeZone,
  normalizeProfileTimezone,
  normalizeTimeZone,
} from '@/lib/time/device-timezone';

// Hoisted Sentry stub so we can assert capture sites (Codex R2 Finding 2).
const captureExceptionMock = vi.hoisted(() => vi.fn());
vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
}));

describe('device timezone helpers', () => {
  it('validates IANA timezone identifiers', () => {
    expect(isValidTimeZone('America/Los_Angeles')).toBe(true);
    expect(isValidTimeZone('Asia/Bangkok')).toBe(true);
    expect(isValidTimeZone('not-a-timezone')).toBe(false);
  });

  it('normalizes invalid values to a valid fallback', () => {
    expect(normalizeTimeZone('Europe/London')).toBe('Europe/London');
    expect(normalizeTimeZone('', 'America/New_York')).toBe('America/New_York');
    expect(normalizeTimeZone('bad-zone', 'UTC')).toBe('UTC');
  });

  it('returns a valid timezone from the current JS runtime', () => {
    expect(isValidTimeZone(getDeviceTimeZone('UTC'))).toBe(true);
  });
});

describe('normalizeProfileTimezone — Codex R2 Finding 2 (MEDIUM)', () => {
  beforeEach(() => {
    captureExceptionMock.mockClear();
  });

  it('returns a valid IANA timezone unchanged (no Sentry capture)', () => {
    expect(normalizeProfileTimezone('Asia/Bangkok')).toBe('Asia/Bangkok');
    expect(normalizeProfileTimezone('America/Los_Angeles')).toBe('America/Los_Angeles');
    expect(normalizeProfileTimezone('UTC')).toBe('UTC');
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('returns UTC + captures Sentry for a malformed string', () => {
    expect(normalizeProfileTimezone('NotARealZone/Bogus')).toBe('UTC');
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const call = captureExceptionMock.mock.calls[0]!;
    expect((call[0] as Error).message).toBe('invalid_profile_timezone');
    const ctx = call[1] as { tags: Record<string, string>; extra: Record<string, unknown> };
    expect(ctx.tags.component).toBe('profile-timezone');
    expect(ctx.tags.invalid_tz).toBe('NotARealZone/Bogus');
    expect(ctx.extra.rawValue).toBe('NotARealZone/Bogus');
  });

  it('returns UTC for null WITHOUT firing Sentry (expected pre-onboarding state)', () => {
    expect(normalizeProfileTimezone(null)).toBe('UTC');
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('returns UTC for undefined WITHOUT firing Sentry (expected pre-onboarding state)', () => {
    expect(normalizeProfileTimezone(undefined)).toBe('UTC');
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('returns UTC for empty string WITHOUT firing Sentry (expected pre-onboarding state)', () => {
    expect(normalizeProfileTimezone('')).toBe('UTC');
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('returns UTC + captures Sentry for non-string types (number, object, boolean)', () => {
    expect(normalizeProfileTimezone(42)).toBe('UTC');
    expect(normalizeProfileTimezone({ foo: 'bar' })).toBe('UTC');
    expect(normalizeProfileTimezone(true)).toBe('UTC');
    expect(captureExceptionMock).toHaveBeenCalledTimes(3);
    // Tag encodes typeof for non-string variants so operators can audit.
    const tagsForCalls = captureExceptionMock.mock.calls.map(
      (c) => (c[1] as { tags: Record<string, string> }).tags.invalid_tz,
    );
    expect(tagsForCalls).toContain('<number>');
    expect(tagsForCalls).toContain('<object>');
    expect(tagsForCalls).toContain('<boolean>');
  });

  it('honours custom fallback when provided', () => {
    expect(normalizeProfileTimezone('badzone', { fallback: 'America/New_York' })).toBe(
      'America/New_York',
    );
  });

  it('propagates sentryTag + userId into capture context', () => {
    normalizeProfileTimezone('badzone', { sentryTag: 'log-now', userId: 'u-xyz' });
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const ctx = captureExceptionMock.mock.calls[0]![1] as {
      tags: Record<string, string>;
      extra: Record<string, unknown>;
    };
    expect(ctx.tags.scope).toBe('log-now');
    expect(ctx.extra.userId).toBe('u-xyz');
  });

  it('does NOT throw when Sentry transport fails (resilient helper contract)', () => {
    captureExceptionMock.mockImplementationOnce(() => {
      throw new Error('sentry transport failed');
    });
    expect(() => normalizeProfileTimezone('badzone')).not.toThrow();
    // It still returns the fallback.
    expect(normalizeProfileTimezone('badzone')).toBe('UTC');
  });
});
