/**
 * Sentry client-side init (browser runtime).
 * Next.js 16 pattern: `instrumentation-client.ts` runs on client bootstrap.
 *
 * Environment resolution (client only sees NEXT_PUBLIC_* vars at build time):
 *   1. NEXT_PUBLIC_KALORI_ENV — Kalori-specific override (mirrors KALORI_ENV)
 *   2. NEXT_PUBLIC_VERCEL_ENV — auto-injected by Vercel (preview / production)
 *   3. 'development' — local fallback
 * Without this fallback, the client bundle gets `environment: undefined`
 * and Sentry silently tags events as `production`.
 */
import * as Sentry from '@sentry/nextjs';
import { createBeforeSend } from '@/lib/sentry/before-send';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment:
    process.env.NEXT_PUBLIC_KALORI_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
  tracesSampleRate: 0,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  beforeSend: createBeforeSend(),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
