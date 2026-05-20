/**
 * Bugfix batch followups Codex R1-I1 (2026-05-17) — when `commit()`
 * fails the inline-field validation pass, the user MUST get a
 * top-level visible signal that the save was blocked. The prior
 * implementation only set per-field `errors` + tried to focus the
 * first errored input. If the errored input lived inside a CLOSED
 * Radix Collapsible (the new edit-mode micros panel), the focus call
 * was a no-op AND no banner was rendered — Save appeared silently
 * blocked.
 *
 * Fix: `commit()` invokes the parent's `onFailed(saveFailedBanner)`
 * callback when validation fails, mirroring the network-failure
 * branch. The parent FoodDetail component already uses that callback
 * to render the `<p role="alert">` banner — wiring the validation
 * path through it makes the failure visible regardless of which
 * input owns the error.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useFoodDetailEdit } from '@/app/(app)/library/_components/FoodDetail/useFoodDetailEdit';
import { t } from '@/lib/i18n/en';
import type { LibraryItem } from '@/lib/library/fetch';

const baseItem: LibraryItem = {
  id: '11111111-1111-4111-8111-111111111111',
  client_id: '22222222-2222-4222-8222-222222222222',
  display_name: 'Pho Bo',
  normalized_name: 'pho bo',
  default_portion: 400,
  default_unit: 'g',
  nutrition: {
    kcal: 500,
    macros: { protein_g: 28, carbs_g: 50, fat_g: 18 },
    micros: { iron_mg: 3 },
  },
  thumbnail_url: null,
  log_count: 3,
  last_used_at: '2026-04-20T12:00:00Z',
  user_edited_flag: false,
  created_from: 'text',
  created_at: '2026-04-14T22:03:00Z',
};

describe('useFoodDetailEdit.commit — Codex R1-I1 form-banner on validation failure', () => {
  it('invokes onFailed with saveFailedBanner when a micro validation error occurs', async () => {
    const onCommitted = vi.fn();
    const onFailed = vi.fn();

    const { result } = renderHook(() => useFoodDetailEdit(baseItem));

    // Enter edit mode + drive an invalid micro value through the
    // generic-micros setter. `'abc'` is NaN → validateDraft flags it
    // under `errors.micros.iron` → commit must short-circuit AND
    // surface a banner via onFailed.
    act(() => {
      result.current.enter();
    });
    act(() => {
      result.current.setMicro('iron', 'abc');
    });

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.commit({
        itemId: baseItem.id,
        onCommitted,
        onFailed,
      });
    });

    expect(returned).toBe(false);
    expect(onCommitted).not.toHaveBeenCalled();
    // R1-I1 — onFailed is invoked exactly once with the standard save-
    // failed banner copy so the parent FoodDetail surfaces the
    // `<p role="alert">` regardless of which input owns the error.
    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(onFailed).toHaveBeenCalledWith(t.library.detail.saveFailedBanner);
    // Per-field error is still recorded for aria-invalid + inline alert.
    expect(result.current.errors.micros?.iron).toBeTruthy();
    // Form-level error is also set so `_form` consumers (if any) see
    // the same signal as the parent callback.
    expect(result.current.errors._form).toBe(t.library.detail.saveFailedBanner);
  });

  it('invokes onFailed for a top-level (name) validation error too', async () => {
    const onCommitted = vi.fn();
    const onFailed = vi.fn();

    const { result } = renderHook(() => useFoodDetailEdit(baseItem));
    act(() => {
      result.current.enter();
    });
    act(() => {
      result.current.setField('display_name', '');
    });

    let returned: boolean | undefined;
    await act(async () => {
      returned = await result.current.commit({
        itemId: baseItem.id,
        onCommitted,
        onFailed,
      });
    });

    expect(returned).toBe(false);
    expect(onCommitted).not.toHaveBeenCalled();
    expect(onFailed).toHaveBeenCalledWith(t.library.detail.saveFailedBanner);
    expect(result.current.errors.display_name).toBeTruthy();
  });
});
