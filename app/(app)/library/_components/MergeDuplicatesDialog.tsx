'use client';

/**
 * `<MergeDuplicatesDialog />` — Task 4.1 sub-step 3 §7.14.
 *
 * Side-by-side per-field picker with a nested "THIS CANNOT BE UNDONE"
 * pre-commit confirm. `useReducer<MergeFieldChoices, Action>` holds the
 * radio state; the submit handler calls `authPost('/api/library/merge', …)`
 * per §17 R1 contract.
 *
 * Dynamically imported by `<LibraryClient>` so this chunk isn't shipped on
 * first paint.
 */
import * as Dialog from '@radix-ui/react-dialog';
import { useReducer, useState } from 'react';

import { authPost, SessionExpiredError } from '@/lib/auth/refresh-interceptor';
import { t } from '@/lib/i18n/en';
import type { LibraryItem } from '@/lib/library/fetch';
import { pickDefaults } from '@/lib/library/merge-default';
import type { MergeChoiceTag, MergeFieldChoices } from '@/lib/library/types';

import { MergeField } from './MergeField';

type MergeAction =
  | { type: 'set'; field: keyof MergeFieldChoices; value: MergeChoiceTag | 'a' | 'b' }
  | {
      type: 'custom';
      // Codex R1 F1 fix — add cholesterol_custom to the custom action's
      // field union so the dialog can drive a CUSTOM value for the new
      // cholesterol picker (parity with protein/carbs/fat).
      field:
        | 'kcal_custom'
        | 'protein_custom'
        | 'carbs_custom'
        | 'fat_custom'
        | 'cholesterol_custom'
        | 'portion_custom';
      value: number | null;
    }
  | { type: 'reset'; choices: MergeFieldChoices };

function reducer(state: MergeFieldChoices, action: MergeAction): MergeFieldChoices {
  switch (action.type) {
    case 'set':
      return { ...state, [action.field]: action.value };
    case 'custom':
      return { ...state, [action.field]: action.value };
    case 'reset':
      return action.choices;
  }
}

export interface MergeSubmitPayload {
  winnerId: string;
  loserId: string;
  choices: MergeFieldChoices;
  client_id: string;
}

export interface MergeDuplicatesDialogProps {
  open: boolean;
  a: LibraryItem;
  b: LibraryItem;
  onOpenChange: (open: boolean) => void;
  /**
   * IF-1 (Codex adversarial round 1): `mergedWinner` is the RPC's
   * returned winner row (post-merge: summed log_count, max last_used_at,
   * updated fields), NOT the pre-merge local `winner` that was
   * previously passed. Using the local pre-merge copy meant the
   * optimistic grid state showed stale data until `router.refresh()`
   * completed — the merged row briefly displayed the old log_count,
   * old last_used_at, etc.
   */
  onSuccess: (mergedWinner: LibraryItem, loser: LibraryItem) => void;
}

function pickValue(choice: MergeChoiceTag, a: number, b: number, custom: number | null): number {
  if (choice === 'a') return a;
  if (choice === 'b') return b;
  return custom ?? a;
}

