# Bug 3: Photo upload/capture desktop behavior

## Status
implemented

## Files Touched
- `app/(app)/log/_components/SnapTab.tsx`
- `lib/i18n/en.ts`
- `tests/components/log-flow/SnapTab.test.tsx`

## Tests Added/Updated
- `tests/components/log-flow/SnapTab.test.tsx::desktop renders upload-only without camera capture input or capture square`
- Updated SnapTab mobile tests to explicitly stub the mobile breakpoint.

## Verification
- `pnpm vitest run --pool threads --maxWorkers 1 tests/components/log-flow/SnapTab.test.tsx tests/unit/components/log-flow/ConfirmationScreen.test.tsx tests/unit/api/entries-save.test.ts tests/unit/ai/portion-sanity.test.ts tests/unit/lib/ai/prompts-approx-grams.test.ts` passed.

## Notes
Desktop now routes the SnapTab dropzone to the upload input only, omits the camera capture input and capture square, and uses the exact `Upload picture` affordance. Mobile capture behavior remains unchanged.

## Phase 7 regression note
- `tests/components/log-flow/SnapTab-thumbnail-upload.test.tsx` was updated to target the desktop `snap-tab-upload-input` selector. The production behavior remains unchanged: desktop upload-only, mobile camera capture still available.
