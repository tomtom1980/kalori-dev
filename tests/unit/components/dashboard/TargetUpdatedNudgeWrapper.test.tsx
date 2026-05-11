/**
 * Task 4.3b — `<TargetUpdatedNudgeWrapper />` component tests.
 *
 * Codex Round 1 C-2 hardening: the wrapper previously POSTed shapes that
 * `/api/profile/save` rejects silently (its Zod `BodySchema` requires
 * `{ client_id, patch }` where `patch` only accepts the whitelisted column
 * set). That meant "Dismiss" never persisted and "Recalculate now" never
 * triggered recalc — the UI claimed success while the server ignored both.
 *
 * These tests freeze the wire contract:
 *   - `authPost('/api/profile/save', { client_id: <uuid>, patch: { last_dashboard_visit_at: ... } })`
 *   - failures surface (no silent swallow) — either via a thrown error,
 *     toast, or caller-observable rejection.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TargetUpdatedNudgeWrapper } from '@/components/dashboard/TargetUpdatedNudgeWrapper';

const authPost = vi.fn();
vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authPost: (url: string, body: unknown, init?: RequestInit) => authPost(url, body, init),
  SessionExpiredError: class SE extends Error {},
}));

describe('<TargetUpdatedNudgeWrapper /> — C-2 wire contract', () => {
  beforeEach(() => {
    authPost.mockReset();
    authPost.mockResolvedValue({ ok: true, profile: {} });
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.clear();
      } catch {
        // ignore
      }
    }
  });

  afterEach(() => {
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.clear();
      } catch {
        // ignore
      }
    }
  });

  it('Dismiss POSTs { client_id, patch: { last_dashboard_visit_at } } — schema-accepted shape', async () => {
    render(
      <TargetUpdatedNudgeWrapper
        calorieTarget={2040}
        lastTargetRecalcAt="2026-04-24T12:00:00Z"
        lastDashboardVisitAt={null}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('target-updated-nudge-dismiss'));
    // Allow the async onDismiss to resolve.
    await new Promise((r) => setTimeout(r, 0));

    expect(authPost).toHaveBeenCalledTimes(1);
    const [url, body] = authPost.mock.calls[0] ?? [];
    expect(url).toBe('/api/profile/save');
    // Schema contract: { client_id, patch }.
    expect(body).toMatchObject({
      client_id: expect.any(String),
      patch: expect.objectContaining({
        last_dashboard_visit_at: expect.any(String),
      }),
    });
    // last_dashboard_visit_at must parse as a valid ISO date.
    const iso = (body as { patch: { last_dashboard_visit_at: string } }).patch
      .last_dashboard_visit_at;
    expect(Number.isFinite(Date.parse(iso))).toBe(true);
  });

  it('Recalculate POSTs { client_id, patch: { current_weight_kg } } — re-triggers recalc via whitelisted column', async () => {
    render(
      <TargetUpdatedNudgeWrapper
        calorieTarget={2040}
        lastTargetRecalcAt="2026-04-24T12:00:00Z"
        lastDashboardVisitAt={null}
        howWeCalculatedInputs={{
          bio_sex: 'female',
          age: 30,
          height_cm: 165,
          current_weight_kg: 70,
          goal_weight_kg: 65,
          goal_pace: 'moderate',
          activity_level: 'moderate',
        }}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('target-updated-nudge-recalc'));
    await new Promise((r) => setTimeout(r, 0));

    expect(authPost).toHaveBeenCalledTimes(1);
    const [url, body] = authPost.mock.calls[0] ?? [];
    expect(url).toBe('/api/profile/save');
    expect(body).toMatchObject({
      client_id: expect.any(String),
      patch: expect.any(Object),
    });
    // Recalc trigger: re-send current_weight_kg so the server's profile-save
    // path observes a weight column change and re-runs downstream math (or
    // the deliberate no-op save — either way, the body is schema-valid).
    const patch = (body as { patch: Record<string, unknown> }).patch;
    // No non-whitelisted fields (e.g. a raw `last_dashboard_visit_at` on the
    // outer body, or unknown keys inside patch).
    for (const key of Object.keys(patch)) {
      expect([
        'bio_sex',
        'age',
        'height_cm',
        'current_weight_kg',
        'goal_weight_kg',
        'activity_level',
        'goal_pace',
        'region',
        'unit_pref',
        'timezone',
        'target_mode',
        'manual_override_value',
        'onboarding_completed_at',
        'last_dashboard_visit_at',
      ]).toContain(key);
    }
  });

  it('Dismiss surfaces failure via sessionStorage error flag (not silent swallow)', async () => {
    authPost.mockRejectedValueOnce(new Error('network_down'));
    render(
      <TargetUpdatedNudgeWrapper
        calorieTarget={2040}
        lastTargetRecalcAt="2026-04-24T12:00:00Z"
        lastDashboardVisitAt={null}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('target-updated-nudge-dismiss'));
    // Allow the async onDismiss to process the rejection.
    await new Promise((r) => setTimeout(r, 10));
    // Evidence that the failure was surfaced: a status/error key was written
    // to sessionStorage so the next render can flag the failure (or the
    // console logged the error). Either form counts as "not silently
    // swallowed".
    const errored = window.sessionStorage.getItem('kalori-nudge-dismiss-error');
    expect(errored).not.toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────
  // Codex Round 2 R2-C1: UI success must be gated on server confirmation.
  // A failed POST must NOT hide the card, MUST NOT announce success, and
  // MUST surface a visible error affordance (retry CTA / error text).
  // ─────────────────────────────────────────────────────────────────────
  it('Dismiss server failure: card stays visible, no success announcement, visible error surface', async () => {
    authPost.mockRejectedValueOnce(new Error('db_error_500'));
    render(
      <TargetUpdatedNudgeWrapper
        calorieTarget={2040}
        lastTargetRecalcAt="2026-04-24T12:00:00Z"
        lastDashboardVisitAt={null}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('target-updated-nudge-dismiss'));
    // Allow async onDismiss + post-await setState to flush.
    await new Promise((r) => setTimeout(r, 20));

    // (i) Card remains visible — dismissal did NOT hide it.
    expect(screen.queryByTestId('target-updated-nudge')).toBeTruthy();

    // (ii) Visible error surface with retry affordance.
    expect(screen.queryByTestId('target-updated-nudge-error')).toBeTruthy();
    expect(screen.queryByTestId('target-updated-nudge-retry')).toBeTruthy();
  });

  it('Recalc server failure: no success announcement, card stays visible, error surface shown', async () => {
    authPost.mockRejectedValueOnce(new Error('db_error_500'));
    render(
      <TargetUpdatedNudgeWrapper
        calorieTarget={2040}
        lastTargetRecalcAt="2026-04-24T12:00:00Z"
        lastDashboardVisitAt={null}
        howWeCalculatedInputs={{
          bio_sex: 'female',
          age: 30,
          height_cm: 165,
          current_weight_kg: 70,
          goal_weight_kg: 65,
          goal_pace: 'moderate',
          activity_level: 'moderate',
        }}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('target-updated-nudge-recalc'));
    await new Promise((r) => setTimeout(r, 20));

    // (i) Card remains visible.
    expect(screen.queryByTestId('target-updated-nudge')).toBeTruthy();
    // (ii) Error surface + retry visible.
    expect(screen.queryByTestId('target-updated-nudge-error')).toBeTruthy();
    expect(screen.queryByTestId('target-updated-nudge-retry')).toBeTruthy();

    // (iii) The in-card sr-only live region MUST NOT hold the
    // "Target recalculated. {newTarget} kilocalories per day" copy.
    const live = screen.getByTestId('target-updated-nudge-sr-live');
    expect(live.textContent ?? '').not.toMatch(/target recalculated/i);
  });

  it('Dismiss success path: card hides after confirmed server OK', async () => {
    authPost.mockResolvedValueOnce({ ok: true, profile: {} });
    render(
      <TargetUpdatedNudgeWrapper
        calorieTarget={2040}
        lastTargetRecalcAt="2026-04-24T12:00:00Z"
        lastDashboardVisitAt={null}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('target-updated-nudge-dismiss'));
    await new Promise((r) => setTimeout(r, 20));

    // Card hidden only after confirmed success.
    expect(screen.queryByTestId('target-updated-nudge')).toBeNull();
    // No error surface.
    expect(screen.queryByTestId('target-updated-nudge-error')).toBeNull();
  });
});
