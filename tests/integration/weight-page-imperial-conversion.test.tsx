/**
 * Task 4.5 R1 Pass 2 S2 — `/weight` history list MUST convert kg → lb for
 * imperial users. Pre-fix the page rendered `row.weight_kg.toFixed(1)`
 * unconditionally, then suffixed it with `lb` for imperial — a wrong
 * number with the wrong-unit label.
 */
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { kgToLb, roundToOneDecimal } from '@/lib/units/conversion';

const mockProfile = {
  onboarding_completed_at: '2026-04-01T00:00:00Z',
  unit_pref: 'imperial' as const,
  current_weight_kg: 75 as number | null,
  timezone: 'UTC',
};

function buildSupabaseMock(
  profile: typeof mockProfile,
  history: Array<{ id: string; date: string; weight_kg: number; note: string | null }>,
) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: profile, error: null }),
            }),
          }),
        };
      }
      if (table === 'weight_log') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({ data: history, error: null }),
              }),
            }),
          }),
        };
      }
      return {} as never;
    }),
  };
}

describe('/weight history — imperial unit conversion (Task 4.5 R1 Pass 2 S2)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('@/lib/time/day');
    vi.doUnmock('next/navigation');
  });

  it('renders weights in lb (kgToLb-converted) when unit_pref=imperial', async () => {
    const KG_VALUE = 75;
    const history = [
      { id: 'w-1', date: '2026-04-21', weight_kg: KG_VALUE, note: null },
      { id: 'w-2', date: '2026-04-20', weight_kg: 76.5, note: null },
    ];

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => buildSupabaseMock(mockProfile, history),
    }));
    vi.doMock('@/lib/time/day', () => ({
      userTzToday: () => '2026-04-25',
    }));
    vi.doMock('next/navigation', () => ({
      redirect: () => {
        throw new Error('unexpected redirect');
      },
    }));
    // Stub WeightQuickAdd to avoid pulling client-side Zustand into RSC test.
    vi.doMock('@/components/dashboard/WeightQuickAdd', () => ({
      WeightQuickAdd: () => null,
    }));

    const { default: WeightPage } = await import('@/app/(app)/weight/page');
    const ui = await WeightPage();
    const { container } = render(ui as React.ReactElement);

    const text = container.textContent ?? '';
    // The 75 kg row MUST display 165.3 lb (75 / 0.45359237 ≈ 165.3).
    const expectedLbForRow1 = roundToOneDecimal(kgToLb(KG_VALUE)).toFixed(1);
    expect(expectedLbForRow1).toBe('165.3');
    expect(text).toContain('165.3');

    // The 76.5 kg row MUST display 168.7 lb (76.5 / 0.45359237 ≈ 168.65 → rounded 168.7).
    const expectedLbForRow2 = roundToOneDecimal(kgToLb(76.5)).toFixed(1);
    expect(expectedLbForRow2).toBe('168.7');
    expect(text).toContain('168.7');

    // The raw kg numbers (75.0, 76.5) MUST NOT appear in the list cells —
    // imperial users should never see kg values mislabeled as lb.
    // We check the dedicated weight cell only, not free text (the unit label
    // "lb" obviously contains a 'b' but we want explicit value format).
    // 75.0 / 76.5 with the .0 / .5 decimal MUST NOT be displayed.
    expect(text).not.toContain('75.0 lb');
    expect(text).not.toContain('76.5 lb');
  });

  it('renders weights in kg (raw weight_kg) when unit_pref=metric', async () => {
    const history = [{ id: 'w-1', date: '2026-04-21', weight_kg: 75, note: null }];

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () =>
        buildSupabaseMock(
          { ...mockProfile, unit_pref: 'metric' } as unknown as typeof mockProfile,
          history,
        ),
    }));
    vi.doMock('@/lib/time/day', () => ({
      userTzToday: () => '2026-04-25',
    }));
    vi.doMock('next/navigation', () => ({
      redirect: () => {
        throw new Error('unexpected redirect');
      },
    }));
    vi.doMock('@/components/dashboard/WeightQuickAdd', () => ({
      WeightQuickAdd: () => null,
    }));

    const { default: WeightPage } = await import('@/app/(app)/weight/page');
    const ui = await WeightPage();
    const { container } = render(ui as React.ReactElement);
    const text = container.textContent ?? '';

    // Metric: 75.0 displayed as-is.
    expect(text).toContain('75.0');
  });

  it('renders the delta in the user-preferred unit (imperial → lb)', async () => {
    // 75 → 76.5 = +1.5 kg = +3.3 lb (rounded).
    const history = [
      { id: 'w-1', date: '2026-04-21', weight_kg: 76.5, note: null },
      { id: 'w-2', date: '2026-04-20', weight_kg: 75, note: null },
    ];

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => buildSupabaseMock(mockProfile, history),
    }));
    vi.doMock('@/lib/time/day', () => ({
      userTzToday: () => '2026-04-25',
    }));
    vi.doMock('next/navigation', () => ({
      redirect: () => {
        throw new Error('unexpected redirect');
      },
    }));
    vi.doMock('@/components/dashboard/WeightQuickAdd', () => ({
      WeightQuickAdd: () => null,
    }));

    const { default: WeightPage } = await import('@/app/(app)/weight/page');
    const ui = await WeightPage();
    const { container } = render(ui as React.ReactElement);
    const text = container.textContent ?? '';

    // 1.5 kg delta = 3.3 lb delta. Pre-fix: '+1.5' (kg, mislabeled as lb).
    expect(text).toContain('+3.3');
    expect(text).not.toContain('+1.5 lb');
  });

  // Task 4.5 R2 S1 — imperial delta precision. Pre-fix the delta was rounded
  // to 1 decimal in kg BEFORE converting to lb, which collapsed small-but-
  // measurable changes to zero. Example: a 0.05 kg delta (≈ 0.11 lb) rounds
  // in kg to 0.1, then converts to 0.22 lb, which displays as "+0.2 lb" — but
  // pre-fix the sequence rounded in kg first THEN converted, forcing a
  // stair-step where sub-0.05-kg deltas disappeared entirely from the lb
  // display. The correct ordering is: convert kg → lb, THEN round.
  it('Task 4.5 R2 S1 — sub-0.1-kg delta survives conversion for imperial display', async () => {
    // 70.01 → 70.05 = +0.04 kg = +0.0882 lb (rounded to one decimal = +0.1).
    // Pre-fix: round(0.04 kg) = 0.0 kg → 0.0 lb → displays as "=0" (no change).
    // Post-fix: 0.04 kg → 0.0882 lb → rounded = 0.1 → displays as "+0.1".
    const history = [
      { id: 'w-1', date: '2026-04-21', weight_kg: 70.05, note: null },
      { id: 'w-2', date: '2026-04-20', weight_kg: 70.01, note: null },
    ];

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => buildSupabaseMock(mockProfile, history),
    }));
    vi.doMock('@/lib/time/day', () => ({
      userTzToday: () => '2026-04-25',
    }));
    vi.doMock('next/navigation', () => ({
      redirect: () => {
        throw new Error('unexpected redirect');
      },
    }));
    vi.doMock('@/components/dashboard/WeightQuickAdd', () => ({
      WeightQuickAdd: () => null,
    }));

    const { default: WeightPage } = await import('@/app/(app)/weight/page');
    const ui = await WeightPage();
    const { container } = render(ui as React.ReactElement);
    const text = container.textContent ?? '';

    // Post-fix must display +0.1 (lb). Pre-fix would show "=0".
    expect(text).toContain('+0.1');
    expect(text).not.toContain('=0 ');
  });
});
