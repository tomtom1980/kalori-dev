# Bugfix Manifest: 2026-05-18 Vision Manual Edit

## Summary

Batch `2026-05-18-vision-manual-edit` fixed the follow-up image-recognition and mobile manual-entry recovery issues after the camera/upload split. The vision route now defaults to stable `gemini-2.5-flash`, sends a structured JSON response schema for the existing parsed-food contract, and keeps image bytes in native Gemini `inlineData`. The manual fallback UI was rebuilt as a mobile-safe recovery panel with retained photo context, unit selection, portion presets, mobile wheel picking, optional macros, field-level validation, and confirmation handoff.

Starting SHA: `53f857596e613bef8c37c354d4ba82bfed669c02`

## Bugs Fixed

| Bug | Classification | Status | Summary |
|---|---|---|---|
| 1 | `needs_debug_shallow` | implemented | Move food-photo recognition to stable `gemini-2.5-flash` with structured JSON schema output and cleaner fallback behavior. |
| 2 | `known_fix` | implemented | Replace cramped mobile manual fallback with a responsive recovery editor and richer manual nutrition options. |

## Files Changed

### Production

- `app/api/ai/vision/route.ts`
- `lib/ai/client.ts`
- `lib/ai/fallback.ts`
- `app/(app)/log/_components/ManualEntryFallback.tsx`
- `app/(app)/log/_components/LogFlowErrorBanner.tsx`
- `app/(app)/log/_components/LogFlowTabs.tsx`
- `app/globals.css`
- `lib/i18n/en.ts`

### Tests

- `tests/integration/ai-vision.test.ts`
- `tests/integration/ai-vn-fallback-runtime.test.ts`
- `tests/components/log-flow/ManualEntryFallback.test.tsx`
- `tests/components/log-flow/LogFlowErrorBanner.test.tsx`
- `tests/components/log-flow/LogFlowTabs-confirmation-wiring.test.tsx`
- `tests/components/nav/nav-shell.test.tsx`

## Review Status

| Gate | Status | Notes |
|---|---|---|
| Codex round 1 | completed with fixes | C0 I3 M1; stale mobile wheel values, retry copy, and macro field errors were fixed. |
| Codex round 2 | completed with fix | C1 I0 M1; nav test tuple typecheck blocker was fixed. |
| Final delta review | clean | C0 I0 M0 after nav typecheck and nested-form fixes. |
| Security review | clean | No blocking findings across initial, delta, and final delta reviews. |
| Lessons write-back | skipped | Global `C:\Users\tamas\.Codex\lessonlearned.md` was missing earlier in the batch. |

## Verification Status

Final verification passed:

- `pnpm typecheck`
- `pnpm lint` with 41 warnings, 0 errors
- `pnpm test` - 400 files / 3046 tests passed
- `pnpm build`
- Focused vision/manual fallback tests - 5 files / 44 tests passed
- Callable `window.confirm(` grep in `app components lib` - no matches
- Mobile/no-auth Playwright smoke for `/` and `/log -> /login`

Known verification limitation: authenticated `/log` camera/upload and native OS camera/file-picker behavior still require real-device manual smoke testing. The environment did not bypass auth or OS permission prompts.

## Artifact Inventory

Permanent archive root: `Planning/bugs/2026-05-18-vision-manual-edit/`

Copied from `.tmp`:

- `proposals/`
- `outputs/`
- `codex/`
- `security-review.md`
- `verification-results.md`
- `final-verification.md`
- `project-context.md`
- `lessons-relevant.md`
- `state.md`

`.tmp` status: retained at `Planning/.tmp/bugfix-2026-05-18-vision-manual-edit/`.

## Staging Notes

Do not stage unrelated local/generated artifacts unless explicitly intended:

- `.codex/`
- screenshot PNG changes under `tests/screenshots/user-stories/`
- pre-existing/generated `next-env.d.ts`
- pre-existing/generated `public/sw.js`

