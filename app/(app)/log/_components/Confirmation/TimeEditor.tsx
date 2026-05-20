'use client';

/**
 * `Confirmation.TimeEditor` — Task C.5 (F-VERIFY-203 fix).
 *
 * Surfaces the PRD §3.5 "Time editor (defaults to now; backfill allowed up to
 * 30 days per blueprint §9)" affordance as a compound child of
 * `<ConfirmationScreen />`. Renders between MealSlot and SaveToLibraryToggle
 * per PRD §3.5 ordering: "Meal category selector → Time editor →
 * Save-to-library toggle".
 *
 * Component pattern (per task-C5-ui-design-lead.md §2): native
 * `<input type="datetime-local">`. Zero bundle cost. Browser-native a11y +
 * locale-aware date format + iOS bottom-sheet wheel picker / Android dialog
 * picker / desktop calendar dropdown. Chosen verbatim from the F-VERIFY-203
 * suggested-fix recommendation and the design-lead Quick-Pick decision.
 *
 * Timezone semantics:
 *   - `state.loggedAt` is canonical UTC ISO ('YYYY-MM-DDTHH:mm:ss.sssZ').
 *   - `<input type="datetime-local">` value is browser-LOCAL 'YYYY-MM-DDTHH:mm'.
 *   - On render: convert UTC ISO → local-time slice via Date arithmetic.
 *   - On change: parse local-time string via `new Date(...)`, take `.toISOString()`.
 *   - `min` / `max` attributes are in local-time slice format.
 *   The conversion happens at the input boundary; the reducer never sees
 *   anything but UTC ISO. (design-lead §12 risk #6 explicit guidance.)
 *
 * Sibling-style alignment (briefing §5 reconciliation rule): ConfirmationScreen
 * was NOT touched by commit `224b5ed` (modern radius/shadow migration), so its
 * sibling controls — `Confirmation.SaveToLibraryToggle`,
 * `Confirmation.MealSlot`, dropdowns — still render zero-radius / 1px-rule /
 * no-shadow Ledger styling. TimeEditor inherits those tokens via the
 * `kalori-confirmation-time-editor*` class hooks (defined alongside its
 * siblings in `app/globals.css`). Modern-migration tokens (`--radius-card`
 * etc.) are explicitly NOT used here.
 *
 * Defense-in-depth:
 *   - Client `min` attribute clamps the native picker to [now - 30d, now].
 *   - Server `'logged_at_too_old'` Zod-adjacent imperative guard in
 *     `app/api/entries/save/route.ts` rejects out-of-window submissions, with a
 *     2-minute grace buffer so the client's mount-pinned `min` stays valid
 *     under realistic mount-to-submit delay (Codex R1 Finding #1).
 *   - `setLoggedAt` callback (in ConfirmationScreen.tsx) refuses to dispatch
 *     unparseable strings — keeps the reducer free of NaN-Date ISOs.
 *
 * Edit-path behaviour (Codex R1 Finding #2):
 *   - When `meta.isEditing` is truthy, the input is rendered READONLY +
 *     `aria-readonly="true"` + a swapped hint string explaining that time is
 *     not editable on existing entries. The edit-path PATCH body intentionally
 *     omits `logged_at` (out of C.5 scope), so allowing time edits would be a
 *     silent-drop bug. Future task may extend the PATCH contract if the UX
 *     contract changes.
 */
import { type JSX, useId, useState } from 'react';

import { useConfirmation } from '../ConfirmationScreen';
import { t } from '@/lib/i18n/en';

