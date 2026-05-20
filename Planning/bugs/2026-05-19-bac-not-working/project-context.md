# Project Context — bugfix-2026-05-19-bac-not-working

**Project slug:** `kalori-mvp`

## Tech stack

- **Language:** TypeScript (strict)
- **Framework:** Next.js 16 + React 19 (App Router, Route Handlers)
- **Styling:** Tailwind v4 + shadcn/ui (dark-only "The Ledger" theme)
- **Backend:** Supabase (Postgres + Auth + Storage + RLS on every table)
- **AI:** Google Gemini (`gemini-flash-latest`) — server-only
- **Deploy:** Vercel (Hobby, `iad1` region) + Sentry (errors-only)
- **Test runner:** Vitest (unit + integration) + Playwright (E2E)
- **Package manager:** pnpm

## Recent work direction (from last 10 commits)

Active BAC/alcohol tracking work shipped just before this batch:

- `eb8d099` Add library recipe generation
- `66509e1` docs: record BAC production deployment
- `9ae4e98` **Add BAC alcohol tracking** — migration 0026, `alcohol_logs` table (owner RLS), `lib/alcohol/bac.ts`, `components/dashboard/BacTracker.tsx`, 72-hour BAC window, dashboard widget with refresh, server-side gram calculation in `app/api/entries/save/route.ts`, strict `male|female` profile sex handling
- `36da50e` / `22c0c66` Dashboard meal add button alignment + styling
- `dc4e515` Tablet responsive routing fix

**BAC feature surface (just shipped, now reported broken in production):**
- Migration: `supabase/migrations/0026_bac_alcohol_tracking.sql`
- Save route: `app/api/entries/save/route.ts` (alcohol metadata gating + idempotency replay)
- UI: `app/(app)/log/_components/ConfirmationScreen.tsx`, `components/dashboard/BacTracker.tsx`, `app/(app)/dashboard/page.tsx`
- Logic: `lib/alcohol/bac.ts`, `lib/dashboard/{fetch,aggregate,types}.ts`
- Types: `lib/database.types.ts`; profile/onboarding validation files

Per memory (obs 8569, 12:04p today): "BAC Alcohol Tracking Deployed But Non-Functional in Production" — this batch is the follow-up fix.
