# Codex R3 Auto-fix — Client improvements (I2-R2-1, I2-R2-2)

## Findings addressed
- **I2-R2-1** — `useFoodDetailEdit.ts` `setMicro` silently clamps negative inputs (`Math.max(n, 0)`) before they reach `validateMicroValue`, bypassing the R1 I1 rejection contract and silently saving invalid `-5` → `0` with no UX signal.
- **I2-R2-2** — `errs.micros` was a single aggregate string with no per-input target. Commit focus skipped micros, inputs had no `aria-invalid`, and there was no inline error rendered. Result: blocked save with no focused field and no per-field error — a11y/recoverability regression.

## False-positive check
Neither finding is a false positive. Both regressions were directly introduced by the R1 cluster:

- The `Math.max(n, 0)` clamp in `setMicro` (line 596 of the pre-R3 file) was added in the same R1 commit that taught `validateMicroValue` to reject negatives — the two paths contradict each other. Codex correctly identifies that the UI path bypasses the validator path.
- `errs.micros = t.library.detail.errMacroNonneg` (the R1 aggregate-string assignment) is set, but the commit focus `ORDER` excluded `'micros'`, the `ID_MAP` had `micros: ''` (no-op sentinel), and `<EditMicrosCollapsible />` never read `errors.micros` for any input. Codex's recoverability analysis is correct.

## Files modified

1. **`lib/i18n/en.ts`** — added one new key:
   - `errMicroNumber: 'Must be a number.'` — distinct from `errMacroNonneg` (negative/zero class), reserved for NaN class. Keeps user-facing copy specific to the failure mode.

2. **`app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts`** — four targeted changes:
   - **Type shape** — `EditErrors.micros` reshaped from `string` → `MicrosErrors` (`Record<string,string>` keyed on canonical micro code). All other DraftKey fields keep the single-string error shape (since they map to single inputs each). A new exported `MicrosErrors` type carries the per-key map.
   - **`setMicro`** — removed `Math.max(n, 0)`. Negative + NaN values now propagate verbatim as raw strings so `validateDraft` can flag them. The `MAX_MICRO_VALUE` upper-bound clamp is PRESERVED (data-integrity defense, not user-typo class). Added a per-key error clear in the setter (mirrors `setField`) so editing a previously-errored micro removes its error immediately.
   - **`validateDraft`** — replaced the aggregate-string assignment with a per-key map build. NaN → `errMicroNumber`, negative → `errMacroNonneg` (reuses existing key). Empty `microsErrs` map → key absent (`errs.micros` undefined) so the commit's `Object.keys(validation).length > 0` semantics still work cleanly.
   - **`commit`** — extended the focus `ORDER` to include `'micros'` as the LAST entry (visual order: micros panel sits beneath sodium). Added a `firstErr === 'micros'` branch that picks the first errored canonical key from `validation.micros` and routes to `fd-edit-micro-${canonicalKey}` (the existing id convention in `<EditMicrosCollapsible />`). Narrowed `ID_MAP` type to `Exclude<DraftKey,'micros'>` so the special-cased micros lookup is type-safe. Note: if the user's collapsible panel is closed, the input element is not in the DOM and the focus call is a silent no-op — the SAVE banner + inline error message still surface once the user expands. This is the practical limit of imperative focus into a Radix Collapsible; no internal ref API exists to expand programmatically.
   - **`checkNonneg`** helper — narrowed key parameter to `Exclude<DraftKey,'micros'>` so the writes `errs[key] = ...` are type-safe under the new shape.

3. **`app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx`** — per-input error rendering added to the generic-micro inputs in `<EditMicrosCollapsible />`:
   - Read `errors.micros?.[row.code]` per row.
   - Apply `aria-invalid={Boolean(microErr)}` to the input.
   - Apply `aria-describedby={errorId}` where `errorId = "fd-edit-micro-{code}-error"`.
   - Render `<p id={errorId} role="alert" className="kalori-fd-error" data-testid="food-detail-edit-micro-{code}-error" style={{ gridColumn: '1 / -1' }}>{microErr}</p>` directly below the errored input. The `gridColumn: '1 / -1'` makes the alert span the full row inside the 2-col `display: contents` grid, matching the existing macros error pattern (`MacroDisplay` at line 358, `CholesterolMacroDisplay` at line 448).
   - Sodium and sugar inputs are intentionally untouched — sodium uses `errors.sodium_mg`, sugar uses `errors.sugar_g`, both single-string DraftKey errors with their own existing rendering paths.

