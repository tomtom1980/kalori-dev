'use client';

/**
 * `useFoodDetailEdit` — Task 4.2.
 *
 * Centralized state + validation for the FoodDetail edit form.
 *
 * Deviation from Quick-Pick §5 "Forms + validation" (react-hook-form +
 * zod resolver, ~9 KB gz): EditMode has ≤ 7 shallow fields, trivial
 * validation, no async, no field arrays. Native `useState` is sufficient
 * + Zod on commit. ~9 KB saved. Briefing §5.2 justifies. If the form
 * grows past ~15 fields or adds async validation, promote to RHF.
 *
 * The hook intentionally exports primitive string state (NOT coerced
 * numbers) so inputs stay controllable without NaN-on-blur; coercion +
 * validation happen in `commit()` right before the authPost.
 */
import { useCallback, useMemo, useState } from 'react';

import { authPost } from '@/lib/auth/refresh-interceptor';
import { t } from '@/lib/i18n/en';
import type { LibraryItem } from '@/lib/library/fetch';

import { EditFieldsSchema, type EditFields } from './foodDetail.schema';

export interface DraftState {
  display_name: string;
  default_portion: string;
  default_unit: string;
  kcal: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  fiber_g: string;
  sugar_g: string;
  sodium_mg: string;
}

export type DraftKey = keyof DraftState;

export type EditErrors = Partial<Record<DraftKey | '_form', string>>;

