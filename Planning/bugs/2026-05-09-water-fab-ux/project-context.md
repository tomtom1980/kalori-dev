# Project Context — bugfix-2026-05-09-water-fab-ux (Phase 0)

**Anchor:** TIGHT follow-up batch on `2026-05-08-mobile-water-button` (commit `ca8e4fe`, just shipped). Two bugs surfaced during user mobile testing.

**Tech stack:** Next.js 16 + React 19 (TS strict) + Tailwind v4 + shadcn/ui + Supabase + Gemini `gemini-flash-latest` + Vercel + Sentry; Zustand stores; PWA dark-only "The Ledger" design (oxblood `#8A2A1F` / ivory `#F4EBDC` / near-black `#0E0A08`).

**Water-FAB feature surfaces (post-`ca8e4fe`):**
- `components/nav/nav-shell.tsx` — FAB tap handler `handleLogWater` does direct `POST /api/water/log` with `userTzToday(timezone)` recompute at tap time + ref-latch single-fire + `router.refresh()` on success
- `app/(app)/layout.tsx` — server `profiles.timezone` SELECT keyed by `id`, drills `timezone:string` prop into `<NavShell>` (UTC fallback on lookup error + `Sentry.captureException`)
- `components/dashboard/WaterTracker.tsx` — dashboard chip (existing surface; uses local state + Path A navigation target)
- `lib/stores/useUndoQueueStore.ts` — Zustand store; `pushToast` accepts `ttlMs?:number` per-call override (Stage A contract)
- `lib/water/client-id.ts` — shared `mintClientId()` UUID-v4 fallback (extracted from `WaterTracker.tsx`)

**Toast pattern:** `useUndoQueueStore.pushToast({ kind:'delete-failed', description:t.fab.waterLoggedToast, ttlMs:2000 })` — user explicitly chose 2s feedback over canonical 5s; `selectLiveTop` honors per-entry value; cross-tab broadcast forwards `ttlMs`.

**Dashboard refresh pattern:** `router.refresh()` called only on POST-success (Codex R1 I1 fix) — invalidates RSC cache for `/dashboard` masthead + WaterTracker chip after non-`/dashboard` taps.

**Pre-existing relevant followup:** `F-WATER-CHIP-STALE-LOGGEDON-2026-05-09` (high) — `WaterTracker` dashboard chip uses the same stale render-time `loggedOn` prop pattern that C2 R3 fixed for the FAB. Same wrong-day-after-midnight failure mode in `components/dashboard/WaterTracker.tsx`.

**User's two new reports:** Bug 1: toast latency (2s feedback feels delayed/wrong); Bug 2: dashboard chip not updating without manual reload after FAB tap (despite shipped `router.refresh()`).

---
**Phase 1 sub-agents need to read `components/dashboard/WaterTracker.tsx` for Bug 2 root-cause analysis.**
