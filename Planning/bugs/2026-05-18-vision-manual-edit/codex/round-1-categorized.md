# Round 1 Categorized Findings

## Summary

- Critical: 0
- Improvement: 3
- Minor: 1

## Critical

None.

## Improvement

1. `app/(app)/log/_components/ManualEntryFallback.tsx:342` - Mobile wheel can commit a stale quantity after changing units.
   - Fix by normalizing/clearing `portion` on unit change and clamping the wheel draft to valid options before `Done`.
   - Add a mobile regression test for gram-to-piece/serving unit changes.

2. `lib/i18n/en.ts:558` and `app/(app)/log/_components/ManualEntryFallback.tsx:569` - Retry CTA says `TRY PHOTO AGAIN` for type/library fallback flows.
   - Fix with mode-specific retry copy or a neutral shared label.
   - Add a type-mode fallback test.

3. `app/(app)/log/_components/ManualEntryFallback.tsx:207` - Invalid optional macro fields do not expose field-level error text or focus movement.
   - Render macro error spans, wire `aria-errormessage`, and focus the first invalid macro field.
   - Add a test for invalid macro input.

## Minor

1. `.codex/` - Local generated Codex artifacts should remain unstaged/uncommitted.
   - Contains dev logs with local paths/network addresses and transient output.

## Review Tool Notes

- CodeRabbit CLI was unavailable.
- Codex CLI review was run and contributed the stale wheel, retry copy, and `.codex/` hygiene findings.
- Manual review added the macro validation/accessibility finding and checked Gemini model/config, fallback handling, and privacy/logging exposure.