4. **`tests/unit/foodDetail/useFoodDetailEdit.editmicros.test.ts`** — added 7 new tests across 2 new describe blocks:
   - **`Codex R3 I2-R2-1`** (5 tests): negative preserves raw string + surfaces error; NaN preserves raw string + surfaces NaN-class error; above-MAX clamps silently; zero is accepted; multiple invalid micros each get per-key errors.
   - **`Codex R3 I2-R2-2`** (2 tests): `errs.micros` is `Record<string,string>` (not a string); valid drafts return undefined for `errs.micros` (no empty-object spam).

5. **`tests/components/library/FoodDetailMacros.editmicros.test.tsx`** — added 5 new tests in a new describe block (`Codex R3 I2-R2-2 a11y for micros validation errors`):
   - Errored micro input renders `aria-invalid="true"`.
   - Inline `<p role="alert" data-testid="food-detail-edit-micro-{code}-error">` is rendered below input with matching error text.
   - `aria-describedby` on input matches the `id` on the error `<p>`.
   - Non-errored sibling input is clean (no `aria-invalid='true'`, no error message).
   - Clean draft renders all inputs without any error decorations.

## Error-pattern conformance with existing macros precedent

The new generic-micro error rendering MIRRORS the existing `FoodDetailName.tsx` name/portion/unit pattern (the more complete precedent — those three already have id'd `<p role="alert">` + `aria-describedby` wiring). The `<MacroDisplay>` and `<CholesterolMacroDisplay>` patterns in `FoodDetailMacros.tsx` itself use a SUBSET of this (`aria-invalid` + `<p role="alert">` but no `aria-describedby`, no id on the alert). I chose the more-complete precedent (`FoodDetailName`'s pattern) because it gives proper a11y wiring for screen readers — the existing partial pattern in MacroDisplay is itself a small gap. Did NOT touch MacroDisplay / CholesterolMacroDisplay to avoid scope creep beyond the I2-R2-2 finding.

Per-key error CLEAR on `setMicro` matches the existing `setField` precedent (line 578 of the pre-R3 file), so the UX behaviour around editing-clears-the-error is identical between macros and generic micros.

## Test results

- **New RED tests:** 12 added (7 hook + 5 component); 12/12 GREEN after fix.
- **Touched-file vitest:** 44/44 tests pass in 2.66s across the two edited test files.
- **Full library sweep:** see broader sweep results below; no regressions.
- **Full repo sweep (incidental, prior to scoped re-run):** 2881 passed, 99 skipped, 0 failed across 380 test files. (The `ECONNREFUSED ::1:3000` noise at the top of stderr is from tests that try a dev-server probe; pre-existing, not introduced by R3.)

## Typecheck / lint

- `pnpm typecheck`: clean (zero errors). One issue surfaced during the fix and resolved: the `checkNonneg` helper in `validateDraft` was previously typed `(raw, key: DraftKey)` and writing `errs[key] = string` — that's incompatible with the new `errs.micros: MicrosErrors` field. Narrowed `key` to `Exclude<DraftKey, 'micros'>` since the helper is only ever called with macro keys; this is a true type tightening (not a workaround) and the runtime behaviour is unchanged.
- `pnpm eslint` on touched files: clean (zero output, zero warnings).

## Out of scope

- **C2-R2-1 + C2-R2-2** (server-side MAX_MICRO_VALUE scope-expansion to save-to-library + merge routes) — parallel sub-agent owns those surfaces. Constant extraction to `lib/library/micros-bounds.ts` was already merged into `useFoodDetailEdit.ts` at the time of this R3 client cluster; the client now imports the shared constant via `SHARED_MAX_MICRO_VALUE`.
- **MacroDisplay / CholesterolMacroDisplay `aria-describedby` gap** — partial-pattern in those two components (`aria-invalid` + `<p role="alert">` but no id on the alert, no `aria-describedby` on the input). Noted but not fixed — outside the I2-R2-2 finding scope and would be a separate batch.
- **Programmatic Radix Collapsible expansion on focus** — when the user clicks Save with the micros panel collapsed and an invalid micro inside, the focus call lands on a not-rendered DOM element (no-op). The inline `<p role="alert">` is also not in the DOM until the user expands the panel manually. Acceptable per scope: the SAVE banner is still shown, and once the user expands the panel the per-key error is right there next to the input. Solving this properly requires either a controlled Collapsible (state lifted into the parent so commit can `setOpen(true)`) or a Radix ref API that does not exist for the public Collapsible. Captured as a known limit in the commit handler comment, not a regression vs the pre-R3 surface.