export function MergeDuplicatesDialog({
  open,
  a,
  b,
  onOpenChange,
  onSuccess,
}: MergeDuplicatesDialogProps) {
  const [choices, dispatch] = useReducer(reducer, undefined, () => pickDefaults(a, b));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aKcal = a.nutrition?.kcal ?? 0;
  const bKcal = b.nutrition?.kcal ?? 0;
  const aProtein = a.nutrition?.macros?.protein_g ?? 0;
  const bProtein = b.nutrition?.macros?.protein_g ?? 0;
  const aCarbs = a.nutrition?.macros?.carbs_g ?? 0;
  const bCarbs = b.nutrition?.macros?.carbs_g ?? 0;
  const aFat = a.nutrition?.macros?.fat_g ?? 0;
  const bFat = b.nutrition?.macros?.fat_g ?? 0;
  // Codex R1 F1 fix — cholesterol candidate extraction. Reads the
  // optional `cholesterol_mg` macro key off both sides. Legacy rows
  // (no key) default to 0 for picker display; the merge submit path
  // omits the field entirely when both sides are absent so the merge
  // RPC's full-replacement does not write a phantom 0mg.
  const aMacros = a.nutrition?.macros as { cholesterol_mg?: number } | undefined;
  const bMacros = b.nutrition?.macros as { cholesterol_mg?: number } | undefined;
  const aHasCholesterol =
    aMacros !== undefined && Object.prototype.hasOwnProperty.call(aMacros, 'cholesterol_mg');
  const bHasCholesterol =
    bMacros !== undefined && Object.prototype.hasOwnProperty.call(bMacros, 'cholesterol_mg');
  const aCholesterol = aMacros?.cholesterol_mg ?? 0;
  const bCholesterol = bMacros?.cholesterol_mg ?? 0;
  const cholesterolVisible = aHasCholesterol || bHasCholesterol;
  const aPortion = a.default_portion ?? 1;
  const bPortion = b.default_portion ?? 1;

  const handleOpenConfirm = () => {
    setError(null);
    setConfirmOpen(true);
  };

  const handleProceed = async () => {
    setPending(true);
    setError(null);
    // Winner = display_name choice. Loser is the other side.
    const winner = choices.display_name === 'a' ? a : b;
    const loser = choices.display_name === 'a' ? b : a;
    // CF-1 (Codex adversarial round 1) defensive UI check. Unreachable
    // under normal flow because the BulkActionsBar only materializes at
    // N≥2 distinct selected items, but guards against store manipulation
    // / prop manipulation bugs that could make winner.id === loser.id
    // reach this handler.
    if (winner.id === loser.id) {
      setError(t.library.mergeErrorBanner);
      setPending(false);
      return;
    }
    const thumb = choices.thumbnail_url === 'a' ? a.thumbnail_url : b.thumbnail_url;
    // Bugfix R1 C1 — signed URL persistence guard. The dialog displays
    // sign-on-read 1-hour signed URLs (post-Bug-3 SIGN_LIMIT raise).
    // We send the SOURCE ROW ID alongside the (signed) URL so the
    // server can re-resolve the raw storage path before writing to
    // the database. The legacy `thumbnail_url` field is kept for
    // back-compat — the server ignores its content when source id is
    // present.
    const thumbnailSource = choices.thumbnail_url === 'a' ? a : b;
    const unit = choices.default_unit === 'a' ? a.default_unit : b.default_unit;
    const fields = {
      display_name: winner.display_name,
      thumbnail_url: thumb,
      default_portion: pickValue(
        choices.default_portion,
        aPortion,
        bPortion,
        choices.portion_custom,
      ),
      default_unit: unit ?? 'piece',
      nutrition: {
        kcal: pickValue(choices.kcal, aKcal, bKcal, choices.kcal_custom),
        macros: {
          protein_g: pickValue(choices.protein_g, aProtein, bProtein, choices.protein_custom),
          carbs_g: pickValue(choices.carbs_g, aCarbs, bCarbs, choices.carbs_custom),
          fat_g: pickValue(choices.fat_g, aFat, bFat, choices.fat_custom),
          // Codex R1 F1 fix — thread cholesterol_mg through the merge
          // payload. The merge RPC replaces winner.nutrition wholesale
          // (`p_fields->'nutrition'`), so any cholesterol value not
          // included here is erased from the surviving row. We only
          // emit the key when at least one source side had it, to
          // avoid materialising a phantom 0mg for legacy-only pairs.
          ...(cholesterolVisible
            ? {
                cholesterol_mg: pickValue(
                  choices.cholesterol_mg ?? 'a',
                  aCholesterol,
                  bCholesterol,
                  choices.cholesterol_custom ?? null,
                ),
              }
            : {}),
        },
      },
    };

    try {
      const payload = {
        client_id: crypto.randomUUID(),
        winnerId: winner.id,
        loserId: loser.id,
        // Bugfix R1 C1 — discriminator for server-side raw-path resolve.
        thumbnail_source_id: thumbnailSource.id,
        fields,
      };
      // IF-1 (Codex adversarial round 1): capture the RPC-returned
      // winner (post-merge: summed log_count + max last_used_at + merged
      // fields) and forward it to `onSuccess` so the optimistic grid
      // state shows merged data immediately, not the stale pre-merge
      // local copy.
      const response = await authPost<{ winner: LibraryItem }>('/api/library/merge', payload);
      setConfirmOpen(false);
      onOpenChange(false);
      onSuccess(response.winner, loser);
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        // Interceptor already redirected; dialog will unmount with the route.
        return;
      }
      setError(t.library.mergeErrorBanner);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="kalori-library-dialog-overlay" />
        <Dialog.Content
          className="kalori-library-dialog-content"
          data-size="merge"
          data-testid="library-merge-dialog"
          aria-describedby="library-merge-body"
        >
          <p className="kalori-library-dialog-kicker">{t.library.mergeKicker}</p>
          <Dialog.Title className="kalori-library-dialog-title">
            {t.library.mergeTitle}
          </Dialog.Title>
          <Dialog.Description id="library-merge-body" className="kalori-library-dialog-body">
            {t.library.mergeBody}
          </Dialog.Description>

          <MergeField
            legend={t.library.mergeFieldName}
            name="display_name"
            valueA={a.display_name}
            valueB={b.display_name}
            choice={choices.display_name}
            onChoice={(v) =>
              dispatch({ type: 'set', field: 'display_name', value: v as 'a' | 'b' })
            }
          />
          <MergeField
            legend={t.library.mergeFieldThumb}
            name="thumbnail_url"
            valueA={a.thumbnail_url ? 'Photo A' : t.library.mergeThumbNone}
            valueB={b.thumbnail_url ? 'Photo B' : t.library.mergeThumbNone}
            choice={choices.thumbnail_url}
            onChoice={(v) =>
              dispatch({ type: 'set', field: 'thumbnail_url', value: v as 'a' | 'b' })
            }
          />
          <MergeField
            legend={t.library.mergeFieldKcal}
            name="kcal"
            valueA={String(aKcal)}
            valueB={String(bKcal)}
            choice={choices.kcal}
            onChoice={(v) => dispatch({ type: 'set', field: 'kcal', value: v })}
            allowCustom
            customValue={choices.kcal_custom}
            onCustomChange={(n) => dispatch({ type: 'custom', field: 'kcal_custom', value: n })}
            customLabel={t.library.mergeOptionCustom}
          />
          <MergeField
            legend={t.library.mergeFieldProtein}
            name="protein_g"
            valueA={String(aProtein)}
            valueB={String(bProtein)}
            choice={choices.protein_g}
            onChoice={(v) => dispatch({ type: 'set', field: 'protein_g', value: v })}
            allowCustom
            customValue={choices.protein_custom}
            onCustomChange={(n) => dispatch({ type: 'custom', field: 'protein_custom', value: n })}
            customLabel={t.library.mergeOptionCustom}
          />
          <MergeField
            legend={t.library.mergeFieldCarbs}
            name="carbs_g"
            valueA={String(aCarbs)}
            valueB={String(bCarbs)}
            choice={choices.carbs_g}
            onChoice={(v) => dispatch({ type: 'set', field: 'carbs_g', value: v })}
            allowCustom
            customValue={choices.carbs_custom}
            onCustomChange={(n) => dispatch({ type: 'custom', field: 'carbs_custom', value: n })}
            customLabel={t.library.mergeOptionCustom}
          />
          <MergeField
            legend={t.library.mergeFieldFat}
            name="fat_g"
            valueA={String(aFat)}
            valueB={String(bFat)}
            choice={choices.fat_g}
            onChoice={(v) => dispatch({ type: 'set', field: 'fat_g', value: v })}
            allowCustom
            customValue={choices.fat_custom}
            onCustomChange={(n) => dispatch({ type: 'custom', field: 'fat_custom', value: n })}
            customLabel={t.library.mergeOptionCustom}
          />
          {/* Codex R1 F1 fix — cholesterol picker. Only rendered when at
              least one side actually carries cholesterol data, so legacy
              row pairs do not see an empty mg row prompting them for a
              field neither side has. Once the user types a CUSTOM value
              for a legacy-only side, `cholesterolVisible` does not flip
              mid-render (memoised by side props) — the picker stays
              hidden until the data exists; that's an intentional
              boundary, not a usability bug. */}
          {cholesterolVisible ? (
            <MergeField
              legend={t.library.mergeFieldCholesterol}
              name="cholesterol_mg"
              valueA={String(aCholesterol)}
              valueB={String(bCholesterol)}
              choice={choices.cholesterol_mg ?? 'a'}
              onChoice={(v) => dispatch({ type: 'set', field: 'cholesterol_mg', value: v })}
              allowCustom
              customValue={choices.cholesterol_custom ?? null}
              onCustomChange={(n) =>
                dispatch({ type: 'custom', field: 'cholesterol_custom', value: n })
              }
              customLabel={t.library.mergeOptionCustom}
            />
          ) : null}
          <MergeField
            legend={t.library.mergeFieldPortion}
            name="default_portion"
            valueA={String(aPortion)}
            valueB={String(bPortion)}
            choice={choices.default_portion}
            onChoice={(v) => dispatch({ type: 'set', field: 'default_portion', value: v })}
            allowCustom
            customValue={choices.portion_custom}
            onCustomChange={(n) => dispatch({ type: 'custom', field: 'portion_custom', value: n })}
            customLabel={t.library.mergeOptionCustom}
          />
          <MergeField
            legend={t.library.mergeFieldUnit}
            name="default_unit"
            valueA={a.default_unit ?? 'piece'}
            valueB={b.default_unit ?? 'piece'}
            choice={choices.default_unit}
            onChoice={(v) =>
              dispatch({ type: 'set', field: 'default_unit', value: v as 'a' | 'b' })
            }
          />

          {error ? (
            <div
              role="alert"
              className="kalori-library-merge-error"
              data-testid="library-merge-error"
            >
              {error}
            </div>
          ) : null}

          <div className="kalori-library-dialog-actions">
            <Dialog.Close asChild>
              <button
                type="button"
                className="kalori-library-btn-ghost"
                data-testid="library-merge-cancel"
              >
                {t.library.cancelButton}
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleOpenConfirm}
              data-testid="library-merge-submit"
              className="kalori-library-pill"
            >
              {t.library.mergeSubmit}
            </button>
          </div>

          {/* Nested pre-commit confirm — stacked dialog per §7.14. */}
          <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
            <Dialog.Portal>
              <Dialog.Overlay className="kalori-library-dialog-overlay" />
              <Dialog.Content
                className="kalori-library-dialog-content"
                data-testid="library-merge-confirm-dialog"
                aria-describedby="library-merge-confirm-body"
              >
                {/* Task 4.1 Phase 3 fix (P3-bug-5): Radix's `useWarnings`
                    races with the nested Portal commit — the `Dialog.Description`
                    below mounts AFTER Radix first checks for it, so the
                    dev warning fires even though the description exists.
                    Mounting a visually-hidden duplicate inside the Content
                    tree (outside the Portal boundary of the parent dialog)
                    registers the id synchronously and silences the warning
                    without affecting the a11y tree — screen readers just
                    see a single description target. */}
                <span id="library-merge-confirm-body" className="sr-only">
                  {t.library.mergeConfirmBody}
                </span>
                <p className="kalori-library-dialog-kicker">{t.library.mergeConfirmKicker}</p>
                <Dialog.Title className="kalori-library-dialog-title" data-variant="destructive">
                  {t.library.mergeConfirmTitle}
                </Dialog.Title>
                <Dialog.Description
                  id="library-merge-confirm-body-visible"
                  className="kalori-library-dialog-body"
                >
                  {t.library.mergeConfirmBody}
                </Dialog.Description>
                <div className="kalori-library-dialog-actions">
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      autoFocus
                      className="kalori-library-btn-ghost"
                      data-testid="library-merge-confirm-cancel"
                    >
                      {t.library.cancelButton}
                    </button>
                  </Dialog.Close>
                  <button
                    type="button"
                    onClick={handleProceed}
                    disabled={pending}
                    aria-disabled={pending}
                    className="kalori-library-pill"
                    data-testid="library-merge-proceed"
                  >
                    {pending ? '…' : t.library.mergeConfirmProceed}
                  </button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default MergeDuplicatesDialog;
