/**
 * Sentry server-side init (Node runtime).
 * Loaded via `instrumentation.ts` on Next.js 16.
 *
 * Contract (design-doc §16):
 *   - Errors only — tracesSampleRate: 0
 *   - beforeSend strips PII + drops /api/sentry-test in production
 *   - Environment tag resolved via KALORI_ENV ?? NEXT_PUBLIC_VERCEL_ENV ?? VERCEL_ENV ?? 'development'
 */
import * as Sentry from '@sentry/nextjs';
import { createBeforeSend } from '@/lib/sentry/before-send';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment:
    process.env.KALORI_ENV ??
    process.env.NEXT_PUBLIC_VERCEL_ENV ??
    process.env.VERCEL_ENV ??
    'development',
  tracesSampleRate: 0,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  beforeSend: createBeforeSend(),
});
