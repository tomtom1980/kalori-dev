## Project Briefing: Kalori Calorie Tracker

### Architecture
- Next.js 16 App Router, React 19, strict TypeScript, Tailwind v4, Radix/shadcn-style primitives, Supabase, Gemini, Vercel, Sentry, PWA/Serwist, Zustand, Zod, Vitest, and Playwright.
- Authenticated app routes live under `app/(app)`, with key surfaces `/dashboard`, `/log`, `/library`, `/library/[id]`, `/progress`, and `/settings`.
- API handlers under `app/api/**/route.ts` validate with Zod, use auth/profile fences, call Supabase server/admin helpers, and revalidate typed cache tags after writes.
- Core data tables include `profiles`, `food_entries`, `food_library_items`, `ai_response_cache`, `ai_call_log`, `weekly_reviews`, and current BAC `alcohol_logs`.
- Library rows store normalized names, default portion/unit, nutrition JSON, thumbnails/sketch metadata, log counts, tombstones, and creation source.
- AI routes use Gemini through `lib/ai/*`, validate responses with Zod, cache by user-scoped hash, log each AI call, and keep Gemini keys server-side.
- Library page flow centers on `LibraryClient`, `LibraryCard`, `LibraryCardActionMenu`, and `FoodDetail`; Add Food flow centers on `AddFoodTab`, `AiParseForm`, `ConfirmationScreen`, and `useLogFlowStore`.

### Current Status
- Active worktree is not clean: BAC alcohol tracking changes are implemented but not committed/pushed.
- Branch `main` is behind `origin/main` by one commit: `36da50e Fix dashboard meal add button alignment`.
- BAC migration `0026_bac_alcohol_tracking.sql` is documented as applied to dev and production, but code release verification is still pending.
- Full test suite has documented pre-existing failures in wheel-picker/log-flow/library-adjacent component tests.
- Root `AGENTS.md` is absent on disk; user-supplied AGENTS instructions in the conversation are authoritative for this session.

### Recent Activity
- 2026-05-19: BAC Alcohol Tracking added alcohol ledger, BAC dashboard widget, profile sex tightening, migration 0026, and related tests.
- 2026-05-19: Tablet layout hotfix deployed; tablet widths now use phone layout below 1280px.
- 2026-05-18: Text parse all-zero micronutrient repair and vision endpoint repair were deployed.
- 2026-05-17 to 2026-05-18: Library received pagination, detail editing, quotas, dedup, hydration, bulk logging, filters, and micronutrient fixes.

### Code Health
- `ConfirmationScreen.tsx` and `LibraryClient.tsx` are large, central files; changes there need narrow tests.
- Existing mutation callers should use `authFetch`/`authPost`.
- New user-owned DB tables require migration, RLS, generated types, account delete/export consideration, and RLS tests.
- Recipe generation should reuse AI route conventions: server-only Gemini, prompt/schema validation, `ai_call_log`, Sentry handling, and cache/user isolation.
- UI should stay in the existing dark, dense, editorial style and use Radix dialog/menu accessibility patterns.

### Ready For
- Design decision: where to persist the `home_makeable` flag and when to compute it.
- Design decision: dedicated recipe table versus generic AI cache for saved recipes.
- Design decision: whether old library items get lazy eligibility checks, no recipe option, or a backfill path.
- Implementation should wait until design approval and should not be mixed with the pending BAC release unless the user explicitly accepts that risk.
