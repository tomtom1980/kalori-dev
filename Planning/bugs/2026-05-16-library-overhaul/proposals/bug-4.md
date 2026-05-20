# Bug 4 — Mutation feedback + interaction-block on Edit/Save/Delete

**Batch:** `2026-05-16-library-overhaul`
**Classification:** `needs_debug_shallow` → known partial-fix
**UI Touching:** YES
**TDD Required:** YES (logic-touching: disabled-state wiring + new aria-busy regions)
**Risk:** Low–Medium (touches mutation surfaces, but additive — no API contract change)

---

## 1. Bug description (verbatim)

> "When we do the edit, delete and save, and when there is a change happening, we always need to see the loading animation that something is happening. We shouldn't be able to do anything else until that load is finished."

**Intent:** Every library mutation (Edit / Save / Delete) MUST (a) show visible loading feedback and (b) block competing UI interactions until the request resolves.

---

## 2. Current state (audited)

| Operation | Source of `pending` | Button disabled? | Label/spinner? | `aria-busy`? | Other UI blocked? |
|---|---|---|---|---|---|
| Save (edit commit) | `edit.saving` from `useFoodDetailEdit.ts:216` | SAVE + CANCEL | label swap → `t.library.detail.saving` | NO on form | **NO** — inputs editable, BACK/CLOSE/scrim still active |
| Delete (confirm) | `pending` in `BulkDeleteConfirmDialog.tsx:52` | CONFIRM only | label shows `'…'` (bare ellipsis, no word) | NO | **NO** — CANCEL button + scrim + ESC still close the dialog mid-flight |
| Log Now | `logNowPending` in `FoodDetail.tsx:82` | YES | YES — full label swap + sr-only live region | YES on button | **NO** — EDIT/DELETE still clickable |

**Key gaps**
1. **Save flow:** edit inputs (Name, Portion, Unit, Kcal, Macros) are NOT disabled while saving — user can keep typing, and the dirty diff captured at commit-time may not match what they now see on screen. BACK/CLOSE buttons + scrim are live, so the user can navigate away mid-POST.
2. **Delete dialog:** the `'…'` ellipsis is not a real loading label (fails ux-design Quick-Pick §2 loading-buttons spec — needs word + spinner glyph). CANCEL is NOT disabled while POST is in flight (only CONFIRM is) — clicking CANCEL closes the dialog and the user loses all signal that a delete is mid-flight. ESC + scrim-click also still close the dialog (Radix `onOpenChange` not gated by `pending`).
3. **Cross-operation:** no operation disables the OTHER operations. While Save is firing, the user can click DELETE (opens dialog), click LOG NOW (fires another mutation), click BACK (navigates away mid-save). All three operations share the same FoodDetail sheet but each owns its own pending state in isolation.
4. **Optimistic delete:** `useOptimistic` tombstones the item AND immediately calls `router.push('/library')` BEFORE the server confirms (FoodDetail.tsx:282–283). This is the lesson #7 / #16 anti-pattern: the UI says "done" before the network does. If the POST fails, the user is already off-page and only sees a failure toast (`deleteFailedToast`) — they have no visible "saving / deleting" beat to anchor the error to.

---

## 3. Proposed fix

### 3a. Save flow (`useFoodDetailEdit.ts` + `FoodDetail.tsx` + `FoodDetailActions.tsx`)
- Pass `edit.saving` down into `FoodDetailName` and `FoodDetailMacros` and disable every `<input>` while saving (add `disabled={saving}` + `aria-disabled={saving}`).
- Add `aria-busy={saving}` to the `<aside role="dialog">` sheet root in FoodDetail.tsx so AT announces busy state for the WHOLE sheet, not just the SAVE button.
- Disable BACK + CLOSE buttons in the topbar (`FoodDetail.tsx:425–443`) when `edit.saving || logNowPending || deleteInFlight` (new aggregated flag — see 3d).
- Add scrim guard: `kalori-fd-scrim`'s `onClick={onClose}` already exists; gate it with the aggregated flag.

### 3b. Delete dialog (`BulkDeleteConfirmDialog.tsx`)
- Replace `'…'` with proper loading label: `pending ? t.library.bulkDeleteDeleting : strikeLabel` (NEW i18n key `t.library.bulkDeleteDeleting = 'DELETING…'` or matching ledger voice). Add `aria-busy={pending}` to the CONFIRM button.
- Disable CANCEL while `pending`: `<button disabled={pending} ...>` on the Dialog.Close trigger.
- Gate `onOpenChange` so ESC and scrim cannot close the dialog mid-POST: `onOpenChange={(next) => { if (pending) return; onOpenChange(next); }}` (Radix Dialog `onOpenChange` is the single chokepoint for ESC + scrim + Close button).
- Add `aria-busy={pending}` to `Dialog.Content`.

### 3c. Delete commit flow (`FoodDetail.tsx`)
- Re-order: do NOT call `router.push('/library')` BEFORE the POST resolves. Move it inside the success branch AFTER `authPost` returns. Keep the `useOptimistic` tombstone for the brief flicker (still inside startTransition).
- This removes the "navigation masks pending" anti-pattern.
- Add aggregated `deleteInFlight` state at FoodDetail level: hoisted from BulkDeleteConfirmDialog via an `onPendingChange?: (p: boolean) => void` callback prop, OR (simpler) move the `pending` state UP into FoodDetail.tsx and pass it back down. Recommend the lift — single source of truth for "is anything in flight?" feeds the sheet-level aria-busy.

