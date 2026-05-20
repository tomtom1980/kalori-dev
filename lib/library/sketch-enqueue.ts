/**
 * Sketch generation enqueue helper — Bug 5 (library overhaul 2026-05-16).
 *
 * Routes the deferred sketch generation through `waitUntil` so the HTTP
 * response returns immediately and the sketch pipeline runs out-of-band.
 *
 * Importing this thin module (instead of inlining `waitUntil` at each
 * call site) gives tests a single mockable surface and keeps the route
 * handlers free of `@vercel/functions` imports they would otherwise
 * have to stub individually.
 *
 * The pipeline lives in `lib/library/sketch-pipeline.ts` (network +
 * upload + UPDATE). The enqueue helper invokes it via a server-side
 * function call — NOT an internal HTTP round trip — because:
 *   - The route handler we'd otherwise hit (`/api/library/sketch/generate`)
 *     adds an extra hop that doesn't earn its cost in a single-user MVP.
 *   - The pipeline runs with the SAME server Supabase client; no auth
 *     cookie round-trip needed.
 *
 * The /generate route is still exposed for manual retries from the UI
 * and for backfill orchestration.
 *
 * Mechanism: `after()` from `next/server` is the Next.js 16 native
 * deferred-execution primitive. On Vercel it maps to the platform's
 * `waitUntil` lifecycle; in `next dev` it runs after the response is
 * sent. Either way the HTTP response returns before the sketch
 * pipeline resolves.
 */
// NOTE: this module ultimately reaches the server-only sketch pipeline
// (which imports `server-only` itself, plus `sharp`). Do not import from
// a client file — the build will fail.
//
// The pipeline is loaded LAZILY (`await import(...)` inside the
// deferred callback) so test files that don't need the pipeline can
// import the route handler without mocking `server-only`. The actual
// module evaluation only happens after `after()` schedules the work,
// by which point we're well past route-handler module init.
import { after } from 'next/server';

/**
 * Fire-and-forget enqueue. The promise is handed to `waitUntil` so the
 * Vercel runtime keeps the function alive long enough for the sketch to
 * finish, but does NOT block the HTTP response.
 *
 * Errors inside the pipeline are swallowed (logged via Sentry inside
 * the pipeline itself). A failure path bumps `sketch_attempt_count` +
 * sets `sketch_last_error`; the next /generate call (manual retry or
 * backfill) picks up from there.
 */
export function enqueueSketchGeneration(args: {
  libraryItemId: string;
  userId: string;
  displayName: string;
  /**
   * Optional free-text description (user input or AI reasoning).
   * Forwarded to the prompt builder so Gemini gets richer cues than the
   * bare display name. Capped to 500 chars inside the prompt builder.
   */
  description?: string | undefined;
  timezone?: string | undefined;
}): void {
  // Skip in test mode — fixture mode is owned by the route tests.
  if (process.env.NODE_ENV === 'test' || process.env.KALORI_SKETCH_DISABLED === '1') {
    return;
  }
  after(async () => {
    try {
      const { runSketchPipeline } = await import('./sketch-pipeline');
      await runSketchPipeline(args);
    } catch {
      // Errors are captured + persisted inside runSketchPipeline. The
      // outer try/catch is required only so the rejection doesn't
      // surface as an unhandled-promise warning in serverless logs.
    }
  });
}
