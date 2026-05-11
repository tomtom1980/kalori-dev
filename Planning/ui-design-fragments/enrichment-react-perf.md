# Pass 2 Enrichment — React/Next.js Performance

**Persona:** react-perf
**Skills invoked:** `vercel-react-best-practices`, `ui-design` + `web-ui-guide.md`, `vercel:nextjs`, `vercel:next-cache-components`
**Scope:** Review all 6 Pass 1 fragments through the lens of React 19 + Next.js 16 Cache Components + PPR performance.
**Baseline references:** `Planning/architecture.md` §5–§7 (cache tag registry, state layers, Approach C Hybrid), `Planning/design-doc.md` §6 (cache strategy), §7/§11 (state).

---

## 1. RSC vs Client Component Split

Classification is based on whether the component needs state, effects, event handlers, refs, browser-only APIs, or can render purely from props. Approach C Hybrid (architecture.md §4) mandates Cache Components + PPR on data-heavy routes; the log flow and optimistic surfaces are the only allowlisted client-heavy territory.

### Fragment 1 — Foundations (`agent-1-foundations.md`)

This fragment defines tokens, not components. No split needed — tokens live in `lib/tokens.ts` (module-level constants, no runtime) and are consumed by both server and client components. One call-out: `lib/motion/use-motion.ts` (§6.5) is **client-only** by definition (`useReducedMotion()` hook). Add `'use client'` to that file explicitly.

### Fragment 2 — Navigation (`agent-2-navigation.md`)

| Component | Current fragment intent | Correct classification | Rationale |
|---|---|---|---|
| `<DesktopSidebar>` chrome | ambiguous | **Split** — parent RSC renders masthead + nav list structure; a small `<NavActiveIndicator>` client child reads `usePathname()` | `usePathname` is client-only (from `next/navigation`). Shifting the entire sidebar to client hydrates 56 × 5 row chrome for no reason. |
| `<TabletRail>` | client needed for hover-expand | **Client** (`useState` for `isExpanded` or `:focus-within` CSS-only) | If the fragment specs pure CSS `:hover`/`:focus-within` for expand, this can be RSC. Prefer CSS — it hydrates 0 bytes. |
| `<MobileTabBar>` + `<LogFAB>` | client | **Split** — tab bar shell RSC, `<NavLinkActive>` + `<LogFAB>` client | FAB needs `onClick` → `useLogFlowStore.open()`. Tab bar structure is static. |
| `<SkipLink>` | static | **RSC** | Pure anchor link. |
| `<ShortcutsOverlay>` (?)  | client | **Client** | `useState(open)` + global key listener. But lazy-load it (see §8). |
| `<ProfileMenu>` (avatar + Sign Out) | client | **Client** | Dropdown with state. |
| Top mobile strip (date + edition) | static | **RSC** | Date is formatted server-side per user TZ (Fragment 3 data contract). No interactivity. |
| `useGlobalShortcuts()` hook | — | **Client** hook, mounted inside a tiny `<KeyboardShortcuts />` client island at layout root | Don't convert the whole layout to client. |

**Flag:** Fragment 2 line 275 says "Viewport-width JS reads via `useMediaQuery`." This is a classic anti-pattern — `useMediaQuery` forces the whole nav subtree client-side and produces SSR placeholder mismatch. Prefer CSS media queries via Tailwind `md:`/`xl:` + conditional display; render **all three nav patterns in parallel** wrapped in `hidden md:flex xl:flex` style guards. Zero hydration cost, no flash.

### Fragment 3 — Dashboard (`agent-3-dashboard.md`)

| Component | Current fragment intent | Correct classification |
|---|---|---|
| `<DashboardMasthead>` | RSC (L48 says "server-rendered") | **RSC** — correct |
| `<ChronometerRing>` | RSC | **Split** — RSC for SVG structure + numbers; **client child** `<ChronometerArcDraw>` for the `motion-chrono-draw` stroke-dashoffset animation on first paint. The numeric value and SVG geometry are server-derived; only the animation driver is client. |
| `<MacroBars>` | RSC | **Split** — RSC for bars + labels; **client child** `<MacroBarFill>` for width transition on value change. In practice, a CSS `transition: width var(--motion-expressive)` makes this RSC-only (no JS needed). Recommend the CSS path — compositor-friendly (tier S per `rerender-*` / `rendering-animate-svg-wrapper` rules in vercel-react-best-practices). |
| `<MealsBulletin>` | RSC | **Split** — Column/entry structure is RSC; `<MealsBulletinRowInteractions>` client island handles `onEntryClick` + context menu + delete. Keep the client surface as tight as possible (wrap individual rows, not the whole bulletin). |
| `<WaterTracker>` | part client per L561 | **Split** — bullet grid + metadata RSC; `<WaterQuickAdd>` client island wraps the `+GLASS` / `+BOTTLE` / `Correct` buttons **and** the bullets that reflect optimistic state. Use `useOptimistic` (see §5). |
| `<MicronutrientPanel>` | RSC | **Split** — list RSC; `<MicrosOverflowToggle>` client for the "+N MORE" expansion. |
| `<WeeklyInsightCard>` | RSC + client regen button | **Split** correct — card body RSC, `<WeeklyReviewRegenButton>` client. Inside a dedicated `<Suspense>` boundary. |
| `<DashboardPage>` (RSC root) | RSC | **RSC** — correct. |

Dashboard composition section L558–L564 already classifies correctly. One adjustment: L562 "Meals Bulletin context menu + delete — client island on entry-row hover/long-press" — scope this client island per-row to avoid hydrating all 20+ entries as client components. Pattern: pass server-rendered entry content as `children` into a `<EntryRowClient>` client wrapper that only owns the event handlers.

### Fragment 4 — Log Flow (`agent-4-log-flow.md`)

Entire log flow is inherently interactive. Design-doc §6 (line 106) confirms: "Log Food — Client components (modal / step flow)."

