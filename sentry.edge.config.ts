/**
 * Sentry Edge runtime init — matches server scrubbing.
 * Environment tag resolved via KALORI_ENV ?? NEXT_PUBLIC_VERCEL_ENV ?? VERCEL_ENV ?? 'development'.
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
