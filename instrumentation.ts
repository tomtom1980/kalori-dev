/**
 * Next.js 16 instrumentation entry point.
 * Dispatches Sentry init to the correct runtime config file.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
}

export { captureRequestError as onRequestError } from '@sentry/nextjs';
