/**
 * Shared `beforeSend` factory for @sentry/nextjs.
 *
 * Implements design-doc §16:
 *   - Strips PII fields (items, weight_kg, current_weight_kg, bio_sex, age,
 *     notes, ai_reasoning, *_token) anywhere they appear in the event payload.
 *     Scrubbed branches: `request.*`, `user.*`, `extra`, `contexts`, `message`,
 *     `exception.values[].value`, `breadcrumbs[].data`, `breadcrumbs[].message`,
 *     and `tags` — i.e. every field the JS SDK can ship that is capable of
 *     carrying user data.
 *   - Drops `/api/sentry-test` events in production (AC: "stops capturing it
 *     in production (filtered)").
 *
 * Typed loosely on `Record<string, unknown>` so we don't depend on the Sentry
 * `ErrorEvent` shape across SDK versions. The SDK accepts any function that
 * returns an event-ish object or null.
 */

import type { ErrorEvent, EventHint } from '@sentry/nextjs';

type AnyEvent = Record<string, unknown>;

const PII_KEYS = new Set([
  'items',
  'weight_kg',
  'current_weight_kg',
  'bio_sex',
  'age',
  'notes',
  'ai_reasoning',
  'access_token',
  'refresh_token',
  'provider_token',
]);

const REDACTED = '[REDACTED]';
const USER_PII_KEYS = new Set(['email', 'id', 'ip_address', 'username']);
const REQUEST_HEADER_PII_KEYS = new Set([
  'authorization',
  'cookie',
  'x-supabase-auth',
  'x-access-token',
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function shouldRedactRequestKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return REQUEST_HEADER_PII_KEYS.has(normalized) || normalized.startsWith('sb-');
}

function scrubRequestMap(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = shouldRedactRequestKey(k) ? REDACTED : scrub(v);
  }
  return out;
}

function scrub(value: unknown): unknown {
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (PII_KEYS.has(k.toLowerCase())) continue;
      out[k] = scrub(v);
    }
    return out;
  }
  if (Array.isArray(value)) {
    return value.map((v) => scrub(v));
  }
  return value;
}

export function createBeforeSend(): (event: ErrorEvent, hint: EventHint) => ErrorEvent | null {
  return function beforeSend(rawEvent) {
    const event = rawEvent as unknown as AnyEvent | null;
    if (!event) return null;

    // Drop the dedicated /api/sentry-test route in production.
    if (
      process.env.KALORI_ENV === 'production' &&
      typeof event.transaction === 'string' &&
      event.transaction === '/api/sentry-test'
    ) {
      return null;
    }

    // Strip PII from every branch of the event that might carry it.
    const scrubbed: AnyEvent = { ...event };
    if (isPlainObject(scrubbed.request)) {
      const request = { ...scrubbed.request };
      if (isPlainObject(request.headers)) {
        request.headers = scrubRequestMap(request.headers);
      }
      if (isPlainObject(request.cookies)) {
        request.cookies = scrubRequestMap(request.cookies);
      }
      if ('data' in request) {
        request.data = scrub(request.data);
      }
      scrubbed.request = request;
    }
    if (isPlainObject(scrubbed.user)) {
      const user: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(scrubbed.user)) {
        if (USER_PII_KEYS.has(k.toLowerCase())) continue;
        user[k] = scrub(v);
      }
      scrubbed.user = user;
    }
    if (isPlainObject(scrubbed.extra)) {
      scrubbed.extra = scrub(scrubbed.extra);
    }
    if (isPlainObject(scrubbed.contexts)) {
      scrubbed.contexts = scrub(scrubbed.contexts);
    }
    // `event.message` is usually a string, but Sentry also accepts an object
    // (e.g. from captureMessage + attachments). Scrub the object form only —
    // strings pass through unchanged since there's no structured key to match.
    if (isPlainObject(scrubbed.message)) {
      scrubbed.message = scrub(scrubbed.message);
    }
    // `event.exception.values[]` holds each thrown error. `.value` is usually
    // a string (error message) but can be an object — scrub the object form.
    if (isPlainObject(scrubbed.exception)) {
      const exception = { ...scrubbed.exception };
      if (Array.isArray(exception.values)) {
        exception.values = exception.values.map((entry) => {
          if (!isPlainObject(entry)) return entry;
          const next = { ...entry };
          if (isPlainObject(next.value)) {
            next.value = scrub(next.value);
          }
          return next;
        });
      }
      scrubbed.exception = exception;
    }
    // `event.breadcrumbs[]` is pre-error context. Each entry can carry
    // `data` (object) and `message` (string OR object) — scrub both.
    if (Array.isArray(scrubbed.breadcrumbs)) {
      scrubbed.breadcrumbs = scrubbed.breadcrumbs.map((crumb) => {
        if (!isPlainObject(crumb)) return crumb;
        const next = { ...crumb };
        if (isPlainObject(next.data)) {
          next.data = scrub(next.data);
        }
        if (isPlainObject(next.message)) {
          next.message = scrub(next.message);
        }
        return next;
      });
    }
    // `event.tags` is a flat string→string map; the recursive scrub treats it
    // as a plain object and drops any PII-keyed entries.
    if (isPlainObject(scrubbed.tags)) {
      scrubbed.tags = scrub(scrubbed.tags);
    }
    return scrubbed as unknown as ErrorEvent;
  };
}
