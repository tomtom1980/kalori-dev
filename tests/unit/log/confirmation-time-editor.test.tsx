/**
 * Task C.5 — `Confirmation.TimeEditor` compound child unit tests.
 *
 * AC coverage:
 *   - AC1 (`::default-now-and-renders`): renders inside Confirmation compound
 *     AND `state.loggedAt` defaults to `now()` within 1s tolerance.
 *   - AC5 (`::ledger-tokens-applied`): TimeEditor's border-radius matches its
 *     sibling `[data-testid="confirmation-save-to-library"]` switch's. This
 *     is the briefing §5 reconciliation rule — read the sibling at runtime,
 *     don't hardcode token literals. Robust to a future Confirmation-wide
 *     token migration.
 *   - `::clamps-31-days-past-on-client` (defensive): client `min` attribute
 *     reflects the 30-day window so the browser native picker prevents
 *     out-of-range selection (defense-in-depth alongside the server Zod).
 *
 * Origin: F-VERIFY-203 (verification-report.md §F-VERIFY-203, P1).
 * Compound API: extends ConfirmationScreen.tsx's existing 9-child Confirmation
 * export with a 10th child `TimeEditor`.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Confirmation, ConfirmationScreen } from '@/app/(app)/log/_components/ConfirmationScreen';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';
import { useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';

// Mock the refresh-interceptor — TimeEditor doesn't fetch but mounting the
// Confirmation compound exercises the same dedup-preflight path the other
// ConfirmationScreen tests stub.
const authFetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authFetch: (url: string, init?: RequestInit) => authFetch(url, init),
  authPost: vi.fn(),
  SessionExpiredError: class SE extends Error {},
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

const baseItems = [
  {
    name: 'eggs',
    portion: 2,
    unit: 'unit',
    kcal: 140,
    macros: { protein_g: 12, carbs_g: 1, fat_g: 10, fiber_g: 0 },
    micros: {},
    confidence: 0.9,
  },
];

describe('<Confirmation.TimeEditor />', () => {
  beforeEach(() => {
    authFetch.mockReset();
    authFetch.mockImplementation((url: string) => {
      if (url.includes('/api/library/dedup-check')) {
        return Promise.resolve(jsonResponse({ match: null }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    useLogFlowStore.getState().resetDraft();
    useUndoQueueStore.setState({ stack: [] });
  });

  afterEach(() => {
    useLogFlowStore.getState().resetDraft();
    useUndoQueueStore.setState({ stack: [] });
  });

  it('default-now-and-renders: mounts as Confirmation compound child with default value within 1s of now', () => {
    const before = Date.now();
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    const after = Date.now();

    const input = screen.getByTestId('confirmation-time-editor-input') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    // datetime-local emits `YYYY-MM-DDTHH:mm`; parse via Date (interpreted as
    // local time) then compare to the [before, after] window with a 1s
    // tolerance on the upper bound (AC1 contract).
    expect(input.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    const valueMs = new Date(input.value).getTime();
    expect(Number.isFinite(valueMs)).toBe(true);
    // datetime-local has minute precision, so allow ±60s either side of
    // the [before, after] window.
    expect(valueMs).toBeGreaterThanOrEqual(before - 60_000);
    expect(valueMs).toBeLessThanOrEqual(after + 60_000);
  });

  it('ledger-tokens-applied: sibling-matched border-radius (defers to current Confirmation visual context)', () => {
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );

    const editorInput = screen.getByTestId('confirmation-time-editor-input');
    const sibling = screen.getByTestId('confirmation-save-to-library');
    const editorStyle = getComputedStyle(editorInput);
    const siblingStyle = getComputedStyle(sibling);
    // Briefing §5 — assert TimeEditor's border-radius MATCHES the sibling's,
    // NOT a hardcoded literal. Robust to a future migration where the whole
    // Confirmation surface adopts modern radius tokens.
    expect(editorInput).toBeInTheDocument();
    expect(editorStyle.borderRadius).toBe(siblingStyle.borderRadius);
  });

  it('clamps-30-day-past on min attribute (client-side defense-in-depth mirror of AC3)', () => {
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    const input = screen.getByTestId('confirmation-time-editor-input') as HTMLInputElement;
    // `min` is set in browser-local time, format `YYYY-MM-DDTHH:mm`.
    expect(input.getAttribute('min')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    const minMs = new Date(input.min).getTime();
    const now = Date.now();
    // 30 days in ms.
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    // Tolerance of 90s on either side of the exact 30-day boundary covers
    // (a) the slice-16 truncation to minute precision and (b) the timing
    // delta between the component render and this assertion.
    expect(minMs).toBeGreaterThanOrEqual(now - THIRTY_DAYS_MS - 90_000);
    expect(minMs).toBeLessThanOrEqual(now - THIRTY_DAYS_MS + 90_000);
  });

  it('clamps max to now and blocks forced future changes', async () => {
    useLogFlowStore.getState().ensureClientId('type');
    authFetch.mockImplementation((url: string) => {
      if (url.includes('/api/entries/save')) {
        return Promise.resolve(jsonResponse({ entry: { id: 'srv-row-1' } }));
      }
      if (url.includes('/api/library/dedup-check')) {
        return Promise.resolve(jsonResponse({ match: null }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    const before = Date.now();
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    const after = Date.now();

    const input = screen.getByTestId('confirmation-time-editor-input') as HTMLInputElement;
    const maxMs = new Date(input.max).getTime();
    expect(maxMs).toBeGreaterThanOrEqual(before - 60_000);
    expect(maxMs).toBeLessThanOrEqual(after + 60_000);

    const future = new Date(after + 10 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const futureLocal = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T${pad(future.getHours())}:${pad(future.getMinutes())}`;
    fireEvent.change(input, { target: { value: futureLocal } });

    const user = userEvent.setup();
    await user.click(screen.getByTestId('confirmation-save'));

    const saveCall = authFetch.mock.calls.find((c) => c[0] === '/api/entries/save');
    expect(saveCall).toBeUndefined();
  });

  it('clears the future-time error when the datetime field loses focus', () => {
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByTestId('confirmation-time-editor-input') as HTMLInputElement;
    const future = new Date(Date.now() + 10 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const futureLocal = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T${pad(future.getHours())}:${pad(future.getMinutes())}`;

    fireEvent.change(input, { target: { value: futureLocal } });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByTestId('confirmation-time-editor-hint').textContent).toMatch(
      /not in the future/i,
    );

    fireEvent.blur(input);

    expect(input.getAttribute('aria-invalid')).not.toBe('true');
    expect(screen.getByTestId('confirmation-time-editor-hint').textContent).toMatch(
      /Backfill up to 30 days/i,
    );
  });

  it('treats a native picker empty value as reset-to-current-time and clears future-time error', () => {
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByTestId('confirmation-time-editor-input') as HTMLInputElement;
    const future = new Date(Date.now() + 10 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const futureLocal = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T${pad(future.getHours())}:${pad(future.getMinutes())}`;

    fireEvent.change(input, { target: { value: futureLocal } });
    expect(input.getAttribute('aria-invalid')).toBe('true');

    const beforeReset = Date.now();
    fireEvent.change(input, { target: { value: '' } });
    const afterReset = Date.now();

    expect(input.getAttribute('aria-invalid')).not.toBe('true');
    expect(input.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    const valueMs = new Date(input.value).getTime();
    expect(valueMs).toBeGreaterThanOrEqual(beforeReset - 60_000);
    expect(valueMs).toBeLessThanOrEqual(afterReset + 60_000);
  });

  it('updating the input dispatches setLoggedAt so save payload uses the new value', async () => {
    useLogFlowStore.getState().ensureClientId('type');
    authFetch.mockImplementation((url: string) => {
      if (url.includes('/api/entries/save')) {
        return Promise.resolve(jsonResponse({ entry: { id: 'srv-row-1' } }));
      }
      if (url.includes('/api/library/dedup-check')) {
        return Promise.resolve(jsonResponse({ match: null }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByTestId('confirmation-time-editor-input') as HTMLInputElement;
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    // datetime-local needs LOCAL `YYYY-MM-DDTHH:mm`. userEvent.type is not
    // reliable on datetime-local in happy-dom (segmented input keystrokes
    // don't simulate cleanly), so we drive the change via fireEvent which
    // mirrors how the real picker emits its change event.
    const pad = (n: number) => String(n).padStart(2, '0');
    const localValue = `${fiveDaysAgo.getFullYear()}-${pad(fiveDaysAgo.getMonth() + 1)}-${pad(fiveDaysAgo.getDate())}T${pad(fiveDaysAgo.getHours())}:${pad(fiveDaysAgo.getMinutes())}`;

    fireEvent.change(input, { target: { value: localValue } });

    const user = userEvent.setup();
    await user.click(screen.getByTestId('confirmation-save'));

    const saveCall = authFetch.mock.calls.find((c) => c[0] === '/api/entries/save');
    expect(saveCall).toBeDefined();
    const body = JSON.parse(String(saveCall![1]?.body ?? '{}')) as Record<string, unknown>;
    expect(typeof body.logged_at).toBe('string');
    const sentMs = new Date(String(body.logged_at)).getTime();
    // Within a minute of "5 days ago at the local-time we picked".
    expect(sentMs).toBeGreaterThanOrEqual(fiveDaysAgo.getTime() - 90_000);
    expect(sentMs).toBeLessThanOrEqual(fiveDaysAgo.getTime() + 90_000);
  });

  it('Current Time action resets the value to now in local datetime format', async () => {
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByTestId('confirmation-time-editor-input') as HTMLInputElement;
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const localValue = `${fiveDaysAgo.getFullYear()}-${pad(fiveDaysAgo.getMonth() + 1)}-${pad(fiveDaysAgo.getDate())}T${pad(fiveDaysAgo.getHours())}:${pad(fiveDaysAgo.getMinutes())}`;
    fireEvent.change(input, { target: { value: localValue } });
    expect(new Date(input.value).getTime()).toBeLessThan(Date.now() - 4 * 24 * 60 * 60 * 1000);

    const beforeClick = Date.now();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Current Time/i }));
    const afterClick = Date.now();

    expect(input.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    const valueMs = new Date(input.value).getTime();
    expect(valueMs).toBeGreaterThanOrEqual(beforeClick - 60_000);
    expect(valueMs).toBeLessThanOrEqual(afterClick + 60_000);
  });

  it('exposes TimeEditor on the Confirmation compound public API', () => {
    expect(Confirmation.TimeEditor).toBeDefined();
    expect(typeof Confirmation.TimeEditor).toBe('function');
  });

  // Codex Round 1 — Finding #4: render the always-visible helper text below
  // the input with aria-describedby wiring. Surfaces the 30-day affordance to
  // the user before they hit the boundary (error-prevention heuristic).
  it('AC1-helper: renders always-visible helper text wired via aria-describedby', () => {
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByTestId('confirmation-time-editor-input') as HTMLInputElement;
    const hint = screen.getByTestId('confirmation-time-editor-hint');
    // The hint text MUST be visible at mount (no error state) — surfaces the
    // 30-day affordance BEFORE the user hits the boundary.
    expect(hint).toBeVisible();
    expect(hint.textContent).toMatch(/Backfill up to 30 days/i);
    // The input's aria-describedby MUST point at the hint id even when valid
    // (always-visible hint, not conditional on outsideWindow).
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(hint.id).toBe(describedBy);
  });

  // Codex Round 1 — Finding #2: edit-entry TimeEditor must be readonly to
  // avoid the silent-drop bug where user edits to the time field are not
  // persisted on PATCH. The PATCH body intentionally omits `logged_at` (out of
  // C.5 scope), so the field must NOT look editable.
  it('AC-edit: when editing existing entry, TimeEditor is readonly + shows edit-disabled hint', () => {
    const originalIso = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        editEntryId="entry-1"
        originalLoggedAt={originalIso}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByTestId('confirmation-time-editor-input') as HTMLInputElement;
    // The input MUST be readonly (not just disabled — readonly preserves
    // focusability + value display + ARIA semantics).
    expect(input.hasAttribute('readonly')).toBe(true);
    expect(input.getAttribute('aria-readonly')).toBe('true');
    // The helper text MUST swap to the edit-disabled hint.
    const hint = screen.getByTestId('confirmation-time-editor-hint');
    expect(hint).toBeVisible();
    expect(hint.textContent).toMatch(/cannot be changed when editing/i);
  });

  // Codex Round 2 — Finding #3: the className string concatenation lacked
  // separating spaces, so conditional state fragments fused into the base
  // class (`kalori-confirmation-time-editor-inputis-readonly`). The
  // `.is-readonly` / `.is-error` CSS selectors NEVER matched at runtime, so
  // the R1 visual disabled/error states silently didn't render. Assert that
  // both classes appear as DISCRETE tokens, not as a single mashed string.
  it('R2-visual-state: editing produces a discrete `is-readonly` className token', () => {
    const originalIso = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        editEntryId="entry-1"
        originalLoggedAt={originalIso}
        onClose={vi.fn()}
      />,
    );
    const input = screen.getByTestId('confirmation-time-editor-input') as HTMLInputElement;
    // Tokenize the className via the standard whitespace split — same way
    // the CSS selector engine resolves class lists. Pre-fix: the token list
    // contains the mashed `kalori-confirmation-time-editor-inputis-readonly`
    // and NOT a discrete `is-readonly`. Post-fix: both base and `is-readonly`
    // appear as separate tokens.
    const tokens = input.className.split(/\s+/);
    expect(tokens).toContain('kalori-confirmation-time-editor-input');
    expect(tokens).toContain('is-readonly');
    // Hint span gets the same fix.
    const hint = screen.getByTestId('confirmation-time-editor-hint');
    const hintTokens = hint.className.split(/\s+/);
    expect(hintTokens).toContain('kalori-confirmation-time-editor-hint');
    expect(hintTokens).toContain('is-readonly');
  });

  // Codex Round 2 — Finding #3 (outsideWindow variant). The outsideWindow
  // path on the hint must also produce a discrete `is-error` token.
  it('R2-visual-state: outsideWindow value produces a discrete `is-error` hint className token', () => {
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    const input = screen.getByTestId('confirmation-time-editor-input') as HTMLInputElement;
    // Force outsideWindow by directly firing a change with an out-of-window
    // value (60 days ago). The reducer accepts it; the component's
    // `outsideWindow` flag flips true.
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const local = `${sixtyDaysAgo.getFullYear()}-${pad(sixtyDaysAgo.getMonth() + 1)}-${pad(sixtyDaysAgo.getDate())}T${pad(sixtyDaysAgo.getHours())}:${pad(sixtyDaysAgo.getMinutes())}`;
    fireEvent.change(input, { target: { value: local } });

    const hint = screen.getByTestId('confirmation-time-editor-hint');
    const hintTokens = hint.className.split(/\s+/);
    expect(hintTokens).toContain('kalori-confirmation-time-editor-hint');
    expect(hintTokens).toContain('is-error');
  });

  // Codex Round 1 — Finding #2 defense-in-depth: legacy entries >30d old must
  // NOT trigger the outsideWindow error UI on the edit path. The user can't
  // change the time anyway (readonly), so the error UI would be misleading.
  it('AC-edit-stale: legacy 60-day-old entry displays without outsideWindow error UI', () => {
    const sixtyDaysAgoIso = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        editEntryId="entry-1"
        originalLoggedAt={sixtyDaysAgoIso}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByTestId('confirmation-time-editor-input') as HTMLInputElement;
    // No aria-invalid on the edit path even when the value is outside the
    // 30-day window — the user can't change it, so the error UI is wrong.
    expect(input.getAttribute('aria-invalid')).not.toBe('true');
    // Hint must be the edit-disabled hint, NOT the outsideWindow hint.
    const hint = screen.getByTestId('confirmation-time-editor-hint');
    expect(hint.textContent).not.toMatch(/Pick a date within the last 30 days/i);
    expect(hint.textContent).toMatch(/cannot be changed when editing/i);
  });
});