### 3d. Sheet-level interaction block (`FoodDetail.tsx`)
- Add a derived `const sheetBusy = edit.saving || logNowPending || deleteInFlight;`
- Apply `aria-busy={sheetBusy}` + `data-busy={sheetBusy}` on the sheet root and use a CSS rule `[data-busy='true'] { pointer-events: none; }` scoped EXCLUDING the currently-running action's button (so user can still see the spinner & label but cannot interact).
- Refined approach (preferred): keep buttons clickable but no-op them via early-return in handlers when `sheetBusy` is true. Avoids `pointer-events: none` surprise and preserves SR focus + tab order. The visible cue is the disabled-button + aria-busy region.

### 3e. i18n additions (`lib/i18n/en.ts`)
- `t.library.detail.deleting = 'DELETING…'` (or matching editorial voice)
- `t.library.bulkDeleteDeleting` shared with bulk variant
- Live-region announcement strings for AT.

---

## 4. Files affected (≈6)

1. `app/(app)/library/_components/FoodDetail/FoodDetail.tsx` — aggregate busy flag, gate topbar + scrim, lift delete pending, defer navigation
2. `app/(app)/library/_components/FoodDetail/FoodDetailActions.tsx` — pass-through aria-busy on sheet (no real change, may be untouched)
3. `app/(app)/library/_components/FoodDetail/FoodDetailName.tsx` — accept `saving` prop, disable inputs
4. `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` — accept `saving` prop, disable inputs
5. `app/(app)/library/_components/BulkDeleteConfirmDialog.tsx` — proper loading label, gate onOpenChange, disable CANCEL
6. `lib/i18n/en.ts` — new copy keys

---

## 5. TDD plan (RED first)

Component tests under `tests/components/library/`:
- **`FoodDetail.saving.test.tsx`** (NEW): mount in edit mode → click SAVE with a never-resolving `authPost` mock → assert (a) inputs disabled, (b) sheet has `aria-busy="true"`, (c) BACK button disabled, (d) clicking scrim does nothing, (e) clicking DELETE/LOG NOW does nothing.
- **`BulkDeleteConfirmDialog.pending.test.tsx`** (NEW or extend): pending=true → assert CANCEL disabled, ESC no-op, scrim no-op, label is real word not ellipsis, aria-busy on Content.
- **`FoodDetail.delete.test.tsx`** (extend existing): assert navigation happens AFTER POST resolves (verify call order via mock).

Integration test under `tests/integration/`:
- **`library-mutation-blocking.test.ts`** (NEW): full sheet rendered, fire Save, attempt to fire Delete & Log Now in parallel — second/third clicks must NOT trigger additional POSTs (sniff `authPost` call count). Mirrors lesson #16 — verify failure of mocked-write hides nothing.

Visual regression: extend `tests/visual/library.spec.ts` with a `saving` and `deleting` snapshot variant of the sheet.

---

## 6. UI-touching citations

- **ui-design.md L142** — Loading spinner pattern (SVG circle stroke-dashoffset, 900ms rotation)
- **ui-design.md L1144** — Pending button label spec ("UPLOADING…" + 24px spinner) — apply same voice to "SAVING…" / "DELETING…"
- **ui-design.md L1319** — "Save button uses `useFormStatus().pending`" prescription (note: we are NOT using server actions here — `useState` is the equivalent in our authPost path; pattern intent honored)
- **ui-design.md L1017** — `aria-busy="true" aria-live="polite"` on container during async generation
- **web-ui-guide.md loading-button Quick-Pick** — disabled + spinner + label swap is the contract
- **WCAG 4.1.3 Status Messages** — sheet-wide aria-busy + live region for AT users (already partially present for Log Now)

---

## 7. Stop-the-world flags / risks

- **R1 (Task 2.1 auth refresh-interceptor):** all three mutations go through `authPost`. No new fetch shim introduced. ✅
- **I11 client_id contract:** Save uses `crypto.randomUUID()` per call (useFoodDetailEdit.ts:325) — re-issued on every retry click. Bug 4 fix does NOT change this; if double-click happens despite disabling, server I11 SELECT is the safety net. Note this is a DIFFERENT pattern from Log Now's `pendingClientIdRef` retry-persistence. Recommend matching Log Now's pattern for Save in a SEPARATE bug if retry-safety becomes a concern — but explicitly OUT OF SCOPE here.
- **Optimistic delete navigation re-order:** the existing test suite for delete (`tests/integration/library-bulk-delete-*`, `tests/components/library/FoodDetail*`) was written assuming `router.push` fires before the POST resolves in success path. Re-order WILL break a small number of tests — must be updated as part of GREEN.
- **No API contract changes.** No new endpoints. No new env vars. No DB migrations.

---

## 8. Open questions

1. Should the SAVE flow ALSO lock cross-operations the way DELETE will? (Recommended: yes, via the aggregated `sheetBusy` flag. Cheap.)
2. Spinner glyph: ui-design.md L142 specifies an SVG spinner; existing buttons currently use NO spinner (only label swap). Add the SVG spinner per spec OR keep label-only? **Recommend label-only first pass** (matches existing Log Now precedent in production), promote to spinner if user complains in UAT. Keeps diff small.
3. ESC-during-save: ESC currently fires `onClose` (FoodDetail.tsx:369–380). Should ESC be gated by `sheetBusy`? **Recommend yes** — same intent as scrim-click gating. The delete-dialog already self-handles ESC via Radix, so the parent ESC handler should no-op while `sheetBusy`.

---

## 9. One-liner for main agent

Save+Delete buttons already show a pending label but the rest of the sheet stays fully interactive — user can navigate away, fire other mutations, or close the delete dialog mid-flight; fix is sheet-wide `aria-busy` + disable-cross-mutation gating + delete-dialog `onOpenChange` guard, plus moving the post-delete `router.push` AFTER the POST resolves.
