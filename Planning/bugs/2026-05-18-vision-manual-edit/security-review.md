# Security Review: 2026-05-18 Vision Manual Edit

Date: 2026-05-18

## Scope

Reviewed the current diff for the bugfix-tomi batch `2026-05-18-vision-manual-edit`, focused on:

- `app/api/ai/vision/route.ts`
- `lib/ai/client.ts`
- `lib/ai/fallback.ts`
- `app/(app)/log/_components/ManualEntryFallback.tsx`
- `app/(app)/log/_components/LogFlowTabs.tsx`
- `app/globals.css`
- `lib/i18n/en.ts`
- Related tests only where needed to confirm intended behavior

Areas checked: image upload MIME/base64/size handling, Gemini prompt and structured schema safety, manual nutrition fields, XSS/injection exposure, auth boundaries, logging of image/API data, and photo privacy.

## Blocking Findings

None.

## Severity Summary

- Critical: 0
- High: 0
- Medium: 0
- Low: 0
- Informational hardening notes: 2

## Review Notes

### Image Upload, MIME, Base64, and Size Handling

- The vision endpoint still applies a decoded-size cap before auth (`MAX_BASE64_BYTES = 500 * 1024`), which limits unauthenticated oversized request cost.
- Accepted MIME values in the request body remain restricted to image types: JPEG, PNG, WebP, HEIC, and HEIF.
- Gemini receives the image as a native `inlineData` part rather than text-concatenated base64, which keeps image bytes out of the text prompt and reduces prompt-injection surface.
- The route returns `originalInput: '<image>'` on fallback/error paths, so raw image data is not echoed to the browser.

### Gemini Prompt, Schema, and Response Handling

- The batch moves vision to `gemini-2.5-flash` and adds structured JSON response configuration without adding secret exposure.
- The schema constrains item count, string lengths, nonnegative values, and confidence range. The parsed result is still validated through `ParseResult.safeParse()` before being returned or cached.
- Parse-validation failures are sent to Sentry as validation errors only; the raw Gemini response/image payload is not attached in the reviewed code.
- Fallback breadcrumbs include call type, client ID, and primary error message, but not image bytes, prompt text, or model response content.

### Auth Boundaries and Tenant Isolation

- The vision route still requires `requireProfileOrJson401()` before Gemini calls, cache lookup, cache write, or AI call logging.
- Cache keys include `userId` and cache lookup/write paths preserve the existing user filter boundaries.
- AI call logs record hashes, token/cost/latency metadata, and client IDs; they do not persist photos or raw Gemini responses.

### Photo Privacy

- Server-side vision cache persists parsed nutrition payloads only, not raw image data.
- The manual fallback displays the client-side thumbnail data URL for recovery context, but `LogFlowTabs` drops `photoDataUrl` before confirmation payload persistence. The reviewed change does not introduce persistent storage of manual fallback thumbnails.

### Manual Nutrition Fields and XSS/Injection

- Manual UI fields validate required food name, finite positive quantity, finite nonnegative calories, and finite nonnegative optional macros before entering confirmation.
- React rendering is used for user-provided text; no `dangerouslySetInnerHTML` or manual DOM HTML injection was introduced.
- Manual payloads continue through the existing confirmation/save path, where authenticated save endpoints perform their own body validation.

## Informational Hardening Notes

1. `lib/ai/prompts.ts` still allows a `data:<mime>;base64,...` prefix inside `imageBase64` to override the separately validated `mimeType` field when building Gemini `inlineData`. This is not new in this batch and is not a cross-user data exposure, but a future hardening pass should either reject data-URI prefixes at the route schema or ignore the embedded prefix and use only the validated request `mimeType`.

2. The structured response schema and runtime parsed-item schema constrain values to nonnegative numbers, but portion/kcal/macros do not currently have realistic maximums in the AI parse schema. This is not directly exploitable through the new manual UI because it checks `Number.isFinite()`, but a future data-integrity hardening pass should consider finite/max bounds for AI-produced portion, kcal, and macro values before caching or saving.

## Conclusion

No blocking security or privacy findings were identified. The changed code does not log or persist raw photos, does not expose Gemini secrets, preserves the authenticated route boundary, and keeps image bytes out of text prompts.

## Final Delta Review - Round 1 Fixes and Nav Test Isolation

Date: 2026-05-18

### Delta Scope

Reviewed changes made after the first security review:

- `app/(app)/log/_components/ManualEntryFallback.tsx`
- `app/(app)/log/_components/LogFlowErrorBanner.tsx`
- `lib/i18n/en.ts`
- `tests/components/log-flow/ManualEntryFallback.test.tsx`
- `tests/components/log-flow/LogFlowErrorBanner.test.tsx`
- `tests/components/nav/nav-shell.test.tsx`

### Blocking Findings

None.

### Severity Summary

- Critical: 0
- High: 0
- Medium: 0
- Low: 0

### Delta Notes

- The mobile quantity-wheel fix resets/clamps quantity when units change. This is a data-integrity improvement and does not add a new trust boundary or persistence path.
- The context-aware retry label in `LogFlowErrorBanner` and `ManualEntryFallback` is copy/control-flow only. It does not expose secrets, user data, or raw AI/image payloads.
- Optional macro field validation now rejects non-finite and negative values before confirmation, exposes visible field-level errors, and focuses the first invalid field. The fields remain React-rendered text inputs with no HTML injection sink.
- The manual fallback can still include a snap thumbnail data URL in its local submit payload, but the reviewed confirmation mapper continues to omit `photoDataUrl` from the persisted parsed item shape. No new raw-photo logging or server persistence path was introduced.
- The nav changes are test-only mock isolation and assertion helpers. They do not alter production code or security behavior.

### Conclusion

No new blocking security or privacy issues were introduced by the Round 1 manual fallback fixes or the nav test isolation changes. The prior informational hardening notes remain valid future work, but they are not release blockers for this delta.

## Final Delta Review - Nested Form Fix and Nav Type Fix

Date: 2026-05-18

### Delta Scope

Reviewed only changes made after the prior security delta:

- `app/(app)/log/_components/ManualEntryFallback.tsx`
- `tests/components/log-flow/ManualEntryFallback.test.tsx`
- `tests/components/nav/nav-shell.test.tsx`
- Related batch output notes for the nested-form and nav typecheck fixes

### Blocking Findings

None.

### Severity Summary

- Critical: 0
- High: 0
- Medium: 0
- Low: 0

### Delta Notes

- The manual fallback nested-form fix replaces the inner `<form>` with a non-form wrapper and explicit `type="button"` submit handling. This removes invalid nested form behavior without adding a new network, auth, storage, or persistence path.
- Enter-key handling now calls the same local `submit()` path for text inputs. The existing validation still gates required food name, positive quantity, nonnegative kcal, and optional macro values before the payload reaches confirmation.
- The retained snap thumbnail remains client-local in the manual fallback payload path reviewed previously. This delta did not introduce raw-photo logging, server upload, or persistence of the thumbnail.
- User-provided food and macro fields remain React-rendered values. No `dangerouslySetInnerHTML`, manual HTML injection sink, local storage, session storage, or console logging of sensitive values was introduced.
- The nav change is test-only and narrows TypeScript assertions around mocked POST calls. It does not change production behavior, request payloads, auth handling, or user-data handling.

### Conclusion

No blocking security or privacy findings were introduced by the final nested-form and nav typecheck deltas. The prior informational hardening notes remain valid future work and are not release blockers for this final delta.