function nullableNum(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function nullableStr(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

function itemToDraft(item: LibraryItem): DraftState {
  const macros = item.nutrition.macros ?? { protein_g: 0, carbs_g: 0, fat_g: 0 };
  const micros = item.nutrition.micros ?? {};
  const optional = (v: number | null | undefined): string =>
    v === null || v === undefined ? '' : String(v);
  return {
    display_name: item.display_name,
    default_portion: optional(item.default_portion),
    default_unit: item.default_unit ?? '',
    kcal: optional(item.nutrition.kcal),
    protein_g: optional(macros.protein_g ?? null),
    carbs_g: optional(macros.carbs_g ?? null),
    fat_g: optional(macros.fat_g ?? null),
    fiber_g: optional(macros.fiber_g ?? null),
    sugar_g: optional((macros as { sugar_g?: number }).sugar_g ?? null),
    sodium_mg: optional((micros as Record<string, number>).sodium_mg ?? null),
  };
}

function buildFieldsPatch(initial: LibraryItem, draft: DraftState): EditFields | null {
  const fields: EditFields = {};
  // Name
  const name = draft.display_name.trim();
  if (name !== initial.display_name.trim()) {
    fields.display_name = name;
  }
  // Portion
  const portion = nullableNum(draft.default_portion);
  if (portion !== undefined && portion !== initial.default_portion) {
    fields.default_portion = portion;
  }
  // Unit
  const unit = nullableStr(draft.default_unit);
  if (unit !== initial.default_unit) {
    fields.default_unit = unit;
  }

  // Nutrition — Task 4.2 round 1 C2 fix.
  //
  // Supabase `.update({ nutrition: {...} })` is a SHALLOW JSONB
  // replacement. If we sent only the changed macros, every untouched
  // sibling (kcal / fat_g / carbs_g / micros / etc.) would be silently
  // nulled in the database. So the client always POSTs the full post-edit
  // nutrition object: `{ ...initial, ...draft diffs }`. When none of the
  // seven nutrition fields moved, we omit `nutrition` entirely to avoid
  // writing an identity patch.
  const initMacros = initial.nutrition.macros ?? {
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    sugar_g: 0,
  };
  const initMicros = initial.nutrition.micros ?? {};

  const resolveMacro = (
    key: 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g' | 'sugar_g',
    raw: string,
  ): { value: number; changed: boolean } => {
    const prev = (initMacros as Record<string, number | undefined>)[key] ?? 0;
    const n = nullableNum(raw);
    if (n === undefined || n === null) return { value: prev, changed: false };
    return { value: n, changed: n !== prev };
  };
  const protein = resolveMacro('protein_g', draft.protein_g);
  const carbs = resolveMacro('carbs_g', draft.carbs_g);
  const fat = resolveMacro('fat_g', draft.fat_g);
  const fiber = resolveMacro('fiber_g', draft.fiber_g);
  const sugar = resolveMacro('sugar_g', draft.sugar_g);

  const kcalRaw = nullableNum(draft.kcal);
  const kcalPrev = initial.nutrition.kcal;
  const kcalChanged = kcalRaw !== undefined && kcalRaw !== null && Math.round(kcalRaw) !== kcalPrev;
  const kcalValue =
    kcalChanged && kcalRaw !== null && kcalRaw !== undefined ? Math.round(kcalRaw) : kcalPrev;

  const sodium = nullableNum(draft.sodium_mg);
  const sodiumPrev = (initMicros as Record<string, number | undefined>).sodium_mg;
  const sodiumChanged = sodium !== undefined && sodium !== null && sodium !== sodiumPrev;

  const anyNutritionChanged =
    kcalChanged ||
    protein.changed ||
    carbs.changed ||
    fat.changed ||
    fiber.changed ||
    sugar.changed ||
    sodiumChanged;

  if (anyNutritionChanged) {
    // Merge micros: preserve every existing micro, overlay the edited
    // sodium_mg if the user changed it.
    const mergedMicros: Record<string, number> = { ...(initMicros as Record<string, number>) };
    if (sodiumChanged && sodium !== undefined && sodium !== null) {
      mergedMicros.sodium_mg = sodium;
    }
    fields.nutrition = {
      kcal: kcalValue,
      macros: {
        protein_g: protein.value,
        carbs_g: carbs.value,
        fat_g: fat.value,
        fiber_g: fiber.value,
        sugar_g: sugar.value,
      },
      ...(Object.keys(mergedMicros).length > 0 ? { micros: mergedMicros } : {}),
    };
  }

  if (Object.keys(fields).length === 0) return null;
  return fields;
}

function validateDraft(draft: DraftState): EditErrors {
  const errs: EditErrors = {};
  const name = draft.display_name.trim();
  if (name.length === 0) errs.display_name = t.library.detail.errNameRequired;
  else if (name.length > 120) errs.display_name = t.library.detail.errNameTooLong;

  const portionRaw = draft.default_portion.trim();
  if (portionRaw !== '') {
    const n = Number(portionRaw);
    if (!Number.isFinite(n) || n <= 0) {
      errs.default_portion = t.library.detail.errPortionPositive;
    }
  }

  const unit = draft.default_unit;
  if (unit.length > 16) errs.default_unit = t.library.detail.errUnitTooLong;

  const kcalRaw = draft.kcal.trim();
  if (kcalRaw !== '') {
    const n = Number(kcalRaw);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      errs.kcal = t.library.detail.errKcalInteger;
    }
  }

  const checkNonneg = (raw: string, key: DraftKey) => {
    const trimmed = raw.trim();
    if (trimmed === '') return;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) {
      errs[key] = t.library.detail.errMacroNonneg;
    }
  };
  checkNonneg(draft.protein_g, 'protein_g');
  checkNonneg(draft.carbs_g, 'carbs_g');
  checkNonneg(draft.fat_g, 'fat_g');
  checkNonneg(draft.fiber_g, 'fiber_g');
  checkNonneg(draft.sugar_g, 'sugar_g');
  checkNonneg(draft.sodium_mg, 'sodium_mg');

  return errs;
}