| Component | Classification |
|---|---|
| `<LogFlowModal>` shell | **Client** (focus trap, Escape, scroll-lock, Zustand `useLogFlowStore`) |
| `<LogTabSwitcher>` | **Client** (Zustand + keyboard nav) |
| `<TypeTab>` textarea + PARSE button | **Client** (state, AbortController, parsing) |
| `<SnapTab>` camera + capture | **Client** (browser APIs: `getUserMedia`, `<input type="file">`, image compression) |
| `<LibraryTab>` grid + search | **Split** — grid skeleton comes from the **existing server-rendered library cache** as initial data; search/filter/selection are client |
| `<PortionPicker>` | **Client** (stepper state, mutation) |
| `<ConfirmationScreen>` | **Client** (inline edits, optimistic save) |
| `<UndoToast>` / `<UndoToastStack>` | **Client** (Zustand `useUndoQueueStore`, timer) |

Correct as-speced. One performance note: the whole log modal must be **dynamically imported** (see §8) — the dashboard first paint must not pay for log-modal JS.

### Fragment 5 — Library (`agent-5-library.md`)

| Component | Classification |
|---|---|
| `<LibraryPage>` root | **RSC** with Cache Components fetch |
| `<LibraryMasthead>` | **RSC** |
| `<LibraryToolsRail>` (search + filter + sort + select) | **Client** (all four bits are stateful). Pass the server-fetched `items` as props. |
| `<LibraryGrid>` container | **RSC** — renders empty grid cells with hairline borders; layout is static |
| `<LibraryItemCard>` | **Split** — card visual is RSC (thumbnail, name, kcal, macros); **client wrapper** `<LibraryItemCardInteractive>` handles hover (CSS-first — no JS), select-mode toggle, context menu, tap-to-drill-in |
| `<LetterMark>` | **RSC** (pure props → SVG/HTML) |
| `<BulkActionBar>` | **Client** (selection set from store) |
| `<FoodDetailSheet>` | **Client** (inline edits, route transition, shared-element animation via Framer Motion layoutId) |
| `<MergeDialog>` | **Client** (per-field radios, live preview) |
| `<BulkDeleteModal>` | **Client** (confirmation state) |

**Flag for search:** Fragment says "For library size < 200 rows … matching is client-side." This forces all 200 item rows into client hydration. Cheaper pattern: render the **whole grid as RSC**, then have a tiny `<SearchFilter>` client island that calls `document.querySelectorAll('[data-lib-item]')` + CSS `display: none` on non-matches (or uses `:has()` / React keys against a filtered array prop). For N ≤ 200 the CSS-filter approach costs ~0 JS beyond the filter logic.

### Fragment 6 — Progress + Remainder (`agent-6-progress-and-remainder.md`)

| Component | Classification |
|---|---|
| `<ProgressPage>` root | **RSC** with Cache Components per section |
| `<ProgressRangeToolbar>` | **Client** — URL-synced via `<Link>`. L31 says "Client Component (URL-synced)" which is correct. But prefer pure `<Link>` with `replace` semantics — no `useRouter().push()`, no client-side re-fetch. Next.js 16 will handle the PPR re-segment. |
| Each chart container (`<CalorieAdherenceChart>` etc.) | **Split** — section shell + title + meta RSC; **client child** `<RechartsWrapper>` is the sole client dependency (Recharts requires client — see §7 bundle note). The server passes a pre-computed numeric array via props. |
| `<MicronutrientHeatmap>` | **Split** — `<table>` structure RSC; per-cell tooltip + hover is CSS-only (tier S) + a single `<HeatmapKeyboardNav>` client hook. Do not make every cell a client component — that's 210 cells × hydration cost. |
| `<WeeklyReviewIsland>` | **RSC** inside `<Suspense>` (PPR hole). `<WeeklyReviewRegenButton>` client child only. |
| `<OnboardingLayout>` + 8 steps | **Client** (Zustand `useOnboardingStore` with `sessionStorage` persist). Each step is client. |
| `<SettingsPage>` + 5 subsections | **Split** — page shell RSC (reads profile via Cache Components); each subsection has a mix of RSC labels + client form controls. Use Server Actions + `useFormStatus` (see §5). |
| `<AccountDeleteFlow>` | **Client** (3-modal state machine + countdown) |
| `<ExportModal>` | **Client** (progress + download anchor) |
| `<LoginForm>` | **Client** (Supabase auth call) — or migrate to a **Server Action** (see §4/§5) |
| `<FirstTimeDashboardCoachmark>` | **Client** (localStorage dismissal + coachmark overlay) |
| `<PWAInstallPrompt>` | **Client** (`beforeinstallprompt` capture) |

### Summary count

| Split | Count | Rationale |
|---|---|---|
| **RSC** (no client JS) | 27 | tokens module, mastheads, section shells, data tables, letter-marks, progress page shell, onboarding step scaffolding, settings section headers, login wordmark |
| **Client** (`'use client'`) | 38 | log flow (10), undo toast, merge dialog, bulk delete, portion picker, onboarding steps (8), settings form controls (5), shortcuts overlay, FAB, nav active indicator, tablet rail, range toolbar, chart client wrappers (7), weekly regen button, coachmark, PWA prompt, delete flow, export modal |
| **Split** (RSC parent + client leaf) | 14 | chronometer ring, macro bars, meals bulletin, water tracker (critical!), micronutrient panel, weekly insight card, library cards, food detail sheet, chart containers, heatmap, library tools, dashboard composition, mobile nav, sidebar nav |

---

## 2. Cache Components + PPR Partitioning

Per architecture.md §5 and design-doc.md §6, Approach C is Cache Components + PPR on data-heavy surfaces. The three surfaces: Dashboard, Library, Progress.

### Dashboard (`/` authed)

**`use cache` placement:**

