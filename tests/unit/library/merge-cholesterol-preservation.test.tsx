/**
 * Codex R1 F1 regression test — Phase 2C cholesterol survives library merge.
 *
 * Bug: `<MergeDuplicatesDialog />` never read candidate cholesterol_mg
 * values, never rendered a picker, and never included cholesterol_mg
 * in the merge payload. Because the merge RPC replaces the winner's
 * JSONB nutrition wholesale (`p_fields->'nutrition'`), any pre-merge
 * cholesterol value on either side was silently erased on the surviving
 * row.
 *
 * Fix:
 *   1. `pickDefaults` seeds cholesterol_mg = winner side + cholesterol_custom = null
 *   2. Dialog renders a `<MergeField>` for cholesterol when at least
 *      one source side carries cholesterol_mg.
 *   3. Submit payload includes `cholesterol_mg` (via `pickValue`) so
 *      the survivor keeps the chosen value.
 *   4. Pairs of legacy rows (neither side has cholesterol) do NOT emit
 *      the key, so the winner stays absent rather than materialising
 *      a phantom 0mg.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MergeDuplicatesDialog } from '@/app/(app)/library/_components/MergeDuplicatesDialog';
import type { LibraryItem } from '@/lib/library/fetch';
import { pickDefaults } from '@/lib/library/merge-default';

const authPostMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authPost: authPostMock,
  SessionExpiredError: class SessionExpiredError extends Error {},
}));

function libraryItem(overrides: Partial<LibraryItem>): LibraryItem {
  return {
    id: overrides.id ?? 'id-a',
    client_id: overrides.client_id ?? 'client-a',
    display_name: overrides.display_name ?? 'Item A',
    normalized_name: overrides.normalized_name ?? 'item a',
    default_portion: overrides.default_portion ?? 1,
    default_unit: overrides.default_unit ?? 'piece',
    nutrition: overrides.nutrition ?? {
      kcal: 100,
      macros: { protein_g: 10, carbs_g: 10, fat_g: 5 },
    },
    thumbnail_url: overrides.thumbnail_url ?? null,
    log_count: overrides.log_count ?? 1,
    last_used_at: overrides.last_used_at ?? null,
    user_edited_flag: overrides.user_edited_flag ?? false,
    created_from: overrides.created_from ?? 'text',
    created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
  };
}

describe('pickDefaults — Codex R1 F1: cholesterol seeds', () => {
  it('seeds cholesterol_mg to the winner side', () => {
    const a = libraryItem({ log_count: 10 });
    const b = libraryItem({ log_count: 2 });
    const out = pickDefaults(a, b);
    expect(out.cholesterol_mg).toBe('a');
    expect(out.cholesterol_custom).toBeNull();
  });

  it('seeds cholesterol_mg to B when B is the winner', () => {
    const a = libraryItem({ log_count: 1 });
    const b = libraryItem({ log_count: 9 });
    expect(pickDefaults(a, b).cholesterol_mg).toBe('b');
  });

  // Codex R2 — one-sided preference test. The cholesterol-bearing side
  // wins for cholesterol_mg regardless of the generic winner heuristic
  // so accept-defaults flow preserves the only recorded value.
  it('R2: defaults cholesterol_mg to the cholesterol-bearing side when only one side has it', () => {
    // A wins by log_count but only B has cholesterol.
    const a = libraryItem({
      log_count: 10,
      nutrition: { kcal: 100, macros: { protein_g: 10, carbs_g: 10, fat_g: 5 } },
    });
    const b = libraryItem({
      log_count: 2,
      nutrition: {
        kcal: 100,
        macros: { protein_g: 10, carbs_g: 10, fat_g: 5, cholesterol_mg: 90 },
      },
    });
    const out = pickDefaults(a, b);
    expect(out.display_name).toBe('a'); // generic winner still A
    expect(out.cholesterol_mg).toBe('b'); // but cholesterol defers to B
  });

  it('R2: defers cholesterol_mg to the generic winner when BOTH sides have it', () => {
    const a = libraryItem({
      log_count: 10,
      nutrition: {
        kcal: 100,
        macros: { protein_g: 10, carbs_g: 10, fat_g: 5, cholesterol_mg: 50 },
      },
    });
    const b = libraryItem({
      log_count: 2,
      nutrition: {
        kcal: 100,
        macros: { protein_g: 10, carbs_g: 10, fat_g: 5, cholesterol_mg: 90 },
      },
    });
    expect(pickDefaults(a, b).cholesterol_mg).toBe('a');
  });
});

describe('<MergeDuplicatesDialog /> — Codex R1 F1: cholesterol payload', () => {
  beforeEach(() => {
    authPostMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('includes cholesterol_mg in the merge payload (winner value preserved)', async () => {
    const a = libraryItem({
      id: 'id-a',
      log_count: 10,
      nutrition: {
        kcal: 200,
        macros: { protein_g: 20, carbs_g: 25, fat_g: 8, cholesterol_mg: 75 },
      },
    });
    const b = libraryItem({
      id: 'id-b',
      log_count: 2,
      nutrition: {
        kcal: 220,
        macros: { protein_g: 22, carbs_g: 26, fat_g: 9, cholesterol_mg: 110 },
      },
    });

    authPostMock.mockResolvedValueOnce({ winner: a });

    render(
      <MergeDuplicatesDialog open={true} a={a} b={b} onOpenChange={() => {}} onSuccess={vi.fn()} />,
    );
    const user = userEvent.setup();
    // Cholesterol picker must be visible when both sides carry values.
    expect(screen.getByTestId('library-merge-field-cholesterol_mg')).toBeInTheDocument();

    await user.click(screen.getByTestId('library-merge-submit'));
    await waitFor(() => expect(screen.getByTestId('library-merge-proceed')).toBeInTheDocument());
    await user.click(screen.getByTestId('library-merge-proceed'));

    await waitFor(() => expect(authPostMock).toHaveBeenCalledTimes(1));
    const [, payload] = authPostMock.mock.calls[0]!;
    expect(payload.fields.nutrition.macros.cholesterol_mg).toBe(75);
  });

  it('lets the user pick the LOSER side cholesterol value via radio', async () => {
    const a = libraryItem({
      id: 'id-a',
      log_count: 10,
      nutrition: {
        kcal: 200,
        macros: { protein_g: 20, carbs_g: 25, fat_g: 8, cholesterol_mg: 75 },
      },
    });
    const b = libraryItem({
      id: 'id-b',
      log_count: 2,
      nutrition: {
        kcal: 220,
        macros: { protein_g: 22, carbs_g: 26, fat_g: 9, cholesterol_mg: 110 },
      },
    });

    authPostMock.mockResolvedValueOnce({ winner: a });

    render(
      <MergeDuplicatesDialog open={true} a={a} b={b} onOpenChange={() => {}} onSuccess={vi.fn()} />,
    );
    const user = userEvent.setup();
    // Pick B's cholesterol value.
    await user.click(screen.getByTestId('library-merge-cholesterol_mg-b'));

    await user.click(screen.getByTestId('library-merge-submit'));
    await waitFor(() => expect(screen.getByTestId('library-merge-proceed')).toBeInTheDocument());
    await user.click(screen.getByTestId('library-merge-proceed'));

    await waitFor(() => expect(authPostMock).toHaveBeenCalledTimes(1));
    const [, payload] = authPostMock.mock.calls[0]!;
    expect(payload.fields.nutrition.macros.cholesterol_mg).toBe(110);
  });

  it('omits cholesterol_mg from payload when neither side carries it (legacy pair)', async () => {
    const a = libraryItem({
      id: 'id-a',
      log_count: 10,
      nutrition: { kcal: 200, macros: { protein_g: 20, carbs_g: 25, fat_g: 8 } },
    });
    const b = libraryItem({
      id: 'id-b',
      log_count: 2,
      nutrition: { kcal: 220, macros: { protein_g: 22, carbs_g: 26, fat_g: 9 } },
    });

    authPostMock.mockResolvedValueOnce({ winner: a });

    render(
      <MergeDuplicatesDialog open={true} a={a} b={b} onOpenChange={() => {}} onSuccess={vi.fn()} />,
    );
    // Picker stays hidden when neither side has cholesterol data.
    expect(screen.queryByTestId('library-merge-field-cholesterol_mg')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByTestId('library-merge-submit'));
    await waitFor(() => expect(screen.getByTestId('library-merge-proceed')).toBeInTheDocument());
    await user.click(screen.getByTestId('library-merge-proceed'));

    await waitFor(() => expect(authPostMock).toHaveBeenCalledTimes(1));
    const [, payload] = authPostMock.mock.calls[0]!;
    // Critical assertion — no phantom 0mg materialised on legacy pairs.
    expect('cholesterol_mg' in payload.fields.nutrition.macros).toBe(false);
  });

  // Codex R2 adversarial test — A wins by log_count but only B has
  // cholesterol_mg. Previously the dialog defaulted to A's (absent →
  // collapsed to 0) and erased B's only recorded value. Fix: the
  // pickDefaults heuristic now defers to the cholesterol-bearing side
  // when exactly one side has it.
  it('R2: A wins by log_count but only B has cholesterol — payload preserves B value on defaults', async () => {
    const a = libraryItem({
      id: 'id-a',
      log_count: 10,
      // A has no cholesterol_mg key.
      nutrition: { kcal: 200, macros: { protein_g: 20, carbs_g: 25, fat_g: 8 } },
    });
    const b = libraryItem({
      id: 'id-b',
      log_count: 2,
      // B has the only cholesterol record.
      nutrition: {
        kcal: 220,
        macros: { protein_g: 22, carbs_g: 26, fat_g: 9, cholesterol_mg: 90 },
      },
    });

    authPostMock.mockResolvedValueOnce({ winner: a });

    render(
      <MergeDuplicatesDialog open={true} a={a} b={b} onOpenChange={() => {}} onSuccess={vi.fn()} />,
    );
    // Picker IS visible (one side has data).
    expect(screen.getByTestId('library-merge-field-cholesterol_mg')).toBeInTheDocument();

    const user = userEvent.setup();
    // User accepts defaults — does NOT touch the cholesterol picker.
    await user.click(screen.getByTestId('library-merge-submit'));
    await waitFor(() => expect(screen.getByTestId('library-merge-proceed')).toBeInTheDocument());
    await user.click(screen.getByTestId('library-merge-proceed'));

    await waitFor(() => expect(authPostMock).toHaveBeenCalledTimes(1));
    const [, payload] = authPostMock.mock.calls[0]!;
    // Critical: must be B's 90mg, not A's collapsed 0.
    expect(payload.fields.nutrition.macros.cholesterol_mg).toBe(90);
  });

  it('R2: B wins by log_count but only A has cholesterol — payload preserves A value on defaults', async () => {
    const a = libraryItem({
      id: 'id-a',
      log_count: 2,
      nutrition: {
        kcal: 200,
        macros: { protein_g: 20, carbs_g: 25, fat_g: 8, cholesterol_mg: 60 },
      },
    });
    const b = libraryItem({
      id: 'id-b',
      log_count: 10,
      nutrition: { kcal: 220, macros: { protein_g: 22, carbs_g: 26, fat_g: 9 } },
    });

    authPostMock.mockResolvedValueOnce({ winner: b });

    render(
      <MergeDuplicatesDialog open={true} a={a} b={b} onOpenChange={() => {}} onSuccess={vi.fn()} />,
    );
    expect(screen.getByTestId('library-merge-field-cholesterol_mg')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByTestId('library-merge-submit'));
    await waitFor(() => expect(screen.getByTestId('library-merge-proceed')).toBeInTheDocument());
    await user.click(screen.getByTestId('library-merge-proceed'));

    await waitFor(() => expect(authPostMock).toHaveBeenCalledTimes(1));
    const [, payload] = authPostMock.mock.calls[0]!;
    expect(payload.fields.nutrition.macros.cholesterol_mg).toBe(60);
  });

  it('survives a one-sided cholesterol pair (only A has it)', async () => {
    const a = libraryItem({
      id: 'id-a',
      log_count: 10,
      nutrition: {
        kcal: 200,
        macros: { protein_g: 20, carbs_g: 25, fat_g: 8, cholesterol_mg: 50 },
      },
    });
    const b = libraryItem({
      id: 'id-b',
      log_count: 2,
      nutrition: { kcal: 220, macros: { protein_g: 22, carbs_g: 26, fat_g: 9 } },
    });

    authPostMock.mockResolvedValueOnce({ winner: a });

    render(
      <MergeDuplicatesDialog open={true} a={a} b={b} onOpenChange={() => {}} onSuccess={vi.fn()} />,
    );
    // Picker IS visible because A has data.
    expect(screen.getByTestId('library-merge-field-cholesterol_mg')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByTestId('library-merge-submit'));
    await waitFor(() => expect(screen.getByTestId('library-merge-proceed')).toBeInTheDocument());
    await user.click(screen.getByTestId('library-merge-proceed'));

    await waitFor(() => expect(authPostMock).toHaveBeenCalledTimes(1));
    const [, payload] = authPostMock.mock.calls[0]!;
    // Winner side (A, log_count 10) value passes through.
    expect(payload.fields.nutrition.macros.cholesterol_mg).toBe(50);
  });
});
