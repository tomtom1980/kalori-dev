# Bug 6 Output: Snap/upload image recognition inputs

## Files Changed
- `app/(app)/log/_components/SnapTab.tsx`
- `tests/components/log-flow/SnapTab.test.tsx`
- `tests/components/log-flow/LogFlowTabs-confirmation-wiring.test.tsx`

## Tests Added/Modified
- `tests/components/log-flow/SnapTab.test.tsx`
  - Added split input contract: camera input keeps `capture="environment"` and upload input has no `capture`.
  - Added click-routing coverage: `UPLOAD INSTEAD` opens upload input; dropzone/capture square open camera input.
  - Updated accessibility label coverage for both hidden file inputs.
- `tests/components/log-flow/LogFlowTabs-confirmation-wiring.test.tsx`
  - Updated the snap upload path to use `snap-tab-upload-input`.
  - Added assertions that photo recognition populates editable confirmation name, portion, and kcal fields.

## Implementation Summary
- Split the previous single capture-enabled file input into camera and upload inputs.
- Preserved `snap-tab-file-input` as the camera input test id for existing camera-path compatibility.
- Added `snap-tab-upload-input` without a `capture` attribute for file picker upload.
- Kept both inputs on the same `handleFile(file)` pipeline for compression, `/api/ai/vision`, thumbnail upload, and `onAnalyzeSuccess`.
- Kept the dropzone and capture square camera-first; `UPLOAD INSTEAD` now targets the no-capture upload input.
- Reset file input values on change so selecting the same image again can fire `change`.

## Commands Run
- `pnpm vitest run tests/components/log-flow/SnapTab.test.tsx tests/components/log-flow/LogFlowTabs-confirmation-wiring.test.tsx tests/components/log-flow/SnapTab-thumbnail-upload.test.tsx`
  - RED before implementation: failed on missing `snap-tab-upload-input`.
  - GREEN after implementation: passed, 3 files / 15 tests.
- `pnpm vitest run tests/integration/ai-vision.test.ts`
  - Passed, 1 file / 8 tests.
- `pnpm typecheck`
  - Failed due to unrelated in-progress batch files:
    - missing `@/components/dashboard/DailyEditorsNote`
    - missing `@/lib/dashboard/daily-editors-note`
    - missing `@/components/primitives/DuplicateLogConfirmDialog`
    - `LogLibraryItem.defaultPortion` type errors in `tests/unit/library/to-log-library-item.test.ts`
  - No Bug 6 files were reported.
- `pnpm exec eslint 'app/(app)/log/_components/SnapTab.tsx' 'tests/components/log-flow/SnapTab.test.tsx' 'tests/components/log-flow/LogFlowTabs-confirmation-wiring.test.tsx'`
  - Passed.

## Native Picker / Camera E2E Notes
- Native OS file pickers and mobile camera permission prompts were not automated.
- The component/unit coverage uses direct file input upload/change events, which avoids faking permission prompts.
- A real-device/manual smoke check is still useful for iOS Safari and Android Chrome to verify `capture` vs no-`capture` behavior.

## Residual Risks
- Browser behavior for `capture` and no-`capture` file inputs varies on mobile; unit tests lock DOM contracts but cannot prove native picker UI.
- Full project typecheck is currently blocked by unrelated batch work outside Bug 6 ownership.