```tsx
// app/(app)/page.tsx — RSC
export default async function DashboardPage() {
  const uid = await getUserId();   // runtime value; outside cache
  const day = await getToday(uid); // runtime value; outside cache

  return (
    <>
      <DashboardMasthead uid={uid} />          {/* RSC, data from profile cache */}
      <Suspense fallback={<DashboardDataSkeleton />}>
        <DashboardData uid={uid} day={day} />  {/* use cache boundary */}
      </Suspense>
      <Suspense fallback={<WeeklyInsightSkeleton />}>
        <WeeklyInsightCard uid={uid} />        {/* separate PPR hole */}
      </Suspense>
    </>
  );
}

async function DashboardData({ uid, day }: { uid: string; day: string }) {
  'use cache';
  cacheLife('minutes');  // design-doc §11 L632
  cacheTag(TAGS.userEntries(uid, day));

  const entries = await fetchEntries(uid, day);
  return (
    <>
      <ChronometerRing data={entries} />
      <MacroBars data={entries} />
      <MealsBulletin data={entries} />
      <MicronutrientPanel data={entries} />
    </>
  );
}

async function WeeklyInsightCard({ uid }: { uid: string }) {
  'use cache';
  cacheLife({ stale: 3600, revalidate: 86400 * 7, expire: 86400 * 7 });
  cacheTag(TAGS.weeklyReview(uid, weekStartOn));
  const insight = await fetchOrGenerateWeekly(uid);
  return <WeeklyInsightBody insight={insight} />;
}
```

**Critical rule** (per `vercel:next-cache-components`): `cookies()`, `headers()`, `searchParams` **cannot** appear inside `use cache`. The `uid` must be extracted in the caller and passed as an argument (it becomes part of the cache key automatically). Fragment 3 L548–L570 already implies this pattern; confirm with implementers.

**Static shell (prerendered at build):**

