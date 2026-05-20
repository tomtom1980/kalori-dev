/**
 * Tests for the Sentry `beforeSend` factory.
 *
 * Scope of THIS test file: the EPIPE (Node stdio pipe-closed) filter added
 * 2026-05-17. Drop these events at the beforeSend gate so dev-server
 * shutdown noise (parent terminal closes mid-write, etc.) never reaches
 * Sentry. EPIPE on stdout/stderr never represents an application bug.
 *
 * PII scrubbing already covered structurally by `before-send.ts` itself —
 * not re-tested here.
 */
import type { ErrorEvent, EventHint } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';

import { createBeforeSend } from '@/lib/sentry/before-send';

const HINT = {} as EventHint;

function eventWithExceptionValue(value: string): ErrorEvent {
  return {
    exception: {
      values: [{ type: 'Error', value }],
    },
  } as unknown as ErrorEvent;
}

describe('createBeforeSend — EPIPE / stdio pipe filter', () => {
  const beforeSend = createBeforeSend();

  it('drops EPIPE broken-pipe errors (Node stdout write after parent close)', () => {
    const event = eventWithExceptionValue('EPIPE: broken pipe, write');
    expect(beforeSend(event, HINT)).toBeNull();
  });

  it('drops EPIPE regardless of trailing payload', () => {
    const event = eventWithExceptionValue('EPIPE: broken pipe, write to fd 1');
    expect(beforeSend(event, HINT)).toBeNull();
  });

  it('preserves ECONNRESET — that signal often reflects a real upstream socket drop and should still page', () => {
    const event = eventWithExceptionValue('ECONNRESET: socket hang up');
    expect(beforeSend(event, HINT)).not.toBeNull();
  });

  it('preserves normal application errors', () => {
    const event = eventWithExceptionValue('Cannot read property "x" of undefined');
    const result = beforeSend(event, HINT);
    expect(result).not.toBeNull();
    expect(result?.exception?.values?.[0]?.value).toBe('Cannot read property "x" of undefined');
  });

  it('passes through events that have no exception (e.g., captureMessage calls)', () => {
    const event = { message: 'plain log message' } as unknown as ErrorEvent;
    expect(beforeSend(event, HINT)).not.toBeNull();
  });
});
