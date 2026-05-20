# Bug 3: Photo upload/capture desktop behavior
## Classification
known_fix

## Root Cause
`SnapTab` always renders a camera-oriented dropzone, a capture square, and a hidden file input with `capture="environment"`. That is correct for mobile, but on desktop it makes the primary action behave like camera capture instead of a normal upload-only surface. The project already has `useIsMobile()` with the canonical `(max-width: 767px)` breakpoint, so the missing branch is local to the photo tab UI. UI guidance: web Quick-Pick recommends zero extra library for simple stateful interaction; use existing React branching plus existing Ledger tokens, not a new animation dependency.

## Proposed Change (Diff Outline)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\SnapTab.tsx`
  - Import `useIsMobile`.
  - Keep the current camera/capture input, capture square, and mobile copy when `isMobile === true`.
  - On desktop, route dropzone click/keyboard activation to the upload input only, hide or omit the camera capture input/square, and show a single visible `Upload picture` affordance.
  - Preserve drag-and-drop and the existing `handleFile` pipeline for both branches.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts`
  - Add/adjust desktop-specific upload copy if reusing `UPLOAD INSTEAD` would violate the agreed `Upload picture` wording.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\log-flow\SnapTab.test.tsx`
  - Split assertions for mobile vs desktop by stubbing `matchMedia`.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\SnapTab.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\log-flow\SnapTab.test.tsx`

## TDD Required
yes - UI behavior and DOM contract change; existing tests currently assert both camera and upload inputs are always present.

## Test Approach
- Add/modify `SnapTab.test.tsx` desktop case: `matchMedia('(max-width: 767px)')` false renders upload-only UI, no `snap-tab-file-input`, no `capture` input, no capture square, and clicking the desktop upload affordance triggers `snap-tab-upload-input.click()`.
- Add/modify mobile case: `matchMedia` true preserves camera input with `capture="environment"`, capture square, and separate upload input.
- Keep existing drag/drop and thumbnail upload tests green by ensuring `handleFile` remains shared.

## Risk Assessment
low - narrow component branch using an existing breakpoint hook; risk is test churn around old assumptions that camera DOM is always present.

## Regression Sweep Needed
- Photo analysis flow in `SnapTab`.
- Thumbnail upload fallback tests.
- Mobile snap tab capture affordance and a11y labels.

## UI Touching
true - `SnapTab` photo upload/capture surface.

## Open Questions
None. The agreement explicitly says mobile capture remains unchanged and desktop shows only `Upload picture` with no camera/capture input.