- Masthead wordmark + edition-number static text (the kicker line `THE LEDGER · KALORI · VOL. X · EDITION N` is per-user, so it's inside the `profile:${uid}` cache — **not truly static**; see below)
- Section kickers (`§ 01 · TODAY'S INTAKE`)
- Grid hairline scaffolding (CSS-only)
- Skeleton fallbacks for both Suspense boundaries

**Cached (`use cache` with `cacheLife('minutes')`):**

- Chronometer numbers, Macro Bars, Meals Bulletin, Micronutrient Panel (all share `TAGS.userEntries(uid, day)` — single cached component per dashboard-day)

**Dynamic (Suspense hole):**

- Water Tracker quick-add island (client, optimistic)
- Weekly Insight body (own Suspense; independent latency — Gemini up to 6 s)

**`updateTag` correctness:**

Every mutation in the cross-ref `Data Flow Summary` (Fragment 4 L583–L617, Fragment 5 L813–L857) correctly calls `updateTag(TAGS.userEntries(uid, day))` after save/delete/edit. The merge path additionally calls `updateTag(TAGS.userEntries(uid, day))` per affected day — this is correct.

**One regression risk:** If `<DashboardMasthead>` ingests `editionNumber`, `displayName`, `volume` (Fragment 3 L15–L30) from a separate `use cache` boundary tagged `TAGS.profile(uid)`, a water-add mutation should NOT invalidate the masthead. Currently `updateTag` calls are scoped per surface — good. Verify no code path accidentally invalidates `TAGS.profile(uid)` on entry saves.

### Library (`/library`)

Single `use cache` boundary for the whole grid:

```tsx
async function LibraryGridServer({ uid }: { uid: string }) {
  'use cache';
  cacheLife('minutes');
  cacheTag(TAGS.userLibrary(uid));
  const items = await fetchLibrary(uid);
  return <LibraryGrid items={items} />;
}
```

The tools rail (search + filter + sort + select) is **client**; it consumes `items` as props. The filter/sort UI is state-only — do NOT re-fetch on filter/sort change. Per-filter caching via URL param + `use cache` keyed on param would cause N × 6 sort × 4 filter = 24 cache entries per user; wasteful.

**PPR partitioning:**

- Static shell: masthead + tools rail bones + grid scaffolding
- Cached: item grid content
- Dynamic: none (bulk action bar materializes from client selection state; optimistic delete uses `updateTag`)

### Progress (`/progress`)

The fragment correctly specs per-section `use cache` with `TAGS.userProgress(uid, range)`:

```tsx
async function CalorieAdherenceSection({ uid, range }) {
  'use cache';
  cacheLife('hours');   // progress aggregates tolerate staler caching
  cacheTag(TAGS.userProgress(uid, range));
  const data = await aggregateCalories(uid, range);
  return <CalorieAdherenceChart data={data} />;
}
```

**`cacheLife('hours')` recommendation:** design-doc §11 L634 suggests `cacheLife` for progress; `'hours'` fits the 30-day window (reads are expensive aggregations, writes invalidate). Confirm with the team.

**Weekly Review Island — dedicated Suspense boundary:** Fragment 6 L376–L389 correctly places it in its own `<Suspense>`. This is the PPR hole that prevents Gemini latency from blocking the first paint of the charts above it. **Critical.**

**Range toolbar interaction:** Each chip click causes PPR re-render of all 5 sections. With `cacheLife('hours')`, only the current-range section pays the compute cost on first load; subsequent chip clicks hit cache. Cost is bounded.

**Heatmap warning:** the 7 × N table has up to 7 × 365 = 2,555 cells. Even in RSC, serializing this to the client is ~40 KB of HTML. Acceptable for a signature surface, but must be tested under slow 3G.

---

## 3. Suspense Boundary Placement

Reference: `async-suspense-boundaries` from vercel-react-best-practices — "Use Suspense to stream content."

| Fragment | Component | Suspense wrap | Fallback | Boundary level |
|---|---|---|---|---|
| 3 (Dashboard) | `<DashboardData>` (chrono + macros + meals + micros) | YES | `<DashboardDataSkeleton>` with chrono ring hairline + macro tracks (dust `—`) | Component-level inside RSC route |
| 3 (Dashboard) | `<WeeklyInsightCard>` | YES (separate from above) | 4-line hairline skeleton per L508 | Component-level (PPR hole) |
| 5 (Library) | `<LibraryGridServer>` | YES | Empty ruled grid with skeleton cells | Component-level |
| 6 (Progress) | Each of 5 chart sections | YES × 5 (one per section) | `<ChartSkeleton>` with title + 7 grey bars at 40% opacity (L108) | Component-level — preserves out-of-order streaming |
| 6 (Progress) | `<WeeklyReviewIsland>` | YES (separate from charts) | `<WeeklyReviewSkeleton>` per L419–L426 | Component-level (PPR hole) |
| 4 (Log Flow) | Library tab list inside log modal | YES (when opened) | Empty grid skeleton | Component-level |
| 2 (Navigation) | Sidebar content (masthead + nav list) | NO | — | No async data; RSC-only |
| 6 (Progress) | `<ProgressRangeToolbar>` | NO | — | Client component, no async |

**Route-level vs component-level:** Next.js 16 App Router already wraps each route in an implicit Suspense boundary (via `loading.tsx`). Adding component-level boundaries gives finer-grained streaming — particularly important for the dashboard where the Weekly Insight Card must stream independently.

**Upgrade recommendations (top 3):**

1. **Dashboard Weekly Insight** — Fragment 3 already specs this as a PPR island (L472 "renders as a PPR Suspense island"). Make sure the Suspense boundary is a **dedicated component** around the card, not shared with the main dashboard-data boundary. Current fragment text is slightly ambiguous at L564.
2. **Progress Weekly Review Island** — Fragment 6 L385 already inlines the `<Suspense>`. Good. Add a comment that its position (AFTER the heatmap) means the rest of the page streams first, which is the UX intent.
3. **Log Flow Library tab** — when the user opens the log modal → Library tab, the library list should stream. Currently Fragment 4 L188 mentions "cached library list"; confirm this uses `<Suspense>` with a skeleton grid so the modal doesn't block on library fetch. Recommend adding a `<Suspense fallback={<LibraryTabSkeleton />}>` around the grid in the tab body.

---

## 4. Server Actions + Optimistic Updates

Next.js 16 prefers **Server Actions** (`'use server'`) for mutations over Route Handlers. The architecture currently uses POST `/api/*` routes for everything (architecture.md §8 L940–L947). This is legacy — for every mutation, Server Actions are simpler and faster.

### Migration table

| Mutation | Current route | Recommended migration | Benefit |
|---|---|---|---|
| Log save | POST `/api/entries/save` | `'use server'` action in `app/actions/entries.ts` | Invoke via `<form action={saveEntryAction}>` or `startTransition(() => saveEntryAction(payload))`. Saves one fetch round-trip + serialization. |
| Water +glass | POST `/api/water/log` | Server Action | Direct `useOptimistic` integration (see below) |
| Weight add | POST `/api/weight/log` | Server Action | Same |
| Library PATCH | PATCH `/api/library/[id]/update` | Server Action (`updateLibraryItem`) | Same |
| Library DELETE | DELETE `/api/library/[id]/delete` | Server Action (`deleteLibraryItem`) | Same |
| Library merge | POST `/api/library/merge` | Server Action (`mergeLibraryItems`) | Same |
| Library bulk-delete | POST `/api/library/bulk-delete` | Server Action | Same |
| AI text parse | POST `/api/ai/text-parse` | **Keep as Route Handler** | Gemini calls need streaming + AbortController; Server Actions are weaker here |
| AI vision | POST `/api/ai/vision` | **Keep as Route Handler** | Image upload + streaming |
| Weekly review | POST `/api/ai/weekly-review` | **Keep as Route Handler** | Long-running |

Per `server-auth-actions` from vercel-react-best-practices: Server Actions MUST authenticate exactly like API routes. Add `await getUserId()` + RLS check at the top of every action.

### `useOptimistic` integration

Per React 19 (and `vercel:react-best-practices`), optimistic updates use the `useOptimistic` hook instead of ad-hoc Zustand + rollback.

**Water tracker (Fragment 3 L318–L391):**

```tsx
'use client';
import { useOptimistic, useTransition } from 'react';

export function WaterQuickAdd({ initial, addAction }: Props) {
  const [optimistic, addOptimistic] = useOptimistic(
    initial,
    (state, delta: { clientId: string; ml: number }) => ({
      consumedMl: state.consumedMl + delta.ml,
      entries: [...state.entries, { id: delta.clientId, ml: delta.ml, pending: true }],
    }),
  );
  const [pending, startTransition] = useTransition();

  async function handleGlass() {
    const clientId = crypto.randomUUID();
    startTransition(async () => {
      addOptimistic({ clientId, ml: 250 });
      await addWaterAction({ clientId, ml: 250 }); // Server Action
    });
  }
  // render bullets from optimistic.consumedMl + optimistic.entries
}
```

**Undo queue (Fragment 4 L444–L568, I8):**

The LIFO undo queue is a **Zustand store** that holds mutation snapshots. `useOptimistic` handles the per-mutation optimistic insert; the undo queue wraps the Server Action call with an "if-not-undone-in-5s, commit" timer. The two cooperate:

1. User clicks "+GLASS" → `useOptimistic` adds a pending bullet immediately.
2. `useUndoQueueStore.pushToast({ clientId, onCommit: () => addWaterAction(...), onUndo: () => rollbackOptimistic() })`.
3. After 5 s, `onCommit` runs the Server Action (for non-undoable-commit mutations, the server call fires immediately).
4. If user clicks UNDO, `onUndo` reverses the optimistic state and never calls the server.

**Alternative:** fire the Server Action immediately (optimistic insert + network in flight). Undo fires a `DELETE` with the same `client_id`. This is what Fragment 4 already specs (L517–L525) — keep as-is.

### `client_id` generation (I11)

Fragment 4 L274 and L401 correctly generate `client_id = crypto.randomUUID()` **before** the optimistic insert. This is critical: the optimistic row carries the client-generated id, so the server's idempotent `UNIQUE(client_id)` constraint matches the optimistic row on replay.

**Bug risk:** Fragment 5 L474 says library edit uses `PATCH /api/library/[id]/update body: { client_id: uuid, fields: {...} }`. Good. But the fragment also says "library edits are **pessimistic** with a brief loading state" (L475). With pessimistic + `client_id`, the `client_id` serves as replay protection for retries (network flakes), NOT optimism. Document this distinction — it matters for test coverage.

### Revalidation path correctness

Per `vercel:next-cache-components`: after a Server Action, call `updateTag(TAGS.userEntries(uid, day))` for immediate re-read, NOT `revalidatePath` (which is Page Router era). All current fragments say `updateTag` correctly.

For `useOptimistic` patterns, the **client** doesn't need to wait for revalidation — the optimistic state already shows the change. After the Server Action completes, the RSC re-fetch happens via `updateTag` in the background; React 19 merges the result.

---

## 5. `useOptimistic` + `use` + React 19 Patterns

Per `vercel-react-best-practices` and React 19 docs:

| Hook | Where to use |
|---|---|
| `useOptimistic` | Water tracker, Weight quick-add, Entry delete (in meals bulletin), Library bulk-delete (after confirm), Library merge (after confirm), Log save (the optimistic insert that Fragment 4 L404 describes) |
| `use(promise)` | Unwrap a promise inside a client component under a Suspense boundary — applicable where a client component consumes server-fetched data as a promise prop (rare in these fragments; the server components already `await`). Do NOT use `use()` to bypass RSC — that's an anti-pattern. |
| `useFormStatus` | Inside any `<form action={serverAction}>`: the PARSE button, SAVE TO LEDGER, APPLY CHANGES (settings), onboarding step NEXT, DELETE MY ACCOUNT, GENERATE WEEKLY REVIEW — show `pending` UI without prop-drilling |
| `useFormState` / `useActionState` | Settings autosave fields, login form — server-action returns `{ ok, error }`; hook gives inline error message |
| `useTransition` | Range toolbar chip switch (Fragment 6 L63) — wrap the navigation in `startTransition` to show a pending state without blocking. Also the log flow PARSE button. |

**Component-specific recommendations:**

1. **`<PARSE>` button** (Fragment 4 L81–L86): use `useFormStatus().pending` to show the "PARSING…" state instead of tracking `isParsing` in Zustand. Less state to manage.
2. **`<SAVE TO LEDGER>` button** (Fragment 4 L390): same — `useFormStatus`.
3. **Onboarding NEXT button** (Fragment 6 L491): wrap each step as a `<form>` with `action={saveStepAction}`. Use `useFormStatus` for the pending state, `useActionState` for inline validation errors. Drops a lot of Zustand per-step state.
4. **Settings autosave**: use `useActionState` so the moss "Saved." toast + oxblood "Couldn't save" error are inline, not prop-drilled through a Zustand UI store.
5. **Weight log trend line + projection computation** (Fragment 6 L174–L178): already server-computed. Keep RSC.

**Anti-patterns to avoid:**

- Do not use `useOptimistic` for library item edits — Fragment 5 explicitly says pessimistic. `useFormStatus` + `useActionState` is the right combo there.
- Do not use `useEffect + fetch` for any of these mutations. That hydrates the whole subtree and loses cache-tag invalidation.

---

## 6. Memoization Strategy

Per `rerender-*` rules: memoize **expensive computations**, not cheap primitives.

### Components that benefit from `React.memo`

| Component | Reason |
|---|---|
| `<LibraryItemCard>` | Grid of 50–200 items; re-rendering all of them on filter change is wasteful. Memo on `item.id + item.updated_at` key. |
| `<MealsBulletinRow>` (each entry) | Up to 20 rows per day; each row renders italic serif, mono macros, etc. Memo stable. |
| `<HeatmapCell>` | 7 × 30 = 210 cells on default 30d view. Memo on `value + status` — saves redraws when a neighbor updates. Critical. |
| `<WaterBullet>` | 8–16 bullets; memo prevents all bullets from re-rendering when only one flips. |
| `<NavItem>` | 5 sidebar items; memo on `active + label` prevents re-render on every route change (only the newly-active and newly-inactive need to re-render). |
| `<MicroRow>` | 7–10 rows. Memo stable. |

### `useMemo` / `useCallback` candidates

| Computation | File | Reason |
|---|---|---|
| `filteredItems` (Library search) | `<LibraryToolsRail>` / `<LibraryGrid>` bridge | Filter computation runs on every keystroke; memo on `debouncedQuery + items` reference. |
| `sortedItems` | Same | Same. |
| `nowIndicatorAngle` (Chronometer) | `<ChronometerRing>` props computation | Already server-computed (Fragment 3 L143). No memo needed — primitive prop. |
| Chart `data` arrays | `<CalorieAdherenceChart>` etc. | Already server-computed and passed as prop. No client memo needed unless client transforms. |
| `onAddGlass` / `onAddBottle` callbacks | `<WaterQuickAdd>` | `useCallback` to keep stable for memoized bullet children. |

### Cargo-cult wrapping to AVOID

- **Do NOT wrap** `<ChronometerRing>` or `<MacroBars>` in `React.memo` — they re-render once per cache invalidation and take props that change on every invalidation. No win.
- **Do NOT wrap** static components (`<SkipLink>`, `<DashboardMasthead>`) in memo. They're RSC — never re-render at runtime.
- **Do NOT useMemo** on primitive derivations (`const pct = consumed / target`). Cheaper than the memo bookkeeping. See `rerender-simple-expression-in-memo`.

### `rerender-derived-state-no-effect` applied

Fragment 3 L108 computes `pctOfTarget` — derive during render, not in an effect. Fragment should not use `useEffect(() => setPct(...))` patterns anywhere. (Unlikely, but flag.)

---

## 7. Bundle Impact

Per `bundle-barrel-imports`, `bundle-dynamic-imports`, `bundle-defer-third-party`: track every client-side library and ensure each is justified.

### Current library footprint (by fragment)

| Library | Fragment(s) | Gzipped | Use justification | Web-UI-Guide Quick-Pick entry |
|---|---|---|---|---|
| **Framer Motion** | 1, 3, 5 | ~32 KB | Page transitions, drop cap animation, chronometer ring, drill-in shared-element, modal entry/exit | "Page/route transitions, layout animations" → Motion ⚛ |
| **Recharts** | 6 | **~120 KB** | 5 chart sections on progress page | Not listed in Quick-Pick (Tremor is the dashboard-specific choice); **see issue below** |
| **Zustand** | 1, 3, 4, 5, 6 | ~3 KB | Log flow, undo queue, onboarding, UI store | Not in animation table; acceptable state-lib size |
| **TanStack Query** | 3 (provisional) | ~13 KB | Client-side invalidation post-mutation | design-doc §6 L123 flags as "evaluated in Phase 3"; "added only if needed" |
| **@supabase/ssr** | Everywhere (auth) | ~15 KB | Auth cookies + session refresh | Required |
| **Zod** | Fragment 4 server + client validation | ~14 KB | Input validation for AI responses + mutation payloads | Justified |
| **MSW** | Tests only | 0 KB prod | Mock service worker for integration tests | Test-only; ensure not in prod bundle |
| **axe-core** | Tests only | 0 KB prod | a11y CI | Test-only |
| **@phosphor-icons/react** | Fragment 2 | ~2 KB per icon (SSR path) | Nav icons | Fragment 2 L409 correctly uses `/dist/ssr/` per-icon imports — good (avoids barrel) |
| **lucide-react** | Fragments 4, 5 | ~1–2 KB per icon | Camera, Search, X, Trash, etc. | Also tree-shakeable |
| **browser-image-compression** | Fragment 4 | ~20 KB | Client-side photo compression | Justified for snap tab |
| **Radix UI** (Dropdown, Menu, Tooltip, Dialog) | Fragment 5 | ~15 KB total | Accessibility primitives | Justified |

### Top 3 bundle concerns

1. **Recharts ~120 KB is heavy** for a single page. The web-UI-guide Quick-Pick Decision Table §5 says "Declarative, React-native, shadcn-friendly" — reasonable, but heavy. **Recommendation:** for the simpler chart surfaces (Macro Distribution stacked bars, Water Adherence horizontal bars, Weight Trajectory single line), consider **inline SVG** with manual `<path>` / `<rect>` — these are ~50 lines of code each, zero dependency. Reserve Recharts for the Heatmap (complex interactions) and Calorie Adherence Chart (ComposedChart with target line, projection, tooltips). Rough savings: if you drop 3 of 5 charts to inline SVG, you can keep Recharts but `bundle-dynamic-imports` it behind `next/dynamic(() => import('./RechartsCharts'), { ssr: false })` and only pay 120 KB on the progress page — never on dashboard or library. **If you keep all 5 on Recharts, still dynamic-import.**

2. **Framer Motion** is used across dashboard (chronometer, drop cap), library (shared-element drill-in), and log flow (modal entry). Web-UI-Guide §12 L569 recommends `LazyMotion` + `m` components: 4.6 KB initial + 15–25 KB lazy. **Apply** — the initial paint of the dashboard should not pay for the full Motion bundle. Use the `framer-motion/m` lazy-feature pattern:

   ```tsx
   import { LazyMotion, domAnimation, m } from 'framer-motion';
   <LazyMotion features={domAnimation}>
     <m.div animate={{ opacity: 1 }} />
   </LazyMotion>
   ```

   Potential savings: **~27 KB on initial page load**.

3. **TanStack Query provisional** — design-doc §6 L123 already hedges on whether to include it. For Approach C, `updateTag` + Server Actions cover most cases. If the only remaining need is cross-component cache coordination (e.g., library tab in log modal showing fresh data after a library mutation elsewhere), a much smaller pattern works: just call `router.refresh()` after a Server Action. **Recommendation: do NOT ship TanStack Query unless a specific need materializes.** Save 13 KB.

### Secondary concerns

- **Phosphor icons SSR path** (Fragment 2 L409 `@phosphor-icons/react/dist/ssr/ChartBar`) — confirm the rest of the codebase uses this pattern. A single barrel `import { ChartBar } from '@phosphor-icons/react'` pulls the whole icon set (~450 KB raw, tree-shaken down but still wasteful). Add an ESLint rule forbidding barrel imports of this lib (per `bundle-barrel-imports`).
- **Next Font** (Fragment 1 L166–L202) — correctly uses `next/font/google` which self-hosts. Axes loading for Newsreader uses `opsz: 6..72` (3 weights × 2 styles × full opsz range) — that's a lot of font data. Consider `preload: false` on weights not above-the-fold.

### Per-library Quick-Pick citations

- **Motion (Framer Motion)** — Quick-Pick entry: page/route transitions, layout animations, **~32 KB**. ✅ Justified use for drop cap, chrono arc, modal entry, shared-element.
- **Recharts** — Not in Quick-Pick; web-UI-guide §5 calls out Recharts and chart.js as the two options. Recharts chosen — OK for heatmap complexity, but bundle cost is the main compromise.
- **AutoAnimate (~3.3 KB)** — Not used by any fragment. Consider for meals-bulletin entry fade-in and library-grid shuffle — it's zero-config and would replace manual Framer orchestration for those surfaces. Could save stagger-setup code.
- **tsParticles / Vanta** — none used. Good (they are 15–120 KB).
- **Rive / Lottie** — none used. Good.
- **GSAP** — not used; no complex scroll scrubbing or timeline needed.

---

## 8. Lazy Loading + Code Split

Per `bundle-dynamic-imports` and `bundle-conditional`:

### Dynamic-import candidates (highest to lowest impact)

1. **Log Flow Modal** — Fragment 4's entire surface. Route `/log` doesn't exist as a page; the modal opens over the current route. **The dashboard first paint must not pay the modal's JS cost.**

   ```tsx
   const LogFlowModal = dynamic(() => import('@/components/log/LogFlowModal'), {
     ssr: false,  // Modal is client-only; no SSR benefit
   });
   ```

   Gate on `useLogFlowStore.isOpen`. Approximate savings on dashboard first paint: **~40–60 KB** (modal + portion picker + confirmation + camera setup + compression lib).

2. **Snap Tab camera + compression** — `browser-image-compression` is only needed in the snap tab. Lazy-load it **inside** the snap tab's capture action:

   ```tsx
   const { default: imageCompression } = await import('browser-image-compression');
   ```

   Don't import at the top of the log modal.

3. **Merge Dialog + Bulk Delete + Account Delete Flow** — Fragment 5 + 6 surfaces. All three are rarely-opened. Lazy-load each.

4. **Recharts** — dynamic-import per §7. Gate on the `/progress` route only.

5. **Shortcuts overlay** (Fragment 2 L247) — lazy-load when `?` is pressed.

6. **PWA Install Prompt** (Fragment 6 L1006) — lazy-load when the 3rd-log trigger fires, not on page load.

7. **Export Modal** (Fragment 6 L833) — lazy-load on click.

8. **Onboarding layout** — only loaded at `/onboarding` route; automatic route-level code split. No extra work.

### What NOT to lazy-load

- Dashboard's chronometer, macros, meals, water, micronutrient panel — all server-rendered RSC, no client JS bundle to split.
- Library grid — RSC.
- Navigation chrome — always present.
- Masthead — always present.

### Preload hints (`bundle-preload`)

Per `vercel-react-best-practices`: preload on hover/focus. Apply to:

- Nav items: preload the target route's JS on hover (Next.js `<Link prefetch>` does this by default).
- FAB button: on hover/focus, preload `LogFlowModal`. Use `import(/* webpackPrefetch: true */ ...)` or `<Link prefetch>`.
- Library card: on hover/focus, preload `FoodDetailSheet`.

---

## 9. Data Fetching Pattern Consistency

Review of which surface fetches from where:

| Surface | Data source | Fragment specifies? | Consistent? |
|---|---|---|---|
| Dashboard | Server RSC with `use cache` + TAGS.userEntries | Fragment 3 L568 | ✅ |
| Library | Server RSC with `use cache` + TAGS.userLibrary | Fragment 5 L11–L13 | ✅ |
| Food Detail | Server RSC (new route `/library/[id]`) + `use cache` | Fragment 5 L826 | ✅ |
| Progress | Server RSC with `use cache` + TAGS.userProgress per range | Fragment 6 L3–L9 | ✅ |
| Log Flow Library tab | "cached library list … from the `useLibraryStore` or server-fetched snapshot" | Fragment 4 L216 | ⚠️ — **inconsistent** |
| Library search filter | Client-side filter on cached list | Fragment 5 L79 | ✅ (with server fallback at 200+ rows) |
| Weekly Review | Server RSC with `use cache` + TAGS.weeklyReview | Fragment 3 L540, Fragment 6 L391 | ✅ |
| Onboarding steps | Client state only; commit on final submit | Fragment 6 L497 | ✅ |

### Inconsistencies to resolve

**Log Flow Library tab (Fragment 4 L216):** says "cached library list (from the `useLibraryStore` or server-fetched snapshot; no per-keystroke fetch)." The phrase "`useLibraryStore`" suggests a client-side Zustand store. This contradicts Approach C — library reads should always come from the server cache via RSC. Recommended fix:

- When the log modal opens → Library tab, render the Library tab with an **RSC child** that runs the same `use cache` boundary as `/library`. The search/filter stays client-side, operating on the server-provided `items` prop.
- Do NOT duplicate the library into a Zustand store. That creates three sources of truth (server, Zustand, React Query) and makes invalidation a mess.

**TanStack Query decision:** design-doc §6 L119 says "provisional"; Fragment 3 L575 confirms it's the planned cache-coordination layer. Per §7 above, try to avoid adding it at all. If it **does** ship, the fragments should be explicit per surface:

- Library mutations: TanStack Query invalidates the `library` key.
- Dashboard mutations: TanStack Query invalidates `entries:${day}`.

Fragments currently don't name these keys. **Flag for synthesis.**

### Fragment 3 `useEntriesStore` anti-pattern

Fragment 4 L274 mentions `useEntriesStore.today` — a Zustand store holding optimistic entries. Per design-doc §11 L642: "Never duplicate server state into Zustand." The correct pattern:

- Server cache holds the truth.
- `useOptimistic` holds the optimistic view on the client (transient).
- Zustand holds ONLY the undo queue (mutation snapshots for rollback), NOT the entry list.

Recommendation: remove `useEntriesStore.today` from the optimistic insert path. Use `useOptimistic` per-component (water tracker, meals bulletin) with the server-fetched initial state. The undo queue stays Zustand because it's cross-component.

---

## 10. Hydration Cost

Back-of-envelope estimates per route's **client JS** bundle (gzipped, parsed, post-minification):

| Route | Always-included chunks | Dynamic chunks (gated) | Approx total hydration |
|---|---|---|---|
| `/` (Dashboard) | React 19 (~50 KB) + Next.js runtime (~20 KB) + LazyMotion initial (4.6 KB) + Zustand (3 KB) + Phosphor icons for nav (~6 KB) + water tracker client island (~3 KB) + meals bulletin interactions (~2 KB) + weekly regen button (~1 KB) + `useOptimistic` helpers (built-in to React) + `@supabase/ssr` session refresh (~5 KB) | on-demand: LogFlowModal (~40 KB), Framer features (~20 KB), sharutchuts overlay (~2 KB), PWA prompt (~3 KB), merge dialog, etc. | **~95 KB initial**; ~160 KB after modal open |
| `/library` | React + Next (70 KB) + Motion base (4.6 KB) + Zustand (3 KB) + Radix Dropdown/Menu/Tooltip (~15 KB) + library tools rail (~4 KB) + Phosphor (~4 KB) + optional library search fallback (~1 KB) | on-demand: Food Detail sheet + Framer layout animations (~15 KB), Merge dialog (~5 KB), Bulk Delete modal (~3 KB), Log flow modal | **~100 KB initial** |
| `/progress` | React + Next (70 KB) + Zustand (3 KB) + range toolbar client (~1 KB) + Recharts (**~120 KB**) + chart wrappers (~5 KB) + Framer for stagger (~4.6 KB base + lazy) | on-demand: Weekly regen, heatmap keyboard nav, log flow | **~205 KB initial — exceeds 200 KB threshold** |
| `/log` route (modal opens) | inherits parent + Log modal bundle (~40 KB) + Zustand stores (already loaded) + `browser-image-compression` if snap tab (~20 KB lazy) | — | **+40–60 KB over parent** |
| `/onboarding` | React + Next + onboarding steps (~15 KB) + Zustand + Slider input (~2 KB) | — | **~90 KB** |
| `/settings` | React + Next + settings subsections (~10 KB) + Zustand + toggle components | — | **~80 KB** |
| `/login` | React + Next + login form (~3 KB) + @supabase/ssr client (~15 KB) | — | **~90 KB** |

### Routes exceeding 200 KB threshold

Only **`/progress`** risks exceeding 200 KB, and only because of Recharts. Options:

1. **Lazy-load Recharts** via `next/dynamic` with a skeleton fallback (already recommended in §7). Drops initial from 205 KB → 85 KB; charts hydrate after shell paint.
2. **Replace simpler charts with inline SVG** (§7 recommendation). Drops charts bundle from 120 KB → maybe 40 KB for heatmap-only.
3. **Both** — lazy Recharts, inline SVG for simple charts. Gets `/progress` comfortably under 150 KB initial.

### Hydration risk flags

- **Dashboard + Log modal open** pushes to ~160 KB. Still under 200 KB, but confirm with Lighthouse. Lazy-load the merge dialog / confirmation details per §8.
- **Library + Food detail sheet** — together ~115 KB. Acceptable.
- **Framer Motion everywhere** — switching to `LazyMotion` + `m` components saves ~27 KB on every route that uses Motion. Apply universally.

---

## 11. Fragment-Specific Recommendations

### Fragment 1 — Foundations (`agent-1-foundations.md`)

1. **`lib/motion/use-motion.ts` must declare `'use client'`** (§6.5) — the hook uses `useReducedMotion()` which is client-only.
2. **ESLint rule `no-outline-none`** (§9.3) — add to the lint suite; enforces `focus-visible` discipline globally. This prevents a common a11y regression class.
3. **Zustand stores** — keep them tiny. design-doc §11 principle is sound; add an explicit rule that no Zustand store holds server data (i.e., no entries list, no library list).

### Fragment 2 — Navigation (`agent-2-navigation.md`)

1. **Drop `useMediaQuery`** (L275). Render all three nav patterns unconditionally with Tailwind `hidden md:flex xl:flex` guards. Zero hydration cost, no SSR placeholder, no flash. All three render as RSC.
2. **Active nav indicator** → isolate `usePathname()` into a tiny `<NavActiveIndicator>` client component per item. The rest of the sidebar stays RSC. Currently the fragment implies the whole sidebar is client; cut that.
3. **Phosphor icons SSR path** (L409) — already correct; add ESLint `no-restricted-imports` for the barrel entry `@phosphor-icons/react`.

### Fragment 3 — Dashboard (`agent-3-dashboard.md`)

1. **Chronometer arc animation as CSS** — the `stroke-dashoffset` animation (L124) can be pure CSS via `@keyframes` on mount. No Framer Motion needed for this one animation. Saves the Motion bundle on first-paint-only users.
2. **Meals Bulletin context menu scoped per-row** — L562 says client island on entry rows. Scope each `<EntryRow>` as `<EntryRowClient>` wrapper with server-rendered content as children. Don't hydrate 20+ entries as one client block.
3. **Weekly Insight Card Suspense must be dedicated**, separate from the main dashboard-data Suspense (see §2). The fragment says this at L564 but the prose is ambiguous — clarify.

### Fragment 4 — Log Flow (`agent-4-log-flow.md`)

1. **Whole modal `next/dynamic`** with `ssr: false` (§8). Massive first-paint saving on dashboard.
2. **Use `useOptimistic` + `useFormStatus` + `useActionState`** for save/parse/undo surfaces (§5). Replaces several custom states.
3. **Remove `useEntriesStore` from the optimistic path** (§9). Use `useOptimistic` per component. Zustand only for the LIFO undo queue.

### Fragment 5 — Library (`agent-5-library.md`)

1. **`<LibraryItemCard>` = Split pattern** (§1). RSC renders the card visual; a tiny `<LibraryItemCardClient>` wrapper handles hover + select-mode toggle + context menu trigger. Hydration cost drops by ~70% for the grid.
2. **Memo the card** with `React.memo` on `item.id + item.updated_at` (§6). Prevents the 200-item grid from re-rendering on filter change.
3. **Server-fetched initial data for Tools Rail** (§1). Do NOT duplicate the items into a client store; pass them as props. Filter state stays client-local.

### Fragment 6 — Progress & Remainder (`agent-6-progress-and-remainder.md`)

1. **Dynamic-import Recharts** (§7/§10). Gate all 5 charts behind `next/dynamic({ ssr: false })`. Reduces `/progress` from 205 KB → 85 KB.
2. **Consider inline SVG for the 3 simpler charts** (Macro Distribution stacked bars, Water Adherence horizontal bars, Weight Trajectory line) — each is ~50 LOC of native SVG. Keeps Recharts for Calorie Adherence (ComposedChart) + Heatmap (complex table). Further reduces bundle.
3. **Onboarding → Server Action per step** (§4/§5). Drops a lot of Zustand + `sessionStorage` glue code; `useFormState` / `useActionState` is more idiomatic in React 19.
4. **Heatmap per-cell as buttons (L321)** — 210 buttons is a lot. Keep them as buttons for a11y, but use **event delegation** on the table via `onClick` at the grid-container level — fewer listener instances. Also: render the whole `<table>` in RSC; only the keyboard navigation state is client.

---

*End of enrichment-react-perf.md. Invoked skills: `vercel-react-best-practices`, `ui-design` + `web-ui-guide.md`, `vercel:nextjs`, `vercel:next-cache-components`.*
