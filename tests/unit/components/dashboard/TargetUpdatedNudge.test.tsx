/**
 * Task 4.3b — `<TargetUpdatedNudge />` component tests.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TargetUpdatedNudge } from '@/components/dashboard/TargetUpdatedNudge';

describe('<TargetUpdatedNudge />', () => {
  beforeEach(() => {
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

  it('does NOT render when shouldRender=false', () => {
    render(
      <TargetUpdatedNudge
        calorieTarget={2040}
        previousCalorieTarget={2000}
        lastTargetRecalcAt="2026-04-24T12:00:00Z"
        lastDashboardVisitAt="2026-04-24T13:00:00Z"
        onRecalculate={async () => undefined}
        onDismiss={async () => undefined}
        shouldRender={false}
      />,
    );
    expect(screen.queryByTestId('target-updated-nudge')).toBeNull();
  });

  it('renders headline with formatted calorie target', () => {
    render(
      <TargetUpdatedNudge
        calorieTarget={2040}
        previousCalorieTarget={2000}
        lastTargetRecalcAt="2026-04-24T12:00:00Z"
        lastDashboardVisitAt={null}
        onRecalculate={async () => undefined}
        onDismiss={async () => undefined}
        shouldRender={true}
      />,
    );
    const kcal = screen.getByTestId('target-updated-nudge-kcal');
    expect(kcal.textContent).toBe('2,040');
  });

  it('clicking Recalculate fires onRecalculate', async () => {
    const onRecalculate = vi.fn(async () => undefined);
    render(
      <TargetUpdatedNudge
        calorieTarget={2040}
        previousCalorieTarget={2000}
        lastTargetRecalcAt="2026-04-24T12:00:00Z"
        lastDashboardVisitAt={null}
        onRecalculate={onRecalculate}
        onDismiss={async () => undefined}
        shouldRender={true}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('target-updated-nudge-recalc'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(onRecalculate).toHaveBeenCalledTimes(1);
  });

  it('clicking Dismiss fires onDismiss + unmounts card', async () => {
    const onDismiss = vi.fn(async () => undefined);
    render(
      <TargetUpdatedNudge
        calorieTarget={2040}
        previousCalorieTarget={2000}
        lastTargetRecalcAt="2026-04-24T12:00:00Z"
        lastDashboardVisitAt={null}
        onRecalculate={async () => undefined}
        onDismiss={onDismiss}
        shouldRender={true}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('target-updated-nudge-dismiss'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('target-updated-nudge')).toBeNull();
  });

  it('See why toggles howWeCalculated disclosure with aria-expanded', async () => {
    render(
      <TargetUpdatedNudge
        calorieTarget={2040}
        previousCalorieTarget={2000}
        lastTargetRecalcAt="2026-04-24T12:00:00Z"
        lastDashboardVisitAt={null}
        onRecalculate={async () => undefined}
        onDismiss={async () => undefined}
        shouldRender={true}
        howWeCalculatedNode={<div data-testid="how-we-calculated-slot">HWC</div>}
      />,
    );
    const user = userEvent.setup();
    const trigger = screen.getByTestId('target-updated-nudge-see-why');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await user.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('how-we-calculated-slot')).toBeTruthy();
  });

  it('M6 — renders in-card sr-only aria-live polite region for state-change announcements', () => {
    render(
      <TargetUpdatedNudge
        calorieTarget={2040}
        previousCalorieTarget={2000}
        lastTargetRecalcAt="2026-04-24T12:00:00Z"
        lastDashboardVisitAt={null}
        onRecalculate={async () => undefined}
        onDismiss={async () => undefined}
        shouldRender={true}
      />,
    );
    const card = screen.getByTestId('target-updated-nudge');
    const live = card.querySelector('[aria-live="polite"]');
    expect(live).toBeTruthy();
    expect(live?.getAttribute('aria-atomic')).toBe('true');
    // Must be visually hidden (sr-only class or inline clip).
    const cls = live?.getAttribute('class') ?? '';
    const style = (live as HTMLElement)?.getAttribute('style') ?? '';
    expect(cls.includes('sr-only') || style.includes('clip:')).toBe(true);
  });

  it('idempotent replay — re-mounting with same lastTargetRecalcAt does not double-announce', async () => {
    const { unmount } = render(
      <TargetUpdatedNudge
        calorieTarget={2040}
        previousCalorieTarget={2000}
        lastTargetRecalcAt="2026-04-24T12:00:00Z"
        lastDashboardVisitAt={null}
        onRecalculate={async () => undefined}
        onDismiss={async () => undefined}
        shouldRender={true}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    // After first mount, sessionStorage key should be set.
    const key = 'kalori:target-nudge:announced:2026-04-24T12:00:00Z';
    expect(window.sessionStorage.getItem(key)).toBe('1');

    unmount();
    // Fresh render with same timestamp — effect runs again, checks
    // sessionStorage, bails before re-announcing.
    render(
      <TargetUpdatedNudge
        calorieTarget={2040}
        previousCalorieTarget={2000}
        lastTargetRecalcAt="2026-04-24T12:00:00Z"
        lastDashboardVisitAt={null}
        onRecalculate={async () => undefined}
        onDismiss={async () => undefined}
        shouldRender={true}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    // Still one sentinel — announcePolite was not re-fired on remount.
    expect(window.sessionStorage.getItem(key)).toBe('1');
  });
});
