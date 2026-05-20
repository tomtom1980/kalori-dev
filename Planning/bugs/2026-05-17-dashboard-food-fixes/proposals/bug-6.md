# Bug 6: Fix snap/upload image recognition entry flow
## Classification
needs_debug_shallow

## Root Cause
The snap tab currently uses a single hidden file input for both the camera capture affordance and the visible `UPLOAD INSTEAD` action in `SnapTab.tsx`. That input always carries `capture="environment"`, so on mobile browsers the upload path can open the camera instead of the photo/file picker. The recognition handoff itself is present: `SnapTab` posts the compressed image to `/api/ai/vision`, then `LogFlowTabs` enters `ConfirmationScreen` with `source: 'photo'`, where name, portion, and kcal are editable fields. Current tests cover the generic hidden input and API wiring, but they do not lock the separate camera-vs-upload contracts or prove the uploaded image path reaches editable confirmation fields.

UI/design alignment: this is a web Log Flow modal bug. The project prescription says Log Flow is a modal using Radix Tabs/Dialog, `SnapPane` lazy-loads `browser-image-compression`, and motion should follow existing `LazyMotion + m` / CSS token patterns where needed. The web UI guide Quick-Pick table recommends no additional library for this interaction; existing Radix Tabs plus native file inputs are the correct low-bundle choice.

## Proposed Change (Diff Outline)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\SnapTab.tsx`
  - Split the current `fileInputRef` into two refs/inputs:
    - camera input: `accept` images plus `capture="environment"`, used by the capture square and camera/dropzone click if that behavior should remain camera-first.
    - upload input: same `accept`, no `capture`, used only by `UPLOAD INSTEAD`.
  - Keep both paths calling the same `handleFile(file)` pipeline so compression, `/api/ai/vision`, thumbnail upload, and `onAnalyzeSuccess` remain single-source.
  - Add separate labels/test ids such as `snap-tab-camera-input` and `snap-tab-upload-input`; preserve the existing test id only if needed for compatibility by aliasing it to the camera input or updating tests in the same patch.
  - Reset each input value after handling a selected file so choosing the same image again fires `onChange`.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\log-flow\SnapTab.test.tsx`
  - Replace the current single-input assertions with contracts that camera input has `capture="environment"` and upload input does not have a `capture` attribute.
  - Assert `UPLOAD INSTEAD` clicks the upload input, not the camera input.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\log-flow\LogFlowTabs-confirmation-wiring.test.tsx`
  - Add or adjust snap path coverage to upload through the no-capture upload input and assert `ConfirmationScreen` mounts with editable `confirmation-item-0-name`, `confirmation-item-0-portion`, and `confirmation-item-0-kcal` prefilled from the mocked vision result.
- Optional if existing mocks become too broad: `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\log-flow\SnapTab-thumbnail-upload.test.tsx`
  - Update selectors from the old single input to the camera or upload input based on which path each test is exercising.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\SnapTab.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\log-flow\SnapTab.test.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\log-flow\LogFlowTabs-confirmation-wiring.test.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\log-flow\SnapTab-thumbnail-upload.test.tsx` if selector updates are required

## TDD Required
yes - this touches UI control flow and the image-analysis handoff, not just styling.

## Test Approach
- RED unit/component tests first:
  - `SnapTab.test.tsx`: fails until upload has a distinct no-capture file input and `UPLOAD INSTEAD` targets it.
  - `LogFlowTabs-confirmation-wiring.test.tsx`: fails until the upload path can feed the mocked `/api/ai/vision` result into editable confirmation inputs.
- Existing regression tests to keep passing:
  - `SnapTab-thumbnail-upload.test.tsx` for dual-output compression and thumbnail upload behavior.
  - `ai-vision.test.ts` for server-side `/api/ai/vision` validation, inline image payload, size gate, and sanitation.
- Suggested commands:
  - `pnpm vitest run tests/components/log-flow/SnapTab.test.tsx tests/components/log-flow/LogFlowTabs-confirmation-wiring.test.tsx tests/components/log-flow/SnapTab-thumbnail-upload.test.tsx`
  - `pnpm vitest run tests/integration/ai-vision.test.ts`
- Playwright:
  - Add or run a focused log-flow E2E only if the batch has an authenticated modal flow available. Native camera permission and OS file picker cannot be automated reliably; use Playwright `setInputFiles` on the no-capture upload input for upload analysis. If camera capture opens a browser/OS permission or native picker, halt under the bugfix-tomi E2E blocker protocol and ask the user to manually confirm that path on device.

## Risk Assessment
medium - the fix is small, but mobile file input behavior differs by browser and the snap flow sits inside a modal with existing persistence and thumbnail side effects.

## Regression Sweep Needed
- Log modal Snap tab: camera capture, upload instead, drag-and-drop, unsupported MIME, compression progress, analyze failure/manual fallback.
- Confirmation screen: photo-source prefill, editable name/portion/kcal, save-to-library toggle, save flow.
- Thumbnail upload companion route behavior: parsed entries must still continue if thumbnail upload fails.
- Mobile browsers: iOS Safari and Android Chrome handling of `capture` vs no-`capture` file inputs.
- AI route: `/api/ai/vision` still sends image as native `inlineData` and validates `ParseResult`.

## UI Touching
true - `app/(app)/log/_components/SnapTab.tsx` inside the Log Flow modal/Snap pane.

## Open Questions
- Should clicking the large dropzone remain camera-first, or should only the 56x56 capture square open camera while the larger dropzone opens the upload picker? The least disruptive fix is camera-first dropzone plus a distinct upload button.
- Production recognition depends on valid Gemini configuration and credentials. Code defaults to `gemini-flash-latest`; Google AI docs list this alias pattern as valid, but production should be checked for `/api/ai/vision` 200 responses and Sentry `component: ai-vision` errors after deploy.
