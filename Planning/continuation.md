# Continuation Handoff - 2026-05-11 ~13:45 GMT+7

This is the current compressed handoff for another coding agent. It supersedes the older Phase B handoff.

## Current Production State

- **GitHub `main`:** `7842c26b621ffbf9d67e2045d890e64f1be07834`
- **Last commit:** `7842c26 Fix food portion scaling and AI portion sanity`
- **Production alias:** `https://kalori-one.vercel.app`
- **Latest Vercel deployment URL:** `https://kalori-elwy1n8uk-tamas-szalays-projects.vercel.app`
- **Vercel/Sentry release:** `7842c26b621ffbf9d67e2045d890e64f1be07834`
- **Workspace caveat:** `public/sw.js` and `public/sw.js.map` may show as modified after local builds, but `git diff --quiet -- public/sw.js public/sw.js.map` is clean. Treat as stat/mtime noise unless content diff appears.

## What Changed In The Last Two Days

### Manual-smoke water and timezone fixes (2026-05-09)

- Mobile water FAB logs 250 ml with immediate toast/feedback.
- Custom water edit path supports `unit: "ml"` up to 5000 ml while glass/bottle caps stay narrower.
- Water tracker locks during in-flight updates and keeps the spinner visible until refreshed data lands.
- App timezone syncs with the device so daily dashboard/log boundaries match the user environment.
- Relevant commits: `ca8e4fe`, `ffdb600`, `b9383c0`, `c94f99d`, `d1b9848`, `81375f3`, `8ad6802`, `ceb46a6`.

### Dashboard nutrition and display fixes (2026-05-09 to 2026-05-10)

- Dashboard macro breakdown was added and wired to entry aggregation.
- Fiber is now treated as a primary nutrient across dashboard/progress displays.
- Dashboard entry times render in user/device timezone rather than raw UTC.
- Relevant commits: `8a5d4ea`, `d6728ac`, `85677d6`.

### Log confirmation and library UX fixes (2026-05-10)

- Confirmation kcal field now displays full values like `550 kcal`; it no longer shares the narrow portion input width.
- Type parse and Save-to-Ledger both show loading spinners and block duplicate clicks while async work is pending.
- Library page paginates at 10 real items per page after filtering/sorting; inert pad cells were removed.
- Tailwind source scanning was constrained to avoid broad scan drift/cost.
- Relevant commits: `8d0156f`, `74c3f8f`, `f217369`, `aa4cc12`.

### Dashboard date history and edit-entry support (2026-05-10 to 2026-05-11)

- Dashboard now has calendar/day controls for viewing previous days and returning to Today.
- Dashboard add/edit flows carry the viewed day through the log modal.
- Existing food entries can be opened from the dashboard into confirmation mode and persisted through `PATCH /api/entries/:id`.
- Day-switch and Today actions now show loading while the dashboard refreshes.
- Mobile wheel/drop-down sheets now layer above open modal/card surfaces.
- Relevant commits: `e5eab9c`, `2abe9a7`.

### Portion scaling and AI portion sanity (2026-05-11)

- In `ConfirmationScreen`, changing `portion` now rescales `kcal`, macros, and micros. This fixes cases like one sandwich changed to four sandwiches still showing/saving one sandwich's calories.
- Existing-entry edit save now sends a narrower PATCH body, omitting create-only fields (`source`, `client_id`, `logged_at`) that could fail validation for legacy rows.
- Library selected quantity now scales kcal/macros before entering confirmation.
- Gemini text/vision prompts now require a portion/unit sanity check and reasoning note.
- New `lib/ai/portion-sanity.ts` normalizes impossible tiny gram portions for fresh, cached, and replayed AI parse results:
  - countable foods like sandwich/burger/taco/wrap/banh mi -> `piece`
  - ice cream/gelato/sorbet -> `scoop`
  - meat/fish/tofu/rice/pasta/noodles -> plausible `100 g`
  - confidence capped to `0.85` when auto-corrected
  - reasoning records the correction
- Relevant commit: `7842c26`.

## Verification Already Run

- Focused latest suites:
  - `pnpm exec vitest run --pool threads --maxWorkers 1 tests/unit/ai/portion-sanity.test.ts tests/unit/components/log-flow/ConfirmationScreen.test.tsx tests/integration/mobile-wheel-picker-consumers.test.tsx tests/components/library-tab-continue-cta.test.tsx`
  - Result: 43/43 tests passed.
- ESLint on touched AI/log files passed.
- `pnpm exec tsc --noEmit --pretty false` passed.
- `pnpm build` passed locally.
- Pre-push hook on `7842c26` ran:
  - `pnpm typecheck`
  - `pnpm test:unit`
  - Result: 943/943 unit tests passed.
- Vercel production build passed and moved alias to `https://kalori-one.vercel.app`.

## Documentation Updated In This Handoff

- `Planning/CHANGELOG.md` - added top entries for:
  - `7842c26` portion scaling / edit save / AI portion sanity
  - `2abe9a7` dashboard date loading + mobile wheel layering
  - `e5eab9c` dashboard date history + edit-entry path
  - 2026-05-09 to 2026-05-10 manual-smoke dashboard/water/nutrition/library rollup
- `Planning/progress.md` - added current top status with production head, verification, and workspace caveat.
- `Planning/continuation.md` - replaced stale Phase B handoff with this current production handoff.
- `Planning/brainstorm-state.md` - refreshed resume pointer to manual-smoke bugfix completion.

## Recommended Next Agent Start

1. Run `git status --short --branch`.
2. If only `public/sw.js` and `public/sw.js.map` appear, run `git diff --quiet -- public/sw.js public/sw.js.map` before acting; content is expected clean after builds.
3. Read the latest entries in `Planning/CHANGELOG.md` and this file.
4. For log/AI work, inspect:
   - `app/(app)/log/_components/ConfirmationScreen.tsx`
   - `app/(app)/log/_components/LibraryTab.tsx`
   - `app/api/ai/text-parse/route.ts`
   - `app/api/ai/vision/route.ts`
   - `lib/ai/portion-sanity.ts`
   - `lib/ai/prompts.ts`
5. For dashboard date/edit work, inspect:
   - `components/dashboard/DashboardDateControl.tsx`
   - `components/dashboard/MealEntryContextTrigger.tsx`
   - `app/api/entries/[id]/route.ts`
   - `lib/stores/useLogFlowStore.ts`

## Known Residuals / Watch Items

- No known open blocker from the 2026-05-11 portion/AI sanity deploy.
- Full `pnpm test` was not rerun after the docs-only update, but the pre-push hook ran `pnpm test:unit` 943/943 before the production deploy.
- Generated service worker files can show dirty after local `pnpm build`; verify content diff before committing them.
