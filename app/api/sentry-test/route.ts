/**
 * Dev-only Sentry smoke endpoint.
 * Throws a labelled error so Sentry captures it in development.
 * `beforeSend` drops this event's transaction in production (design-doc §16).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(): Response {
  if (process.env.NODE_ENV === 'production') {
    return new Response(null, { status: 404 });
  }

  throw new Error('kalori:sentry-test');
}
