'use client';

/**
 * <SrLiveRegions /> — Task 3.4 chrome-level shared sr-only ARIA live regions.
 *
 * Two regions per synthesis §2.12:
 *   - `#kalori-live-polite` — toast saved/copied/restored, 8s "still looking…".
 *   - `#kalori-live-assertive` — save errors, undo failures, session-expired.
 *
 * Mounted ONCE inside the (app) layout chrome alongside `<UndoToastMount />`.
 * Consumers route announcement copy through the appropriate region; the
 * toast's own `role="status"` is a belt-and-braces redundancy on the visual
 * node so a screen reader user who has the chrome region muted still hears
 * the toast on focus.
 */
export function SrLiveRegions() {
  return (
    <>
      <div
        id="kalori-live-polite"
        data-testid="sr-live-polite"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
      <div
        id="kalori-live-assertive"
        data-testid="sr-live-assertive"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      />
    </>
  );
}

export default SrLiveRegions;