export function useFoodDetailEdit(initial: LibraryItem) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftState>(() => itemToDraft(initial));
  const [errors, setErrors] = useState<EditErrors>({});
  const [saving, setSaving] = useState(false);

  const initialDraft = useMemo(() => itemToDraft(initial), [initial]);

  const dirty = useMemo(() => {
    for (const key of Object.keys(draft) as DraftKey[]) {
      if (draft[key] !== initialDraft[key]) return true;
    }
    return false;
  }, [draft, initialDraft]);

  const setField = useCallback((key: DraftKey, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    // Clear this field's error on change (error re-validates on commit).
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const enter = useCallback(() => {
    setDraft(itemToDraft(initial));
    setErrors({});
    setEditing(true);
  }, [initial]);

  const cancel = useCallback(() => {
    setDraft(itemToDraft(initial));
    setErrors({});
    setEditing(false);
  }, [initial]);

  const commit = useCallback(
    async ({
      itemId,
      onCommitted,
      onFailed,
    }: {
      itemId: string;
      onCommitted: (next: LibraryItem) => void;
      onFailed: (message: string) => void;
    }): Promise<boolean> => {
      const validation = validateDraft(draft);
      if (Object.keys(validation).length > 0) {
        setErrors(validation);
        // V10 (Task 4.2 round 1 a11y fix) — focus the first invalid field
        // in canonical top-to-bottom field order so keyboard/SR users
        // can immediately edit it. Uses the id convention `fd-edit-${key}`
        // shared by every input in FoodDetailName + FoodDetailMacros.
        const ORDER: DraftKey[] = [
          'display_name',
          'default_portion',
          'default_unit',
          'kcal',
          'protein_g',
          'carbs_g',
          'fat_g',
          'fiber_g',
          'sugar_g',
          'sodium_mg',
        ];
        const firstErr = ORDER.find((k) => validation[k]);
        if (firstErr && typeof document !== 'undefined') {
          // Map DraftKey → input DOM id. Ids predate the round-1 fix and
          // don't follow a single convention (some are short labels, some
          // are the exact key), so spell out the mapping here.
          const ID_MAP: Record<DraftKey, string> = {
            display_name: 'fd-edit-name',
            default_portion: 'fd-edit-portion',
            default_unit: 'fd-edit-unit',
            kcal: 'fd-edit-kcal',
            protein_g: 'fd-edit-protein_g',
            carbs_g: 'fd-edit-carbs_g',
            fat_g: 'fd-edit-fat_g',
            fiber_g: 'fd-edit-fiber',
            sugar_g: 'fd-edit-sugar',
            sodium_mg: 'fd-edit-sodium',
          };
          const targetId = ID_MAP[firstErr];
          // Defer focus so it runs AFTER the click handler's default focus
          // on SAVE + React's re-render pass. Without deferral, the click
          // focus would overwrite our call and the user would see focus
          // stuck on the submit button.
          setTimeout(() => {
            const el = document.getElementById(targetId);
            if (el instanceof HTMLElement) el.focus();
          }, 0);
        }
        return false;
      }

      const fields = buildFieldsPatch(initial, draft);
      if (!fields) {
        // Nothing to commit; treat as success (closes edit mode cleanly).
        setEditing(false);
        return true;
      }

      const parsed = EditFieldsSchema.safeParse(fields);
      if (!parsed.success) {
        setErrors({ _form: t.library.detail.saveFailedBanner });
        return false;
      }

      setSaving(true);
      try {
        const result = await authPost<{ item: LibraryItem }>(`/api/library/${itemId}/update`, {
          client_id: crypto.randomUUID(),
          fields: parsed.data,
        });
        setSaving(false);
        setEditing(false);
        setErrors({});
        onCommitted(result.item);
        return true;
      } catch (err) {
        setSaving(false);
        const message = t.library.detail.saveFailedBanner;
        setErrors((prev) => ({ ...prev, _form: message }));
        onFailed(message);
        // Surface error upstream only on non-session failures.
        void err;
        return false;
      }
    },
    [draft, initial],
  );

  return {
    editing,
    draft,
    errors,
    saving,
    dirty,
    setField,
    enter,
    cancel,
    commit,
  };
}

// Expose pure validators for testing.
export const __internals = {
  itemToDraft,
  buildFieldsPatch,
  validateDraft,
};