/** 30 days in ms — must mirror the server's `BACKFILL_WINDOW_MS`. */
const BACKFILL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * Convert a UTC ISO string to a browser-local `'YYYY-MM-DDTHH:mm'` slice
 * suitable for `<input type="datetime-local">` value/min/max attributes.
 *
 * NOT equivalent to `iso.slice(0, 16)` — that slices UTC and the input
 * displays it as local, off by the TZ offset. We construct the slice from
 * the Date's local components so the value round-trips through the picker
 * without drift (design-lead §12 risk #6).
 *
 * Returns empty string on NaN input.
 */
function isoToLocalSlice(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TimeEditor(): JSX.Element {
  const { state, actions, meta } = useConfirmation();
  const inputId = useId();
  const hintId = useId();

  const value = isoToLocalSlice(state.loggedAt);
  // Pin `Date.now()` at mount via lazy `useState` initializer — keeps the
  // render function pure (React Compiler `react-hooks/purity`) AND gives
  // both the `min`/`max` attributes and the outside-window check a single
  // consistent now snapshot. A Confirmation modal lives <60s typically;
  // server-side validation enforces the canonical bound at request receipt
  // (with a 30-second grace buffer) so minor client/server clock drift is benign.
  const [nowAtMount] = useState<number>(() => Date.now());
  const [futureError, setFutureError] = useState(false);
  const [validationMaxMs, setValidationMaxMs] = useState<number>(nowAtMount);
  const minMs = nowAtMount - BACKFILL_WINDOW_MS;
  const maxMs = nowAtMount;
  const minLocal = isoToLocalSlice(new Date(minMs).toISOString());
  const maxLocal = isoToLocalSlice(new Date(maxMs).toISOString());
  const loggedAtMs = Date.parse(state.loggedAt);
  // Codex R1 Finding #2 — suppress outsideWindow on edit-path. The user
  // cannot change the time anyway (readonly), so the error UI would be
  // misleading. Legacy entries >30d old must display their historical
  // timestamp without triggering aria-invalid + outsideWindow hint.
  const outsideWindow =
    !meta.isEditing &&
    Number.isFinite(loggedAtMs) &&
    (loggedAtMs < minMs || loggedAtMs > validationMaxMs);

  // Codex R1 Finding #4 — render the helper text ALWAYS-VISIBLE below the
  // input (not just on error) so the user sees the 30-day affordance before
  // they hit the boundary (error-prevention heuristic). Hint text is one of
  // three states:
  //   - edit-path (readonly): swap to edit-disabled hint
  //   - outsideWindow (create-path only): swap to outsideWindow hint
  //   - default: render the always-visible 30-day affordance hint
  const hintText = meta.isEditing
    ? t.log.confirmationTimeEditorEditDisabledHint
    : futureError
      ? t.log.confirmationFutureTimeError
      : outsideWindow
        ? t.log.confirmationTimeEditorOutsideWindow
        : t.log.confirmationTimeEditorHint;
  const hasTimeError = outsideWindow || futureError;
  const hintClassName = [
    'kalori-confirmation-time-editor-hint',
    hasTimeError && 'is-error',
    meta.isEditing && 'is-readonly',
  ]
    .filter(Boolean)
    .join(' ');
  const hintNode = (
    <span
      id={hintId}
      role="status"
      data-testid="confirmation-time-editor-hint"
      className={hintClassName}
    >
      {hintText}
    </span>
  );
  const setToCurrentTime = (): void => {
    if (meta.isEditing) return;
    const now = Date.now();
    setValidationMaxMs(Math.max(maxMs, now));
    setFutureError(false);
    actions.setLoggedAtFutureRejected(false);
    actions.setLoggedAt(new Date(now).toISOString());
  };

  return (
    <div className="kalori-confirmation-time-editor">
      <label
        htmlFor={inputId}
        className="kalori-confirmation-time-editor-kicker"
        data-testid="confirmation-time-editor-label"
      >
        {t.log.confirmationTimeEditorLabel}
      </label>
      {hasTimeError && hintNode}
      <input
        id={inputId}
        type="datetime-local"
        step="60"
        value={value}
        min={minLocal}
        max={maxLocal}
        readOnly={meta.isEditing}
        aria-readonly={meta.isEditing ? 'true' : undefined}
        aria-invalid={outsideWindow || futureError ? 'true' : undefined}
        aria-describedby={hintId}
        data-testid="confirmation-time-editor-input"
        className={['kalori-confirmation-time-editor-input', meta.isEditing && 'is-readonly']
          .filter(Boolean)
          .join(' ')}
        onChange={(e) => {
          // Codex R1 Finding #2 — readonly inputs should not dispatch state
          // updates even if the readOnly attribute is bypassed by a stray
          // script. The reducer is the source of truth.
          if (meta.isEditing) return;
          const localString = e.target.value;
          if (!localString) {
            setToCurrentTime();
            return;
          }
          const parsedMs = Date.parse(localString);
          if (!Number.isFinite(parsedMs)) return;
          if (parsedMs > Date.now()) {
            setFutureError(true);
            actions.setLoggedAtFutureRejected(true);
            return;
          }
          setValidationMaxMs(Math.max(maxMs, Date.now()));
          setFutureError(false);
          actions.setLoggedAtFutureRejected(false);
          actions.setLoggedAt(new Date(parsedMs).toISOString());
        }}
        onBlur={() => {
          if (meta.isEditing) return;
          setFutureError(false);
          actions.setLoggedAtFutureRejected(false);
        }}
      />
      {!meta.isEditing && (
        <button
          type="button"
          className="kalori-confirmation-time-editor-current"
          onClick={setToCurrentTime}
          aria-label={t.log.confirmationTimeEditorCurrentTime}
        >
          {t.log.confirmationTimeEditorCurrentTime}
        </button>
      )}
      {!hasTimeError && hintNode}
    </div>
  );
}
