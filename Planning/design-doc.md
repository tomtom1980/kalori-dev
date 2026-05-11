# Kalori — Design Document

> **Canonical design document.** Consolidates all decisions from the 8-round brainstorming session and the 4-direction mockup selection (Direction 1 "The Ledger" — Editorial/Archival — selected as winner). This is the source of truth for all downstream artifacts: `PRD.md`, `architecture.md`, `ui-design.md`, `tasks.md`, `testing-strategy.md`.
>
> **Input sources (authoritative):**
> - `Planning/kalori-project-blueprint.md` — canonical product spec (§1–12)
> - `Design/calorie-app-design-prompt.md` — original design brief
> - `Design/mockups-brainstorm/direction-1-editorial/brief.md` — "The Ledger" visual system
> - `Design/mockups-brainstorm/direction-1-editorial/index.html` — visual reference mockup

---

## 1. Executive Summary

Kalori is an **AI-first, dark-mode calorie and nutrition tracking web app** built for a single health-conscious adult (initially the project owner, then invite-only expansion to ~10–100 users). It replaces global food-database search — the defining friction of MyFitnessPal and Lose It — with three natural input modes: Gemini text parsing ("2 eggs and avocado toast"), Gemini Vision photo analysis, and one-click re-log from the user's personal food library.

What makes Kalori distinctive:

- **No global food database.** Every food ever logged accrues to a personal library that grows on its own.
- **Full micronutrient tracking**, not just calories and macros.
- **A premium literary aesthetic** — "The Ledger": cream-on-near-black newsprint, Newsreader serif, oxblood signature, chronometer instead of a fitness ring, bulletin-grid meal list. The app reads as a personal journal you've been keeping for years, not a dashboard.
- **Transparent AI.** Every AI-derived number exposes its reasoning ("Why these numbers?"), and the onboarding Mifflin-St Jeor calculation is fully shown via a collapsible "How we calculated this" panel.
- **Speed-first critical flow.** Photo → logged meal in under 15 seconds median.

Built on Next.js 16 (Cache Components + PPR), React 19, Tailwind v4, shadcn/ui, Framer Motion, Recharts, Supabase (Auth + Postgres + Storage + RLS), Gemini `gemini-flash-latest`, Vercel, Sentry.

---

## 2. Product Vision & Scope

### Vision
An AI-first nutrition tracker that is as fast and quiet as a bedside notebook, as rigorous as a medical record, and as beautiful as anything in the premium-SaaS reference class (Linear, Arc, Robinhood). No ads, no social, no gamification, no cartoon mascots — per blueprint §1.

### MVP Scope (locked — per blueprint §3 "Must-Have")

| Capability | Included in MVP |
|---|---|
| Supabase Auth — magic link + Google OAuth | Yes |
| 8-step onboarding wizard with Mifflin-St Jeor math + transparency panel | Yes |
| Three-tab unified log flow (Type / Snap / Library) | Yes |
| Gemini text parsing with 30-day response cache | Yes |
| Gemini Vision with client compression + thumbnail retention | Yes |
| Confirmation screen with editable quantities + "Why these numbers?" | Yes |
| Personal food library (search / filter / sort / edit / bulk delete / merge) | Yes |
| Dashboard (calorie chronometer, macros, meal bulletin, micronutrients, water, insight) | Yes |
| Water tracker (+glass / +bottle) | Yes |
| Progress view (calorie adherence, weight trajectory, macro stacked area, micronutrient heatmap, streak calendar) | Yes |
| Weight log with weekly prompt + auto-recalc target | Yes |
| Auto / manual target override mode | Yes |
| Undo toast (5s) across all entry types | Yes |
| Weekly AI review (lazy-on-dashboard-visit, 7-day cache) | Yes |
| Data export (CSV + JSON) + hard account delete | Yes |
| PWA (manifest + service worker) + offline shell | Yes |
| Reduced-motion fallback | Yes |
| 375 / 768 / 1280+ responsive breakpoints | Yes |
| Dark mode only | Yes |
| Sentry error tracking (no perf, no session replay) | Yes |
| Gemini per-call cost logging table | Yes |

### Anti-Scope (locked — per blueprint §3)
No global food database · no exercise/workout logging · no barcode scanning · no social/sharing · no gamification beyond lightweight streak indicator · no marketing landing page · no native mobile app (PWA only) · no multi-user/household accounts · no notifications · no Apple OAuth · no command palette (⌘K) · no light mode · no third-party analytics beyond Sentry.

### Post-MVP Nice-to-Haves (per blueprint §3)
Command palette · Lottie milestone celebrations · marketing landing page (only on invite expansion) · Apple OAuth · email digests · named meal templates · light mode · multi-language (Hungarian/Vietnamese) · household accounts · exercise logging · barcode · Capacitor wrapper · Apple Health / Google Fit integration.

---

## 3. Users & Critical Flows

### Primary User (per blueprint §2)
Project owner — AI engineer based in Da Nang, Vietnam. First and only user through MVP. Uses across devices (phone at meals, laptop for weekly review). High technical literacy. High design standards. Will test the app against real Vietnamese/Asian food (bún bò, phở, cơm tấm, bánh mì, bún thịt nướng) — this is the accuracy bar.

### Secondary Users (post-MVP, invite-only)
Health-conscious adults 25–45 who've churned off mainstream trackers. Pay for quality. ~10–100 invited users at most before any public redesign.

### Three Critical Flows (per blueprint §2, success criteria §2)

| # | Flow | Success target | Failure mode |
|---|---|---|---|
| 1 | **Photo → logged meal** end-to-end | <15s median (upload → confirmation visible) | Gemini latency, image compression failure, RLS leak on save |
| 2 | **Re-log "usual breakfast"** from library | 1 tap from library, 1 confirm | Library not loading, normalized-name dedup false negative |
| 3 | **Dashboard first paint** on start of day | Fast + contentful before data fetch completes | Cache Components misconfigured, PPR partial not rendering |

### Overall Success Criteria (per blueprint §2)
- Owner uses it daily for 30 consecutive days without reverting.
- Photo-log flow <15s median.
- Gemini cost per active user per day <$0.05.
- Lighthouse performance >90 on mobile.
- Undo works reliably — zero "I lost an entry" incidents.
- RLS verified — two test users cannot read each other's rows on any table.

---

## 4. Architecture Overview

### Approach C — Hybrid (selected)

**Next.js 16 Cache Components + PPR for data-heavy screens; standard client components for interactive flows; optimistic updates on high-frequency quick-add actions.** This is the optimal tradeoff for Kalori: data screens are ideal for PPR (static shell + dynamic islands), while the log flow is inherently multi-step and interactive (Zustand is warranted).

| Screen / surface | Rendering strategy | State |
|---|---|---|
| **Landing** (`/`) | Fully static marketing content; auth-gated redirect to `/dashboard` for signed-in users via Next.js middleware at edge (`runtime = 'edge'`) | None |
| **Auth** (`/login`) | Server component shell + client form | Supabase auth SDK |
| **Onboarding wizard** (`/onboarding`) | Client component (multi-step form, inherently stateful) | Zustand (step state) + server-action save per step |
| **Dashboard** (`/`, authed) | **Cache Components + PPR** — static shell renders immediately; dashboard data (today's entries, aggregated totals, weekly-review card) is a dynamic island with `"use cache"` at appropriate boundaries | Server cache (`cacheLife`, `cacheTag`) + TanStack Query for client-side invalidation post-mutation |
| **Log Food** (`/log`) | Client components (modal / step flow) — interaction-dominant | Zustand (tab state, current draft entry, confirmation payload) |
| **Food Library** (`/library`) | Cache Components + PPR (grid is server-rendered with cached data; search/filter client-side) | Server cache + TanStack Query for mutations |
| **Food Detail** (`/library/[id]`) | Server component with client edit panel | Server fetch + TanStack Query for edits |
| **Progress** (`/progress`) | Cache Components + PPR — charts computed server-side per aggregation period | Server cache per (user, range) key |
| **Settings** (`/settings`) | Client form (dense interaction) | Server action per field + optimistic echo |
| **Weight log** (`/weight`) | Client form + server component history list | Zustand quick-add, TanStack Query for history |

### State Management Layers

| Layer | Tool | Scope | Example |
|---|---|---|---|
| Auth context | Supabase `@supabase/ssr` | Session token, user id | Propagated via middleware cookies |
| Server state / cache | Next.js 16 Cache Components (`"use cache"`, `cacheLife`, `cacheTag`, `updateTag`) | Aggregated reads (dashboard, progress, library grid) | `cacheTag(['user:${uid}:entries:${day}'])` |
| Client server-state (provisional[^tq]) | TanStack Query | Client-side invalidation after optimistic mutations | Undo toast reinserting a deleted entry |
| Ephemeral UI state | Zustand | Log-flow step, open modal, undo queue, draft payload | `useLogFlowStore`, `useUndoQueueStore` |
| Runtime / edge cache | **`ai_response_cache` DB table** (MVP) | Gemini response cache (30-day TTL), keyed by normalized text hash or image content hash | `ai_response_cache` row keyed on `{call_type, hash, user_id}`; Vercel Runtime Cache is post-MVP only |

[^tq]: TanStack Query is evaluated in Phase 3; default is Server Actions + `updateTag`. It is added only if cross-component client-cache coordination emerges as an actual need.

### Optimistic Updates — Narrow Allowlist

Optimistic updates ONLY on:
1. **Undo toast** (5s) — removal is optimistic; reinsert on undo.
2. **Log save** — entry appears immediately in meal group; server reconciles.
3. **Water / weight quick-add** — increments immediately; server reconciles.

All other mutations (library edits, settings changes, delete-past-day, merge-duplicates) are pessimistic with a brief loading state. The rationale: optimistic failure rollback is a fragile surface area; reserve it for the three highest-frequency actions where latency is felt most.

### Backend Shape

| Concern | Implementation |
|---|---|
| Next.js Route Handlers | `app/api/ai/text-parse`, `app/api/ai/vision`, `app/api/ai/weekly-review`, `app/api/export` |
| Gemini client | `lib/ai/client.ts` wraps `@google/genai` SDK; all calls server-side only |
| Supabase client | `lib/supabase/server.ts` (service role only for admin-scoped ops), `lib/supabase/client.ts` (anon, browser) |
| Storage | Supabase Storage bucket `food-thumbnails` (public-read by URL, write-restricted by RLS-aware policy) |
| RLS | Enforced on every user-owned table — see §6 and `architecture.md` |
| Cron / scheduled | **None for MVP.** Weekly review is lazy on dashboard visit, 7-day cache per user. |

### Reference File Layout (proposed for planning, final in `architecture.md`)

```
app/
  (marketing)/page.tsx                 -- public root
  (auth)/login/page.tsx
  (app)/onboarding/...
  (app)/dashboard/page.tsx             -- PPR
  (app)/log/...
  (app)/library/...
  (app)/progress/page.tsx              -- PPR
  (app)/settings/page.tsx
  (app)/weight/page.tsx
  api/ai/{text-parse,vision,weekly-review}/route.ts
  api/export/{csv,json}/route.ts

components/
  ledger/                              -- visual primitives (kicker, rule, pull-quote, drop-cap)
  nav/                                 -- sidebar, bottom-tab, top-bar, fab
  charts/                              -- chronometer ring, heatmap, macro-bar, stacked-area, trajectory-line
  log-flow/, library/, dashboard/, progress/, settings/, onboarding/, ui/ (shadcn-generated)

lib/
  ai/
    client.ts
    prompts.ts                         -- centralized system prompts (text, vision, weekly-review)
    cache.ts                           -- `ai_response_cache` DB read-through wrapper + key normalization
    cost-log.ts                        -- per-call cost recording
  cache/
    tags.ts                            -- single source of truth for cacheTag / updateTag string shape
  supabase/
  nutrition/ (mifflin-st-jeor, tdee, target calc)
  i18n/en.ts                           -- typed constants (see §12)
  stores/ (zustand)
```

`lib/cache/tags.ts` exports typed constants:

```ts
export const TAGS = {
  userEntries: (uid: string, day: string) => `user:${uid}:entries:${day}`,
  userLibrary: (uid: string) => `user:${uid}:library`,
  userProgress: (uid: string, range: string) => `user:${uid}:progress:${range}`,
} as const
```

---

## 5. Data Model Overview

High-level only. Full DDL — columns, types, FKs, indexes, RLS policies — lives in `planning/architecture.md` (next artifact).

### Core Entities

| Entity | Purpose | Key fields (abbreviated) | Relationships |
|---|---|---|---|
| `profiles` | User bio, goals, target, preferences | id (= auth.uid), bio_sex, age, height_cm, current_weight_kg, goal_weight_kg, activity_level, region, dietary_prefs[], allergens[], unit_pref, goal_pace, bmr, tdee, calorie_target, target_mode (auto\|manual), manual_override_value, timezone | 1:1 with `auth.users` |
| `food_entries` | Every logged item (text, photo, or library) | id, user_id, client_id uuid NOT NULL UNIQUE, logged_at (UTC), created_at_server (default now()), meal_category, source (text\|photo\|library), library_item_id (nullable), items jsonb[], ai_reasoning text | Belongs to profile; may point to `food_library_items` |
| `food_library_items` | Personal food library, one row per unique food | id, user_id, client_id uuid NOT NULL UNIQUE, normalized_name, display_name, default_portion, default_unit, nutrition jsonb (kcal + macros + micros), thumbnail_url, log_count, last_logged_at, user_edited_flag, created_from (text\|photo), created_at | Belongs to profile; 1:many with entries via `library_item_id` |
| `weight_log` | Weight entries | id, user_id, client_id uuid NOT NULL UNIQUE, logged_on (date, user-TZ), weight_kg, note | Belongs to profile |
| `water_log` | Water intake | id, user_id, client_id uuid NOT NULL UNIQUE, logged_on (date, user-TZ), count, unit (glass\|bottle\|ml) | Belongs to profile |
| `ai_call_log` | Per-call Gemini cost observability | id, user_id, call_type (text\|vision\|weekly-review), input_hash, input_tokens, output_tokens, cost_usd_estimate, latency_ms, cached boolean, created_at | Belongs to profile |
| `ai_response_cache` | 30-day Gemini response cache (sole MVP cache layer) | hash (PK), user_id, call_type, payload jsonb, expires_at | Belongs to profile |
| `weekly_reviews` | Cached weekly AI review | id, user_id, week_start_on, content text, generated_at, expires_at (+7d) | Belongs to profile |

### Key Invariants (see also §18)

- Every row in every user-owned table has `user_id` matching `auth.uid()` at insert (RLS `with check`).
- All timestamps stored UTC. All day boundaries for dashboard / progress aggregation computed in user's profile timezone.
- Unit storage is metric always (kg, cm, ml); display conversion to imperial happens at presentation layer per `profiles.unit_pref`.
- Normalized-name equality dedup on library save: incoming item's `normalized_name` (lowercase, strip punctuation, sort tokens, trim) is compared against existing library entries; on strict equality match, user is prompted to merge before a new row is created. Fuzzy matching is post-MVP (flagged in §19.4 remaining unknowns).
- Backfill limit: `food_entries.logged_at` ≤ now; app blocks `logged_at < now − 30d` client-side and server-side (validation middleware). Older dates are read-only.
- Photo originals are deleted from Supabase Storage immediately post-analysis; only the thumbnail (~50kb) persists on the resulting `food_library_items.thumbnail_url`.
- `weekly_reviews.expires_at = generated_at + 7d`. Dashboard visit triggers refresh only if no valid row exists.

---

## 6. Authentication & Authorization

### Auth (per blueprint §4)
- Supabase Auth.
- Methods: **email magic link + Google OAuth**. No Apple OAuth for MVP.
- Session stored in SSR-safe cookies via `@supabase/ssr`.
- Middleware (`middleware.ts`) enforces authenticated access to all routes except `/`, `/login`, `/api/auth/*`.

### Authorization
- Single role. No in-app admin UI; admin ops performed via Supabase dashboard.
- Multi-tenancy by RLS — every user-owned table has policies:
  - `select using (auth.uid() = user_id)`
  - `insert with check (auth.uid() = user_id)`
  - `update using (auth.uid() = user_id) with check (auth.uid() = user_id)`
  - `delete using (auth.uid() = user_id)`
- `ai_response_cache` and `ai_call_log` are also RLS-scoped to prevent cross-user cache poisoning or cost inference.
- Storage bucket policy: objects prefixed `{user_id}/...`; RLS-aware storage policy restricts both read and write to owning user (public-URL access is blocked — signed URL issued server-side on demand).

### Account Deletion

Hard-delete cascade. Blueprint §4 retention: indefinite while active, hard-deleted on request.

1. **Order of operations.** Client calls `/api/account/delete` → server revokes session, then:
   1. **Storage objects deleted first** — paginated list under `{user_id}/` prefix, batch-deleted with idempotent retry on transient failures.
   2. **DB rows deleted via transaction** — single transaction covers every user-owned table (FK cascades do the work).
   3. **`auth.users` row deleted last** — this guarantees Storage + DB are clean before the auth record disappears.
   4. Client is signed out.
2. **FK direction (declared in `architecture.md` DDL):** all user-owned tables have `user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE`. Exception: `food_entries.library_item_id` is `ON DELETE SET NULL` (not cascade), so a user's entry history survives library pruning even if a library item is removed.
3. **Test (I9):** integration test seeds Storage objects for user A, triggers deletion, asserts zero objects remain under `{user_id}/` prefix AND zero rows in all user-owned tables.

---

## 7. AI Integration Design

### Gemini Model
`gemini-flash-latest` via `@google/genai` SDK. Server-side only (Next.js Route Handlers). Key stored in Vercel environment variables (`GEMINI_API_KEY`).

### Three Call Types

| Call | Purpose | Input | Output | Cache key |
|---|---|---|---|---|
| **Text parse** | Parse natural-language meal description into structured items | `{text, user_region, dietary_prefs, allergens}` | `{items: [{name, portion, unit, kcal, macros, micros, confidence}], reasoning: string}` | SHA-256 of normalized text (lowercase + stripped punctuation + sorted tokens) + user_id |
| **Vision** | Identify foods in image, estimate portions | `{image_base64 (<500kb, max 1600px), user_region, dietary_prefs}` | Same shape as text parse | SHA-256 of image bytes (content hash; perceptual hash deferred post-MVP) + user_id |
| **Weekly review** | Literary-voice weekly summary (renders in its own Suspense boundary; dashboard first paint never blocks on it). **Sparse-data fallback:** if logged entries span < 3 days in the past 7, skip the Gemini call and render a static "§ THE EDITOR'S NOTE · Too little logged this week for a full review." kicker followed by a bulleted one-liner per logged day (Ledger typography: italic serif body, kicker present, drop cap absent). | `{entries[] for past 7d, aggregates}` | Markdown string (~3 paragraphs) | `weekly:{user_id}:{week_start_on}` |

### Prompt Storage
All system prompts centralized in `lib/ai/prompts.ts` — single file, typed constants, reviewed in PR. Tone directive: "literary editor, not coach" per The Ledger voice. Region + dietary prefs + allergens are injected into the text-parse and vision system prompts to improve Asian-food accuracy.

### Response Shape (validated server-side)

```ts
type ParsedItem = {
  name: string
  portion: number
  unit: string
  kcal: number
  macros: { protein_g: number; carbs_g: number; fat_g: number; fiber_g: number }
  micros: Record<string, number>   // dynamic key set, whatever Gemini returns
  confidence: number               // 0.0 – 1.0
}
type ParseResult = { items: ParsedItem[]; reasoning: string }
```

Zod schema validates every AI response before it reaches client code. Validation failure → fallback to manual entry form (see below).

### Graceful Degradation (per Round 4)
On **any** Gemini failure (network, rate limit, timeout >8s, schema validation fail), app surfaces a friendly message and opens the **manual entry form** with the original user input pre-filled. The user can still log the meal. **AI failure never blocks logging** — this is invariant I7 in §18.

### Caching Strategy (per Round 4)

MVP uses only the `ai_response_cache` DB table keyed by normalized-hash. Vercel Runtime Cache is a post-MVP optimization if cache-hit latency becomes an issue.

1. **`ai_response_cache` table** (single-tier MVP cache) — 30-day TTL, keyed by `{call_type, hash, user_id}`. Written on miss; read on every request before dispatching to Gemini.
2. **Weekly review cache** — own table (`weekly_reviews`), 7-day TTL. Lazy-generated on dashboard visit.

Cache hit on text/vision parse = zero cost, sub-second DB read. Cache miss writes to `ai_response_cache` after Gemini response is validated.

### Cost Logging (per Round 4, blueprint §3)
Every Gemini call — **including cache hits** — writes a row to `ai_call_log`. Cached calls record `cached = true` and `cost_usd_estimate = 0`, `input_tokens = 0`, `output_tokens = 0`. This preserves usage visibility: cache ratio, latency distribution, per-user cost roll-up.

Cost-logging insert is synchronous but failure-tolerant — `ai_call_log.insert` errors are caught, reported to Sentry, and DO NOT block the response. At MVP scale logging is per-request; batched inserts are post-MVP if write-hotspot emerges. Index: `(user_id, created_at DESC)`.

Invariant I2 (see §18): every AI-lookup path (including cache hits) writes exactly one `ai_call_log` row before returning to the caller — even on failure.

### Image Handling
1. Client captures/picks image.
2. `browser-image-compression` resizes to max 1600px / <500kb.
3. POST to `/api/ai/vision` as base64.
4. Server computes SHA-256 content hash → cache lookup.
5. On miss: Gemini Vision call.
6. On save-to-library: upload thumbnail (~256×256, <50kb — regenerated server-side from the received base64) to Supabase Storage under `{user_id}/`.
7. **Original discarded immediately post-analysis** — never written to Storage.

### Speed Flow (per Round 4)
No crop/rotate UI step. Client compresses, uploads, shows shimmer, renders results. Speed wins for the <15s critical target.

### Prompt Injection Mitigation

1. User text is passed as a distinct input role (Gemini parts array), never concatenated into the system message.
2. Reject or sanitize text containing role-control tokens (`<|system|>`, `SYSTEM:`, `IGNORE PRIOR`, etc.) before dispatch; stripped tokens are logged to Sentry as a breadcrumb for pattern analysis.
3. Zod schema enforces `reasoning` length cap (500 chars) and strips control characters from every string field in the parsed response.

---

## 8. UX/UI Direction — "The Ledger"

Kalori's visual system is locked to Direction 1 "The Ledger" (Editorial/Archival), selected over three alternative directions (Industrial, Cinematic, Flight-Deck Wildcard). Everything here is extracted from `Design/mockups-brainstorm/direction-1-editorial/brief.md`.

### Mood
A private evening broadsheet. Each day's meals set in type, parsed, and signed. Warm candlelit journal tone — cream on near-black, ruled columns, italic pull-quotes, a chronometer in place of a fitness ring. The model speaks as an attentive literary editor, not a coach.

### Palette (exact hex — authoritative)

| Role | Hex | Usage |
|---|---|---|
| `--bg-0` | `#0E0A08` | Page void, deep warm black with slight red cast |
| `--bg-1` | `#15100D` | Cards, editor pane |
| `--bg-2` | `#1E1815` | Insets, "Why these numbers?" panel, meter backgrounds |
| `--rule` | `#2A2320` | Standard hairline dividers |
| `--rule-strong` | `#3A3029` | Card borders, section boundaries |
| `--ivory` | `#F4EBDC` | Primary text — warm cream |
| `--sand` | `#C9BDA8` | Secondary text, italic pull-quotes |
| `--dust` | `#8A8173` | Metadata, labels |
| `--oxblood` (signature accent) | `#8A2A1F` | Chronometer consumed arc, drop caps, primary CTA, active nav state |
| `--oxblood-soft` (hover) | `#A13A2C` | Button hover, secondary accent |
| `--ember` (warm secondary) | `#C8693B` | Projections, "approaching target" state (80–100%) |
| `--ochre` (tint) | `#B8894A` | Carb bar, inner fiber arc |
| `--moss` (on-target) | `#5C6B3D` | Adherence good, micronutrient ≥ target |
| `--slate` | `#4A5764` | Neutral 4th data series |
| `--plum` | `#5D3A44` | Reserved / 5th series |

**Data viz palette (6 colors):** oxblood, ochre, ember, moss, slate, plum.
**Heatmap ramp (c0–c9):** `bg-2` → `oxblood` → `ochre` → `moss`, walking warm-to-supportive as % of target rises.
**Status colors:** approaching = ember (80–100%); over target = oxblood (>100%, or deficit used).

### Typography

| Tier | Font | Weight | Size | Notes |
|---|---|---|---|---|
| Serif display / numerals | **Newsreader** (fallback: Tiempos Display, Georgia) | 200–400, italic supported | — | Optical size enabled; tabular lining figures |
| Wordmark | Newsreader | 300 | 104px | Tracking −0.035em |
| Section titles (h1/h2 editorial) | Newsreader | 300 | 44px | Tracking −0.02em |
| Heatmap title / hero section | Newsreader | 300 | 32px | — |
| Calorie hero value | Newsreader | 300 | 82px | Tabular lining figures |
| Body serif (entries, pull-quotes) | Newsreader | 400 | 14–22px | Italics for voice |
| Sans (labels, chrome, microcopy) | **Inter** (fallback: Söhne, -apple-system) | 300–600 | — | — |
| Labels | Inter | 500 | 10.5px | UPPERCASE, tracking 0.18–0.22em |
| Nav | Inter | 500 | 11px | UPPERCASE, tracking 0.18em |
| Mono (timestamps, counts, codes) | **JetBrains Mono** (fallback: Söhne Mono, ui-monospace) | 400 | 10.5–11px | Tracking 0.02em |

All numerals tabular + lining. Drop cap used exactly once on "From the Editor" weekly review pull-quote.

### Shape Language
- **Border radius: `0` across the board.** Everything is a rule or a rectangle.
- The only circles are (1) the chronometer ring, (2) data points on charts, (3) the water bullet.
- Borders: hairline `1px` at `#2A2320` (default); stronger `1px` at `#3A3029` for card frames; dotted `1px` for sub-rows in tables.
- **No shadows.** Depth is rules + whitespace + tonal card stack (`bg-0` → `bg-1` → `bg-2`).
- Grid lines are real and visible: 3-col dashboard, 5-col meals bulletin, 4-col library, 30-col heatmap.

### Motion Philosophy
Calm and paper-like. Short (120–180ms). Soft easing `cubic-bezier(.2, .8, .2, 1)`. Cards don't lift — they "wet" a touch brighter on hover (tonal only, no scale). Numbers tick into place with a cross-fade, never a count-up. The chronometer ring draws once on load, 600ms, like ink settling. Heatmap cells fade in row-by-row on first view. Page transitions feel like turning a page, not tapping an app. `prefers-reduced-motion` → crossfades only, no transforms.

### Signature Component Vocabulary

| Component | Role |
|---|---|
| **Chronometer ring** | Replaces the stacked activity ring. Hand-drawn style with Roman hour numerals (I/IV/VII/X), now-indicator triangle, dual-layer arc: oxblood for consumed, dashed ember for projected rest of day. Center: calorie sum at 82px serif. |
| **Pull-quote / editor's note** | Weekly AI review rendered as italic serif body with oxblood drop cap on the first letter. "From the Editor." kicker label. |
| **Five-column meals bulletin** | Breakfast / Lunch / Dinner / Snacks / Drinks as five ruled newspaper columns with kickers (§ 01 BREAKFAST, § 02 LUNCH, etc.). Column rules are visible. Entries are italic serif food names + mono timestamp + oxblood kcal. |
| **Micronutrient heatmap** | "The minor elements, in thirty" — 7 nutrients × 30 days, warm ramp from oxblood (low) → ochre → moss (good). Column rules drawn. Italic serif row names. |
| **Ruled library grid** | 4-column grid on desktop, true drawn column/row lines. Each cell: thumbnail (if photo), italic serif name, mono "logged Nx" count. |
| **Kickers & section numbers** | Every major section titled like a print journal: `§ 03 · THE DAY'S ENTRIES`, `§ 07 · THE MINOR ELEMENTS`. |
| **Drop cap** | Used exactly once (weekly review pull-quote) to preserve its force. Oxblood, 3-line float. |
| **Masthead** | Wordmark "Kalori" + edition line ("No. 142 · Thursday, 18 April 2026") + hairline rule, above every page. **Edition number logic**: `edition_number = days since account creation (inclusive of today)`. Rolls over at user-TZ midnight. Computed server-side in the masthead Server Component from `profiles.created_at` + user timezone. Format: `No. {n} · {weekday}, {day} {month} {year}` (e.g., `No. 142 · Thursday, 18 April 2026`). |
| **Error states** | Inline error = `oxblood` color body text + mono `!` glyph prefix + 1px `oxblood` top rule. Full-page error = kicker `§ ERR · <Brief Label>` + italic serif description below. Form-field error = 1px `oxblood` underline + `oxblood` caption text. |

### Tone of Voice (per blueprint §5 + Ledger brief)
Confident, professional, fast. Literary rather than clinical. No cutesy, no exclamation marks, no hype. Confidence numbers look like footnotes. Weekly review reads like a nightstand journal entry.

---

## 9. Navigation System

**NEW REQUIREMENT.** Kalori ships **industry-standard responsive navigation** per breakpoint, adapted to The Ledger's visual system (oxblood active-state, Inter UPPERCASE 11px nav labels with 0.18em tracking, hairline rules instead of borders, zero radius).

### Breakpoint Strategy

| Breakpoint | Width | Primary nav pattern | Secondary access |
|---|---|---|---|
| **Mobile** | 375–767px | Bottom tab bar (4 tabs) + center FAB | Profile avatar in top bar → settings |
| **Tablet** | 768–1279px | Collapsible left sidebar (icon rail 56px, expand on hover/toggle) + top app bar | Profile avatar in top bar / sidebar bottom |
| **Desktop** | 1280px+ | Persistent left sidebar 240px with logo + labeled nav | Profile menu at sidebar bottom + top-right avatar |

### Desktop (1280+ px) — Persistent Sidebar

Desktop left sidebar chosen over top nav because Kalori's multi-surface nature (dashboard + library + progress + settings) benefits from persistent access; the sidebar stays within Ledger aesthetic via hairline rules, oxblood active state, and uppercase-tracked labels — no generic SaaS affordances leak in.

Pattern: Linear / Supabase / Notion sidebar. Sidebar width 240px, `bg-1` surface, hairline rule on right edge. Brand/wordmark at top (Newsreader 300, 24px, `ivory`). Nav items with Inter UPPERCASE 11px labels. Active state: oxblood left border (3px) + ivory text + `bg-2` fill. Lucide icons at 1.5px stroke, 18px, `dust` default → `ivory` on active.

```
┌────────────────┬────────────────────────────────────────────────────────────┐
│  KALORI        │  MASTHEAD: Kalori · No. 142 · Thu 18 April 2026            │
│  ───────────── │  ══════════════════════════════════════════════════════   │
│                │                                                             │
│  § NAVIGATION  │   § 01 · TODAY'S CHRONOMETER                               │
│                │                                                             │
│ ▌DASHBOARD     │     ┌─────────────┐    ┌───────────────────────────┐     │
│  LOG           │     │             │    │  Macros                    │     │
│  LIBRARY       │     │ chronometer │    │  Protein  124 / 180 g     │     │
│  PROGRESS      │     │    ring     │    │  Carbs    198 / 240 g     │     │
│                │     │             │    │  Fat       52 /  65 g     │     │
│                │     └─────────────┘    └───────────────────────────┘     │
│                │                                                             │
│ ── HAIRLINE ── │   § 02 · THE DAY'S ENTRIES                                 │
│                │   ┌──────┬──────┬──────┬──────┬──────┐                   │
│ ⚲ DU ◢         │   │ BKFT │ LUNCH│ DINR │ SNCK │ DRNK │                   │
│ Dev User       │   │  2 · │  3 · │  1 · │  -   │  4 · │                   │
│ dev-user@..    │   └──────┴──────┴──────┴──────┴──────┘                   │
└────────────────┴────────────────────────────────────────────────────────────┘
  240px sidebar        flex content
```

- **Brand/logo:** Top of sidebar, Newsreader "Kalori" + small oxblood dot.
- **Primary nav items:** Dashboard / Log / Library / Progress (4 items — Settings is not a primary tab).
- **Profile menu:** Bottom of sidebar — avatar + name + email (collapsed to avatar-only when sidebar in icon mode, but desktop defaults to expanded). Click → dropdown with Settings / Export data / Sign out.
- **Keyboard shortcuts:**
  - `/` — focus library search (if on library) or global quick-find
  - `n` — open new log flow
  - `g d` / `g l` / `g p` — go to dashboard / library / progress (vim-style leader)
  - `?` — open shortcuts help overlay
- **Hover:** tonal only (no scale), `bg-2` row fill.

### Tablet (768–1279 px) — Collapsible Sidebar

Pattern: icon-rail collapsed default (56px), expands to 240px on hover OR pinned-expanded via hamburger toggle in top-left of app bar. Top app bar shows current section title (Newsreader 300, 20px) + edition line + profile avatar on right.

```
┌────┬──────────────────────────────────────────────────────────────┐
│ ☰  │ § 01 · DASHBOARD          Kalori · No.142 · Thu 18 Apr  ⚲TS │
│ ── ├──────────────────────────────────────────────────────────────┤
│ ▌⊞ │                                                                │
│ ✎  │   chronometer + macros + meals (2-col stack)                  │
│ ▦  │                                                                │
│ ⁓  │                                                                │
│    │                                                                │
│ ── │                                                                │
│ TS │                                                                │
└────┴──────────────────────────────────────────────────────────────┘
 56px rail (icon-only)    flex content
```

- **Icon rail:** Dashboard / Log / Library / Progress — icons only, labels surface on hover in a tonal tooltip.
- **Active state:** oxblood left border (3px), icon color `ivory`.
- **Hamburger (top-left of app bar):** Toggles pinned-expanded sidebar to 240px with labels.
- **Top app bar:** Current section kicker (e.g., `§ 01 · DASHBOARD`), edition line, profile avatar (click → settings/export/sign out menu).
- **No bottom tab bar** at this breakpoint.

### Mobile (375–767 px) — Bottom Tab Bar + Center FAB

Pattern: iOS HIG + Material 3 standard. Bottom tab bar fixed at 56px height with 4 primary destinations. Center-positioned FAB (56×56px round — **exception to zero-radius rule, justified because it is the highest-frequency action and circular FAB is the platform-native affordance**) sits directly above the tab bar (not in a notch), positioned via `bottom: calc(56px + env(safe-area-inset-bottom) + 8px)`, triggering the Log flow.

```
┌──────────────────────────────────────────────┐
│ § 01 · DASHBOARD              ⚲ TS           │   ← top app bar (44px)
│ ════════════════════════════════════════════ │
│                                                │
│              chronometer                       │
│                                                │
│   macros · protein / carbs / fat              │
│                                                │
│   § 02 · BREAKFAST                             │
│   Two eggs, avocado toast · 08:14 · 440 kcal │
│                                                │
│   § 03 · LUNCH                                 │
│   (empty — Add)                                │
│                                                │
│                                                │
│                      ╭───╮                     │
│                      │ + │   ← FAB (56px)      │ ← FAB floats above tab bar
│                      ╰───╯                     │
│  ═════════════════════════════════════════    │
│  [⊞ DASH] [✎ LOG] [▦ LIB] [⁓ PROG]            │ ← bottom tab bar (56px)
└──────────────────────────────────────────────┘
  375px wide, single column
```

- **Bottom tab bar:** 4 tabs, 56px height, icon (1.5px stroke, 18px) + UPPERCASE Inter 10.5px label, tracking 0.18em. Active state: oxblood 2px top border on the active tab + `ivory` icon/label; inactive `dust`.
- **Center FAB:** Circular 56×56px, oxblood `#8A2A1F` fill, ivory `+` icon. **Binding placement rule:** FAB is centered horizontally, positioned `bottom: calc(56px + env(safe-area-inset-bottom) + 8px)` — directly above the tab bar, never in a notch. The 56×56px circular shape is the documented zero-radius exception from the Ledger brief (valid). Tapping it opens the Log flow modal (Type / Snap / Library tabs). **Modal stacking rule:** opening the log flow from a sub-route dismisses no state; on close, back chevron returns to the sub-route.
- **Top app bar:** 44px, current section kicker on left, profile avatar on right. Tapping avatar opens settings sheet with Settings / Export / Sign out.
- **Sub-screens** (food detail, library detail, weight log entry): slide in from right with back chevron in top app bar. Active tab stays highlighted (`g l` → library detail keeps `LIB` active). iOS/Android back gesture respected.
- **No left sidebar** at this breakpoint.

### All Breakpoints — Accessibility & Interaction Rules

- **Min tap target:** 44 × 44 px (per blueprint §9). All nav items and FAB satisfy this.
- **Focus rings:** visible 2px `ivory` outline at 2px offset on keyboard focus. Never suppressed.
- **Active-state color:** **oxblood `#8A2A1F` only** — never generic blue. Active nav signals: desktop = left oxblood border; tablet = left oxblood border on rail; mobile = oxblood top border on tab.
- **Sub-routes highlight their parent tab:** `/library/[id]` → `LIBRARY` stays active. `/weight` → accessed from dashboard / settings — no top-level tab; breadcrumb via back chevron.
- **Keyboard shortcuts (desktop / tablet):** `/` search, `n` new log, `g d/l/p` go-to, `?` help overlay.
- **`prefers-reduced-motion`:** no slide transitions on sub-screens; fade only.
- **WCAG AA contrast:** `ivory` on `bg-0` = ~14:1 (passes AAA). `dust` on `bg-0` = ~4.8:1 (passes AA for normal text ≥14px). `oxblood` active border is paired with text-color change, never color-alone.

### Component Responsibilities

| Component | File | Breakpoints | Responsibility |
|---|---|---|---|
| `<Sidebar />` | `components/nav/sidebar.tsx` | Tablet, Desktop | Renders primary nav + profile menu. Collapsible on tablet. |
| `<BottomTabBar />` | `components/nav/bottom-tab-bar.tsx` | Mobile | 4 primary tabs + highlights active route. |
| `<LogFAB />` | `components/nav/log-fab.tsx` | Mobile | Circular oxblood button; opens log flow modal. |
| `<TopAppBar />` | `components/nav/top-app-bar.tsx` | Mobile, Tablet | Section kicker + edition line + profile avatar. |
| `<ProfileMenu />` | `components/nav/profile-menu.tsx` | All | Dropdown/sheet: Settings / Export / Sign out. |
| `<ShortcutsOverlay />` | `components/nav/shortcuts-overlay.tsx` | Desktop, Tablet | Triggered by `?`, lists all keyboard shortcuts. |

> **Note:** ASCII sketches above use box-drawing characters. This markdown file is the canonical source; if any downstream tool renders these incorrectly, refer back to `Planning/design-doc.md`.

---

## 10. Screens Inventory

Ten screens. Each below: **purpose**, **key components**, **responsive behavior**. Full visual specs in the Ledger brief; full interaction specs extend into `ui-design.md`.

### 10.1 Landing (`/`, unauthed)
- **Purpose:** Minimal public root — app name + sign-in CTA. Per blueprint §3, no marketing content.
- **Components:** Masthead (wordmark + tagline "A record of what you eat, kept like a journal"). Two CTAs: "Sign in with Google", "Email me a magic link". Hairline rule below.
- **Responsive:** Single column all breakpoints. Full-viewport vertical centering on mobile.

### 10.2 Auth (`/login`)
- **Purpose:** Sign-in. Magic link + Google OAuth.
- **Components:** Email input (Inter, zero-radius), magic link CTA, divider, Google OAuth button.
- **Responsive:** Centered card on desktop / tablet. Full-screen on mobile.

### 10.3 Onboarding Wizard (`/onboarding`)
- **Purpose:** 8 sequential steps (per Round 5). All fields editable later in Settings.
- **Steps:** (1) bio sex, (2) age, (3) height, (4) current weight, (5) goal weight (delta shown real-time), (6) timeline/pace (Relaxed / Steady / Aggressive, each with calculated target date), (7) activity level (4 options), (8) results screen with Mifflin-St Jeor target + BMR/TDEE/macro split + "How we calculated this" expandable panel + "Start tracking" CTA.
- **Components:** Progress bar (oxblood fill on `bg-2` track), step title (Newsreader 300, 32px), step body, `Back` / `Next` buttons. Unit toggles on height/weight (metric default).
- **Responsive:** Full-screen centered card all breakpoints. Same step progression; layout adapts width.

### 10.4 Dashboard (`/`, authed) — Primary Screen
- **Purpose:** At-a-glance day. Hero screen; most visual investment.
- **Components:**
  - Masthead (wordmark + edition line + hairline)
  - **Chronometer ring** (center, replaces fitness ring): calorie sum at 82px, Roman hour numerals, dual-arc (oxblood consumed + dashed ember projection)
  - **Macro bars:** three thin horizontal bars (protein / carbs / fat) — current/target grams + mono % in tracking
  - **Five-column meals bulletin:** Breakfast / Lunch / Dinner / Snacks / Drinks, each with its kicker, entries as italic serif names + mono timestamps + oxblood kcal
  - **Micronutrient panel:** right column on desktop, card row on mobile. Shows union of micronutrients present in user's last 7 days of entries, sorted: protein > iron > vitamin D > vitamin C > calcium > fiber > rest alphabetical. Max 10 visible; overflow in a "More" disclosure. Priority constant at `lib/nutrition/display-micros.ts`.
  - **Water tracker:** single-row `water bullet` with +glass / +bottle affordances
  - **Weekly insight card (pull-quote):** italic serif body with oxblood drop cap. Generated lazily; 7-day cache. Renders as a PPR dynamic island with its own Suspense boundary and skeleton; dashboard first paint never blocks on its Gemini call.
  - **Target-updated nudge card** (only when auto-recalc fired)
  - **Copy-yesterday (binding behavior):** Copies each entry to today with `logged_at = now()`, preserving `meal_category`. Shows confirm modal: "Copy N entries from yesterday to today?". User can multi-select subset. Merges into today (does not replace); creates new `food_entries` rows with new `client_id`s.
- **Responsive:**
  - Desktop 1280+: 3-column (sidebar / center content / right micronutrient panel)
  - Tablet 768–1279: 2-column (center + right panel becomes a tab above meals)
  - Mobile 375–767: single column. Chronometer → macros → meals → horizontally-scrolling micronutrient card row → water → insight card.
- **Rendering:** PPR shell + Cache Components for data islands. TanStack Query invalidates `user:${uid}:entries:${day}` tag on log mutation.

### 10.5 Log Food (`/log`) — Three-Tab Unified Flow
- **Purpose:** One flow with three input modes, shared confirmation screen.
- **Tabs:**
  1. **Type it:** Multiline serif input (blueprint placeholder: "What did you eat? e.g. '2 eggs and avocado toast'"). Real-time AI chip previews debounced. Optional time + meal category. Submit → confirmation.
  2. **Snap it:** Desktop drag-drop zone + "Browse"; mobile camera + gallery buttons. Compression → upload → shimmer → detected-items cards. "Why these numbers?" expandable panel. No crop/rotate step (per Round 4).
  3. **From library:** Search + frequency-first grid; sort toggle (Frequent / Recent / Highest-protein); multi-select batch-add; inline quantity stepper.
- **Confirmation screen (shared):** Item list (editable portion + unit + kcal + macros + micros), total sum, meal category selector, time editor, "Save to library" toggle (default on), normalized-name equality dedup prompt if an entry with the same normalized name already exists, Confirm CTA.
- **Fallback:** AI failure → manual entry form pre-filled with original text.
- **Responsive:** Modal/sheet pattern at all breakpoints. Desktop: side-sheet from right (640px). Mobile: full-sheet from bottom. FAB on mobile / `n` shortcut on desktop opens it.

### 10.6 Food Library (`/library`)
- **Purpose:** Browse / search / edit all foods ever logged (substitute for global DB).
- **Components:** Search bar (`/` focus shortcut), filter pills (All / Most frequent / Recent / Highest protein), sort dropdown (Frequency / Last used / Alphabetical), **ruled grid** (zero radius, drawn column/row lines, thumbnail + italic serif name + mono "logged Nx"), bulk-select mode with Delete / Merge actions.
- **Merge duplicates (binding spec):** Merge repoints `food_entries.library_item_id` FK from loser row to winner, then deletes loser. UI: side-by-side compare of fields; user chooses per-field values; save creates a single row matching selections. Cannot be undone (confirm dialog required). Logged to Sentry breadcrumb for audit.
- **Thumbnail placeholder (text-sourced items):** When an item has no photo (`thumbnail_url` is null), the grid cell renders a letter-mark placeholder — first letter of `display_name` in Newsreader 300 weight, 48px, `dust` color, on `bg-2` surface, centered in the card's thumbnail area.
- **Responsive:** Desktop 4-col, tablet 3-col, mobile 2-col.

### 10.7 Food Detail (`/library/[id]`)
- **Purpose:** Full nutrition breakdown + edit + log-now.
- **Components:** Hero thumbnail (if photo), editable name (italic serif), default portion + unit picker, full nutrition table (kcal, macros, all micronutrients), "Logged X times" with mini-sparkline, `Log now` CTA, Edit / Delete actions.
- **Responsive:** Desktop: right-side overlay panel on dashboard/library (shared-element transition). Mobile: full-screen with back chevron.

### 10.8 Progress (`/progress`)
- **Purpose:** Day / Week / Month analytics.
- **Components:** Top segmented control (D / W / M). Sections:
  - **§ 05 · Calorie adherence:** bar chart, target line, adherence cells colored oxblood (over) / moss (on) / ember (approaching)
  - **§ 06 · Weight trajectory:** line chart with dots (logged), smoothed trend, horizontal goal line, dashed ember projection
  - **§ 07 · Macro distribution:** stacked area (oxblood/ochre/moss = protein/carbs/fat)
  - **§ 08 · Micronutrient heatmap** (signature): 7 nutrients × 30 days, warm ramp
  - **§ 09 · Logging consistency calendar:** GitHub-style squares
- **Responsive:** Desktop 2-col; mobile single column, simplified chart axes.
- **Rendering:** PPR + Cache Components keyed by `(user, range)`.

### 10.9 Settings (`/settings`)
- **Purpose:** Grouped list per blueprint §6.9.
- **Groups:** Profile · Goals (target mode auto/manual, manual override value) · Preferences (units, dietary prefs, allergens, region, timezone) · Data (export CSV / export JSON) · Account (sign out, hard delete with double-confirm).
- **Target mode transitions (binding rule):** Switching `target_mode` from `manual` → `auto` triggers immediate recalc from current weight AND fires the dashboard nudge card. Switching `auto` → `manual` copies current auto-calculated target into `manual_override_value` (no nudge). Unit test covers both transitions.
- **Export schema:** Produces a ZIP with two files: `kalori-export-{userId}-{date}.csv` (flat food_entries + weight_log + water_log, one row per entry, ISO 8601 timestamps in UTC + user TZ column) and `kalori-export-{userId}-{date}.json` (nested profile + library + entries + logs, with schema version v1). Full column list deferred to `architecture.md`.
- **Responsive:** Single-column list all breakpoints. Groups separated by hairline + kicker.

### 10.10 Weight Log (`/weight`)
- **Purpose:** Quick weight entry + history.
- **Components:** Number input (unit-aware), date picker (today-default; 30-day backfill allowed), note field (optional), Save CTA. History list below: mono date + serif weight + delta chip.
- **Responsive:** Single column all breakpoints. Accessible from dashboard nudge + settings + profile menu.

---

## 11. State Management Strategy

Decision matrix for where state lives.

| State | Tool | Rationale |
|---|---|---|
| Auth session | `@supabase/ssr` middleware + cookies | SSR-safe, propagates to server components |
| Profile (user bio, goals) | Server component fetch + `updateTag(['profile:${uid}'])` on mutate | Read-mostly, changes rarely |
| Today's entries, aggregates | **Cache Components** (`cacheLife('minutes')`, `cacheTag(['user:${uid}:entries:${day}'])`) | Data-heavy read, fast invalidation |
| Library grid | Cache Components + `cacheTag(['user:${uid}:library'])` | Same |
| Progress aggregates | Cache Components + `cacheTag(['user:${uid}:progress:${range}'])` | Same; per-range key |
| Log-flow draft (step, tab, text, parsed items) | **Zustand** `useLogFlowStore` with `sessionStorage` persistence | Persists draft to `sessionStorage` on every state change (throttled 500ms); cleared on Confirm or explicit Cancel. Restore on tab reopen if within 30 minutes. Excludes large image blobs (image re-upload required after session restart — acceptable per blueprint's <15s photo-log target). |
| Undo queue | **Zustand** `useUndoQueueStore` | Ephemeral; must outlive the deleted entry for 5s. Toasts display in **LIFO order** — most recent delete shows first. Undo always restores the item whose toast is currently visible. Queue cleared on route navigation. |
| Modal/sheet open state | **Zustand** `useUIStore` | Ephemeral |
| Post-mutation cache coordination (provisional) | **TanStack Query** — provisional | Evaluated in Phase 3; default is Server Actions + `updateTag`. Added only if cross-component client-cache coordination emerges. |
| Gemini response cache | **`ai_response_cache` DB table** (MVP single-tier) | Cross-request durable; Runtime Cache post-MVP |
| Weekly review cache | `weekly_reviews` table + in-memory read | Per-user, 7-day TTL |

Decision principle: **server caches the truth, Zustand holds the fleeting, TanStack Query bridges mutations**. Never duplicate server state into Zustand.

---

## 12. Internationalization

### MVP: English only, i18n-ready structure (per Round 8)

- **Strategy:** typed constants object in `lib/i18n/en.ts`.
- **Shape:**

```ts
// lib/i18n/en.ts
export const t = {
  nav: {
    dashboard: 'Dashboard',
    log: 'Log',
    library: 'Library',
    progress: 'Progress',
    settings: 'Settings',
  },
  dashboard: {
    todayKicker: '§ 01 · TODAY',
    mealsKicker: '§ 02 · THE DAY\'S ENTRIES',
    addEmpty: '+ Add',
    targetUpdated: 'Target updated to {kcal} kcal · see why',
  },
  log: {
    typePlaceholder: 'What did you eat? e.g. \'2 eggs and avocado toast\'',
    whyNumbers: 'Why these numbers?',
    saveToLibrary: 'Save to library',
    confirmCTA: 'Confirm',
    aiFailureFallback: 'Couldn\'t reach the editor. Enter manually?',
  },
  // ... etc
} as const

export type TranslationKey = keyof typeof t
```

- **Usage:** `t.nav.dashboard`. Compile-time safe. No runtime lookup cost.
- **All user-facing copy** routed through this file. No inline string literals in components (enforced by ESLint custom rule `no-inline-user-strings`).

### Migration Path (post-MVP, deferred to 2nd language: Hungarian or Vietnamese)

When a second language is added:
1. Install `next-intl`.
2. Move `lib/i18n/en.ts` into `lib/i18n/messages/en.ts`; add `hu.ts` / `vi.ts` with identical shape.
3. Replace direct imports with `useTranslations` hook.
4. The typed-constants shape matches `next-intl`'s nested-keys API, so migration is mechanical.

**Not done in MVP.** Owner uses English; deferring the library saves bundle size and avoids half-wired i18n infrastructure.

---

## 13. Testing Strategy

Per Round 6 + Round 8. **TDD mandatory per `~/.claude/rules/testing.md` — no production code without a failing test first.** Coverage % is not a gate; mutation evidence (behavior-complete tests) is.

### Test Matrix

| Layer | Tool | Scope | Gate |
|---|---|---|---|
| **Unit** | Vitest | Nutrition math (Mifflin-St Jeor, TDEE, target calc), cache-key normalization (text + image hash), date/timezone day-boundary math, unit conversion, normalized-name equality dedup algorithm, Zod schema validation | **Blocking CI** |
| **Component** | Vitest + React Testing Library | Chronometer ring renders correct arc length, macro bars render correct fill, meal bulletin renders entries, confirmation form editable quantities, undo toast timing (5s), keyboard shortcut dispatch; optimistic-update rollback tests (water +glass, weight quick-add, undo restore on server error) | **Blocking CI** |
| **Integration** | Vitest + Mock Service Worker (MSW) | Log flow end-to-end in-process (type → parse → save → dashboard update), cache hit/miss paths, AI failure → manual fallback, optimistic update + rollback on server error, target auto-recalc on weight change; cache-tag invalidation — every mutation path's `updateTag` call is exercised; subsequent read returns fresh data | **Blocking CI** |
| **RLS** | Playwright (two-user test) | Create two real Supabase test users. For each of the 8 user-owned tables (profiles, food_entries, food_library_items, weight_log, water_log, ai_call_log, ai_response_cache, weekly_reviews) × 4 verbs (select user-B's row, insert with mismatched user_id, update user-B's row, delete user-B's row) = **32 assertions minimum**. Plus a separate CI lint check forbidding imports of the service-role key from anywhere under `app/` or client code paths. Storage bucket covered by matched prefix RLS policy tests. Run on every CI build. | **Blocking CI** |
| **E2E (happy paths)** | Playwright | 10 flows (blueprint's 4 + Round 6 additions): (1) onboarding completion, (2) text-log + dashboard update, (3) photo-log + dashboard update, (4) RLS isolation, (5) water quick-add, (6) weight log entry, (7) library edit, (8) undo toast restores deletion, (9) copy-yesterday, (10) settings profile edit. `@axe-core/playwright` runs on every E2E. | **Blocking CI** |
| **Accessibility** | `@axe-core/playwright` | Injected into every E2E. Fails on any serious or critical violation. | **Blocking CI** (inside E2E) |
| **Visual regression** | Playwright screenshot snapshots | **6 highest-signal screens** (Landing, Dashboard, Log confirmation, Library, Progress, Weight log) × 3 breakpoints = 18 baselines, git-tracked. Tolerance 0.1% pixel diff. Other screens covered by E2E snapshots on demand. | **Advisory** (warns, doesn't block — prevents flake-blocked releases) |
| **Lighthouse** | Lighthouse CI | Mobile performance, accessibility, best-practices, SEO on Dashboard + Log + Library + Progress. Target: perf >90 mobile. | **Advisory** |
| **AI accuracy regression** | Vitest snapshot tests (mocked Gemini) | 10 fixture photos (5 Vietnamese: bún bò, phở, cơm tấm, bánh mì, bún thịt nướng; 5 Western) + 10 fixture text prompts. Asserts parsed item names match dictionary + kcal within ±15%. Runs against mocked Gemini responses (deterministic snapshots). Manual review required before shipping if a snapshot deviates. | **Advisory** |

### Test Data / Fixtures (per Round 7)
- Seed fixture JSON at `fixtures/seed-14-days.json` — 14 days of realistic entries (Vietnamese + Western foods mixed) + sample library items + weight history.
- Seed script at `scripts/seed.ts` — clears current user's data and loads fixture via Supabase client.

### What's NOT Tested (accepted gaps)
- Load / stress testing — single-digit users make it premature.
- Browser compatibility beyond last-2 Chrome/Safari/Firefox/Edge — Playwright default matrix.
- Penetration testing — RLS isolation test covers the main threat model; formal pentest deferred to post-MVP invite expansion.

---

## 14. PWA & Offline Strategy

### Manifest (per blueprint §3)
- `public/manifest.json`: name "Kalori", short_name "Kalori", theme_color `#0E0A08`, background_color `#0E0A08`, display `standalone`, orientation `portrait`, icons 192/512/maskable.
- Installable on iOS (home screen), Android (install prompt), desktop (Chromium install).

### Service Worker
- Next.js PWA plugin (e.g., `@serwist/next`). Cache strategy: network-first for `/api/*`, stale-while-revalidate for static assets, cache-first for images (thumbnails).
- **Cache-bust on deploy:** Next.js build hash included in SW version string (per blueprint §11 mitigation).

### Offline Behavior (per Round 5)
| Capability | Online | Offline |
|---|---|---|
| Read today's dashboard | Live data | IndexedDB cache (last-synced) |
| Log via Type it (AI) | Works | Disabled — friendly message |
| Log via Snap it (AI) | Works | Disabled — friendly message |
| Log via Library (no AI) | Works | **Works** — writes to IndexedDB outbox, syncs on reconnect |
| View library | Live | IndexedDB cache |
| Edit profile | Works | Disabled |
| Weekly review | Works | Read from cache if present |
| Undo toast | Works | Works (Zustand only) |

**IndexedDB cache layer:**
- Powered by `idb-keyval` or similar. Key per entity: `library`, `entries:${day}`, `profile`, `weekly-review:${week}`.
- On app load, hydrate Zustand/TanStack Query from IDB; background-sync to server.
- Outbox pattern for offline mutations: pending writes queued in `idb` outbox, flushed sequentially on reconnect with conflict-resolution rule "client wins on last-write-wins except profile.goal_weight changes, which require user confirmation".
- **IDB unavailable fallback:** If IndexedDB is unavailable (Safari private mode, user storage wipe, incognito), skip the caching layer entirely. Online-only mode with a one-time informational toast "Offline support unavailable in this browser." App continues to function online.
- **Clock-drift correction on sync:** If `logged_at` > 24h in the future OR > 30 days in the past, flag entry for user review (dashboard nudge card). Server also records `created_at_server` (default `now()`) alongside client `logged_at`; analytics prefer `created_at_server` when `logged_at` looks suspect.

---

## 15. Performance & Accessibility Targets

### Performance
| Metric | Target |
|---|---|
| Lighthouse Mobile Performance | >90 (blocking advisory in CI) |
| First contentful paint (dashboard, cached cold) | <1.5s on 4G |
| Photo-log critical flow (end-to-end) | <15s median |
| Bundle size (JS, initial) | <200KB gzipped main route |
| Image sizes | <500KB original capture, ~50KB thumbnail |

**Cold-start latency (Vercel free/hobby):** first request after idle can add 500ms–1.5s before server response. Accepted as MVP constraint for single-digit users. Mitigation: Vercel Edge Functions or Pro tier if cold starts impact critical flow #3 (dashboard first paint); revisit in Phase 5 polish.

### Accessibility (WCAG AA, per blueprint §9)
- Every color pair passes AA at its used text size. `ivory`/`bg-0` = AAA; `dust`/`bg-0` = AA for ≥14px text.
- Min tap target **44 × 44 px** on mobile (bottom tab, FAB, all buttons).
- Visible focus rings on every interactive element — 2px `ivory` outline, 2px offset. Never suppressed.
- `prefers-reduced-motion` → crossfades only; ring draws as fade-in, no arc sweep; no horizontal slide transitions.
- Every icon has `aria-label` or visible text label.
- No color-only state signaling — oxblood active nav is paired with text-weight change; red "over budget" is paired with an `aria-label`.
- Charts have text-alternative data tables via `<details>` drawer (screen readers).
- Keyboard navigation: tab order follows visual order; skip-to-content link above masthead.

---

## 16. Observability & Error Tracking

### Sentry (per Round 8)
- **Errors only.** No performance monitoring, no session replay, no profiling for MVP (cost + noise).
- `@sentry/nextjs` SDK with `beforeSend` filter stripping user PII (food entries, weight) — only stack traces + request metadata.
- Environment-scoped: `KALORI_ENV=production` / `preview` / `development`.
- Alerts: Sentry project → email to owner on any new issue in production.

### Gemini Cost Logging Table (per blueprint §3 + Round 4)

Schema (full in `architecture.md`):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `user_id` | uuid FK | RLS-scoped |
| `call_type` | enum | `text` / `vision` / `weekly-review` |
| `input_hash` | text | SHA-256 |
| `input_tokens` | int | 0 if cached |
| `output_tokens` | int | 0 if cached |
| `cost_usd_estimate` | numeric(10,6) | 0 if cached; computed from Gemini pricing |
| `latency_ms` | int | Time from request initiation to response received |
| `cached` | bool | |
| `created_at` | timestamptz | |

Derived views (served by `app/api/ai/stats` admin route, auth-restricted to owner):
- Daily cost per user
- Cache hit ratio per call_type
- p50 / p95 latency per call_type
- Running monthly cost total

**No enforcement cap for MVP** (per Round 4). Cost observability first; cap added post-MVP only if data justifies.

---

## 17. Phasing & Delivery

### 5 Phases (per Round 7, linear)

| Phase | Scope | Deliverable | First-usable? |
|---|---|---|---|
| **Phase 1 — Foundation** | Next.js 16 project, Tailwind v4, shadcn/ui init, Supabase project, env pipeline, CI setup, Ledger design tokens, Framer Motion + Recharts + JetBrains Mono + Newsreader + Inter loaded | Repo deploys to Vercel; empty landing page renders with masthead | No |
| **Phase 2 — Auth + Onboarding** | Magic link + Google OAuth via Supabase, RLS policies on `profiles`, 8-step wizard, Mifflin-St Jeor math in `lib/nutrition`, "How we calculated this" panel | Can sign up, complete onboarding, land on empty dashboard | No |
| **Phase 3 — Dashboard + Log Flow** | Chronometer ring, macro bars, meals bulletin, Gemini text-parse + vision routes, `ai_response_cache` DB table + read-through wrapper, `food_entries` + `food_library_items` tables + RLS (including `client_id` idempotency column), client_id enforcement in mutation endpoints, confirmation screen, AI failure fallback, undo toast, water tracker, copy-yesterday | **User can log + see dashboard.** | **Yes — first-usable milestone** |
| **Phase 4 — Library + Progress** | Library grid/list with search/filter/sort/edit/bulk-delete/merge, normalized-name equality dedup on save, Progress view (all 5 chart sections), weight log, auto-recalc target, target-updated nudge card, weekly AI review lazy generation + 7-day cache | Full MVP UI functionality | Yes |
| **Phase 5 — Polish + PWA** | PWA manifest + service worker + IndexedDB offline layer, reduced-motion fallback, visual regression baselines, Lighthouse tuning, Sentry wiring, export CSV/JSON, hard account delete | Shippable MVP | Yes |

### Environments (per Round 7)
- **Dev:** Local (`pnpm dev`) against dev Supabase project.
- **Preview:** Every PR gets a Vercel preview deploy against dev Supabase project.
- **Production:** `main` branch auto-deploys to Vercel production against production Supabase project.
- **No staging.** PR preview deploys serve the pre-prod smoke-test role.

### Seed Data (per Round 7)
Dev and preview environments run `pnpm seed` to load 14 days of realistic entries for the logged-in dev user — guarantees dashboard has visible content on first dev run, guarantees chart screens render with enough data to eyeball.

---

## 18. Failure-First Analysis

### 18.1 Top 10 Failure Modes

| # | Name | Scenario | Likelihood | Impact | Mitigation | Detection |
|---|---|---|---|---|---|---|
| **F1** | RLS policy gap on a newly added table | Engineer adds a table without `enable row level security` or without a `with check` on insert; user B can read user A's data | Medium | **Critical** | CI Playwright RLS test covers every user-owned table in the schema; schema-diff check blocks PR if new public table lacks RLS | Test failure; Sentry "permission denied" absence anomaly |
| **F2** | Gemini timeout / rate-limit during photo log | User on weak network; Gemini takes >8s to first byte or >30s total, or returns 429 | High | Medium | 8s to first byte; 30s total round-trip; on either boundary, fallback to manual entry with original text pre-filled; critical-flow target not missed because user can still log | Sentry error, ai_call_log latency p95, user-visible fallback UI |
| **F3** | Optimistic update lies: server reject after UI showed success | Delete action UI-removes an entry; server rejects (e.g., constraint violation, RLS conflict); undo state stale | Low | High | Undo queue keyed on client-generated temp id → server success returns real id → queue re-keyed; server reject → entry re-inserts + toast "couldn't delete" + undo queue cleared for that item | TanStack Query onError callback; Sentry; Playwright integration test |
| **F4** | Weekly review serves stale content after user's week rolls over | Dashboard loaded on Monday morning; last review generated Sunday covers prior week; cache still valid until next Sunday | Medium | Low | `weekly_reviews.week_start_on` + `expires_at` check: dashboard fetch returns current week; if none, triggers lazy generation; 7-day cache is scoped per `week_start_on` | Integration test: set clock forward, assert new review generated |
| **F5** | Timezone day-boundary bug | User in Da Nang (UTC+7) logs meal at 00:15 local; stored UTC (previous day 17:15); dashboard shows it on wrong day | Medium | Medium | `profiles.timezone` set at onboarding; aggregation queries compute `(logged_at AT TIME ZONE profiles.timezone)::date`; Vitest suite covers edge cases at midnight across all common offsets | Unit tests for UTC+7, UTC-12, UTC+13, DST transitions |
| **F6** | Undo toast expires before Zustand state persists across nav | User deletes entry, navigates away within 5s; undo state lost | Medium | Medium | Undo queue lives in Zustand `useUndoQueueStore` with explicit "clear on unmount of toast component only"; navigation doesn't clear queue; queue persists for 5s timer regardless of route | Playwright E2E: delete + navigate + undo button in new route |
| **F7** | Photo upload silently drops in slow network, user thinks it worked | Client sends base64, connection stalls, no response | Medium | Medium | Shares F2 timeout boundaries (8s first-byte, 30s total); retry once with exponential backoff, then surface "could not upload, try again or enter manually" | Sentry transaction absence, ai_call_log gap, user error state |
| **F8** | Gemini cache poisoning across users via shared hash | If hash key omits user_id, user A's cached response served to user B — leaks region/dietary inference | Low | **Critical** | Every cache key includes `user_id` in the composite key: `{call_type}:{hash}:{user_id}`. RLS on `ai_response_cache` prevents cross-user reads. Both required. | Unit test on cache-key generator; RLS isolation test |
| **F9** | Auto-recalc target surprises user who didn't want it | Weight drops, target auto-recalcs, user confused about new number | Low | Low | Blueprint decision: dashboard nudge card "Target updated to X kcal · see why" fires on every auto-recalc, explaining calc change. Manual override mode locks target. | Visual — nudge card. Settings toggle visible. |
| **F10** | Offline outbox sync conflicts — client edits library entry while also edited on another device/session | Two sessions edit the same `food_library_items` row | Low | Medium | Last-write-wins for library edits (owner is single user across devices, but conceivably edits in two tabs); profile.goal_weight change requires user confirmation on sync conflict (higher stakes) | Integration test for offline outbox replay; Sentry anomaly |
| **F11** | Prompt injection | User text contains role-control tokens (`<|system|>`, `SYSTEM:`, `IGNORE PRIOR`, etc.) attempting to override the AI's behavior | Low | Medium | Role-separated input (Gemini parts array) + token sanitization before dispatch + output schema strict parse (Zod) — see §7 "Prompt Injection Mitigation" | Sentry alert on Zod parse failure rate spike; Sentry breadcrumb log for sanitized tokens |
| **F12** | Auth session expired mid-mutation | Access token expires during in-flight POST | Medium | Medium | `@supabase/ssr` cookie refresh middleware + 401-response interceptor retries once after refresh; cross-tab sign-out via `BroadcastChannel` invalidates session in all open tabs | Sentry error on post-refresh failure; integration test: force token expiry mid-mutation, assert retry succeeds |

### 18.2 Invariants

Things that must **ALWAYS** be true. Each has a test that enforces it.

| # | Invariant | Enforcement |
|---|---|---|
| **I1** | Every row in `food_entries`, `food_library_items`, `weight_log`, `water_log`, `ai_call_log`, `ai_response_cache`, `weekly_reviews` has `user_id = auth.uid()` at insert | RLS `with check` policy + Playwright RLS test |
| **I2** | Every AI-lookup path (including cache hits) writes exactly one `ai_call_log` row before returning — including errors | Integration test wrapping route handler; `finally` block in client wrapper |
| **I3** | Photo originals are never persisted to Supabase Storage | Code review + integration test asserts no non-thumbnail upload to `food-thumbnails` bucket |
| **I4** | Undo toast queue persists for full 5s after delete regardless of route changes | Playwright E2E: delete, navigate, click undo, assert entry restored |
| **I5** | Day boundaries for dashboard / progress aggregation are computed in user's profile timezone | Vitest unit tests for day-boundary math |
| **I6** | Unit storage is always metric; display conversion at presentation layer only | Lint rule + Vitest: any write to `*_kg` / `*_cm` / `*_ml` with imperial unit is a type error |
| **I7** | AI failure never blocks logging — fallback to manual entry form | Integration test: mock Gemini failure, assert manual form opens with input preserved |
| **I8** | Backfill ≥ 30 days is blocked both client-side and server-side | Zod validator on insert + client date picker disabled for older dates |
| **I9** | Account deletion cascades all user data + Storage objects | Integration test: seed, delete, assert zero rows across all tables + zero Storage objects under user prefix |
| **I10** | Every Gemini response is Zod-validated before touching client code | Type-safe AI client wrapper; failure → fallback |
| **I11** | Every client-initiated write carries a client-generated UUID (`client_id`); server enforces uniqueness; replays return 200 no-op | `UNIQUE` constraint on `client_id` per table; integration test asserts duplicate POST with same `client_id` returns 200 without creating new row |
| **I12** | All `cacheTag` and `updateTag` calls use `lib/cache/tags.ts` constants | ESLint rule `no-restricted-syntax` forbids string-literal arguments to `cacheTag` / `updateTag`; CI fails on violation |

### 18.3 Adversarial Reviews

#### Paranoid Staff Engineer — "What's the bug lurking here? What breaks at 3 AM?"

The RLS isolation test is the linchpin, and it's fragile in two ways I'd audit. First: the test creates two users and asserts cross-reads fail, but it must also assert cross-writes fail — an `update` or `delete` with a mismatched `user_id` can succeed if the RLS policy is only `select using` and not also `update using` / `delete using`. I'd require the test to exercise all four verbs on every user-owned table. Second: the test uses the anon key; any accidental use of the service-role key anywhere in application code bypasses RLS entirely. A lint rule or grep-test in CI should forbid the service-role key from being imported into any `app/` file.

The undo queue has a specific 3 AM scenario: user deletes an entry at 23:59:58, a midnight-rollover cron would re-aggregate dashboard totals, and if the undo fires at 00:00:03 the re-insert needs to land in the **original** day's bucket (based on its original `logged_at`), not "today". Because we store `logged_at` UTC and aggregate in user TZ, this works — but the test must cover it. Similarly, rapid consecutive deletes generate a stacked undo queue: the UI shows one toast at a time, but the queue is FIFO; if the user clicks undo mid-queue, which item restores? Blueprint §11 mitigation says "queue multiple undos; each toast handles one entry" — that needs to be an explicit spec: "undo always restores the item whose toast is currently visible; toasts reveal in LIFO order (most-recent delete shows first)." Write it down in `ui-design.md`.

Cache invalidation is the other 3 AM hazard. Cache Components' `cacheTag(['user:${uid}:entries:${day}'])` is invalidated by `updateTag` after a mutation — but only if the mutation path reliably calls `updateTag` with the exact same tag shape. A typo (`'user:${uid}:entry:${day}'` — singular) causes silent staleness: user logs a meal, dashboard doesn't refresh, user thinks app is broken, logs again, now has a duplicate. **Mitigation:** tag constants in a single module `lib/cache/tags.ts`, imported everywhere; compile-time constant protects against typos. Integration test covers log → dashboard-update round-trip.

Finally: offline outbox replay can double-insert. If the service worker replays a POST that in fact succeeded (the server wrote the row but the response never reached the client), the retry creates a duplicate. **Mitigation:** every client-initiated write carries a client-generated UUID (`entry_client_id`) stored with a unique constraint on the server; replay with the same UUID is a no-op returning 200. This has to be designed in from Phase 3; retrofitting is painful.

#### Over-Engineering Reviewer — "Where is this gold-plated or speculative?"

The Vercel Runtime Cache + DB fallback layer for Gemini responses is borderline. Vercel Runtime Cache is ephemeral per-region, so losing a region loses the cache — fine for cost but not for user-experienced correctness. Adding `ai_response_cache` as a durable backup is reasonable, but two-tier caching for MVP with single-digit users is over-engineered. **Simpler:** just the DB table. Write to it on miss, read from it first. Skip Runtime Cache. Add it later if perf suffers. The complexity tax is real: cache consistency between the two layers, invalidation across both, dev-time confusion. Recommend: either Runtime Cache OR `ai_response_cache`, not both, in MVP. The brief already specifies both — I'd push back in implementation.

The IndexedDB offline layer with outbox + conflict resolution is classic gold-plating for MVP. The owner is one user, on one or two devices, and offline is rare (Vietnam has solid mobile data). The blueprint says offline read + manual-entry write. An outbox with last-write-wins + profile-goal-conflict-confirm is three tiers of cleverness. **Simpler MVP:** offline read from IDB cache, disable all mutations offline (even library-based log), show friendly message. Sync is a future problem. The blueprint's Round 5 decision for library-based log to work offline is questionable — it adds outbox + replay logic for a flow users hit rarely in true offline. Defer.

TanStack Query alongside Cache Components + Zustand is one state layer too many. Cache Components is the server-state cache now; TanStack Query was the previous-generation answer for the same problem. The doc says "TanStack Query sparingly for client components needing cache coordination." That's code for "sometimes we'll duplicate state across layers." **Alternative:** rely on Next.js `updateTag` + Server Actions for mutations; skip TanStack Query entirely. Reach for it only if a specific screen demonstrates a coordination gap. Evaluate in Phase 3 — if not needed, drop it. Reduces bundle, reduces confusion about where cache truth lives.

Finally: 30 baseline visual regression snapshots (10 screens × 3 breakpoints) is ambitious for a single-maintainer project. They will go stale, block PRs, and get rubber-stamped. **Recommendation:** advisory-only (already the plan), and trim to the 6 highest-signal screens: dashboard, log confirmation, library grid, progress heatmap, onboarding results, settings. Re-evaluate after 3 months of use.

#### Under-Specification Reviewer — "What decisions are missing that implementation will have to make ad-hoc?"

**Fuzzy-match dedup algorithm.** The spec says "fuzzy-match on normalized name → prompt merge if match," but "fuzzy" isn't defined. Levenshtein? Jaro-Winkler? Token-set similarity? Threshold? If the user types "two eggs" today and "2 eggs" tomorrow, do those dedupe? What if they type "scrambled eggs" — does it match "eggs"? **Needs:** an explicit definition in `architecture.md` — e.g., "normalized name = lowercase + strip punctuation + sort tokens; dedup match = exact normalized-string equality; no fuzzy fallback in MVP." Anything more sophisticated is post-MVP.

**Manual-override target & subsequent weight changes.** Blueprint says `target_mode = manual` locks target against auto-recalc. What happens if the user later switches back to `auto`? Does it recalc from current weight immediately, or only on next weight entry? **Unspecified.** Suggest: switching to auto triggers immediate recalc + dashboard nudge card.

**Copy-yesterday edge cases.** If yesterday has 7 entries across 3 meal groups and today already has 2 entries, does copy merge or replace? Does it copy timestamps (which won't make sense in today's context) or strip them? **Unspecified.** Suggest: copy all entries, place each at "now" with original meal category, show a confirmation "Copy 7 entries from yesterday?"

**Weekly review tone when data is sparse.** If user logged 2 days out of 7, what does "From the Editor" say? A literary editor still writes, but with less material. Need a fallback prompt path that produces a coherent short note without hallucinating data. **Needs:** explicit prompt instruction + at least one fixture test case.

**Merge duplicates UX.** Library detail "merge" action — which is source-of-truth after merge? All log history pointing to the absorbed item must repoint to the surviving item (FK cascade update, not cascade delete). How are differing nutrition numbers reconciled? **Unspecified.** Suggest: UI shows side-by-side, user picks which values to keep per field, cheaper rows are then FK-reassigned and the loser deleted.

**Library thumbnail source when item is created via text input (no photo).** No photo exists → thumbnail_url is null → library cards show what? A placeholder? A letter mark? **Needs:** spec — letter mark in serif on `bg-2` with `dust` text, matching Ledger aesthetic.

**AI-generated micronutrient set is non-deterministic.** Gemini might return vitamin A for eggs one day and not the next. How does the dashboard decide which micros to show in the panel? **Suggest:** union of (user's seven-day trailing) micros, always sorted by protein > iron > vitamin D > rest. Explicit set in `lib/nutrition/display-micros.ts`.

**Export CSV schema.** What columns? What rows — flat entries, or joined with library? **Unspecified.** Suggest: two CSVs in zip — `entries.csv` (flat, one row per logged item) and `library.csv` (one row per library item). JSON export is the full database dump (one user's subset).

**Error state styling in Ledger aesthetic.** Error banners / inline errors don't have a brief spec. Oxblood might imply error but it's also the signature accent. **Suggest:** inline errors use `--over` (`#A13A2C`) text + small mono "!" glyph; full-page error uses a kicker `§ ERR` + explanation in italic serif.

---

## 19. Decision Summary

### 19.1 What Was Chosen and Why (Round-by-Round, Condensed)

| Source | Decision | Rationale (one-line) |
|---|---|---|
| 1 | Complex tier (7 planning artifacts) | Data-heavy app + RLS + AI integration + responsive design demands full artifact set |
| 1 | Blueprint is canonical spec | Pre-written, owner-approved, single source of product truth |
| 1 | 4 fresh mockup directions generated; Direction 1 "The Ledger" selected | Ledger's literary editorial tone uniquely matches owner's "earn a place on the nightstand" goal |
| 2 | Ledger palette: oxblood `#8A2A1F` on warm black `#0E0A08` | Signature distinct from lime/cyan fitness palettes; flatters evening use |
| 2 | Newsreader serif + Inter sans + JetBrains Mono | Editorial rigor + chrome legibility + mono for timestamps/codes |
| 3 | Full DDL lives in `architecture.md` (not this design doc) | Separation of concerns; design doc is decisions, architecture doc is schema |
| 3 | Metric units stored always, display-converted for imperial users | Single source of truth prevents unit-confusion bugs |
| 3 | Normalized-name equality dedup on library save | Prevents library sprawl from minor phrasing variants (fuzzy matching deferred post-MVP) |
| 4 | Graceful degradation: AI failure → manual entry form | Never block the critical flow on a dependency |
| 4 | Weekly review: lazy generation + 7-day cache | Simplest implementation; no cron infrastructure |
| 4 | Photo: client-compress to <500kb → immediate send, no crop step | Speed wins for <15s critical target |
| 4 | Per-call Gemini cost logging, no enforcement cap | Observability first, policy later |
| 5 | Offline: IDB read + manual-entry write; AI flows disabled | Safe degradation; owner on solid mobile data anyway |
| 5 | Onboarding: 8 sequential steps, all editable later in Settings | Zero-pressure first-run; correction is always possible |
| 5 | Timezone: UTC stored, user TZ for day boundaries | Standard correct pattern |
| 5 | Backfill: 30-day window; older is read-only | Prevents arbitrary historical rewrites |
| 6 | TDD mandatory (per `~/.claude/rules/testing.md`); no coverage % | Mutation evidence > coverage theater |
| 6 | E2E: 10 flows incl. RLS two-user test; @axe on every E2E | Isolation + accessibility are non-negotiable |
| 6 | Visual regression: 10 × 3 = 30 baselines git-tracked (advisory) | Catches regressions without blocking releases |
| 7 | 5 phases linear; first-usable at end of Phase 3 | Earliest validation on critical flow |
| 7 | Dev: local; Preview: Vercel PR; Prod: `main`. No staging. | Simplest CI/CD for single-maintainer |
| 7 | 14-day seed fixture + `pnpm seed` script | First-run dashboard has content |
| 8 | i18n: typed constants in `lib/i18n/en.ts`; next-intl deferred | Saves bundle; zero-friction migration when 2nd lang added |
| 8 | CI blocking: TS + ESLint + Unit + Integration + E2E. Visual / a11y / Lighthouse advisory. | Blocks correctness, not polish |
| 8 | Sentry errors-only (no perf, no session replay) | Cost + signal-to-noise for MVP scale |
| 8 | Next.js 16 + Cache Components + PPR (upgrade from blueprint's "15+") | Current stable; PPR is ideal for data-heavy dashboard |
| Arch | Approach C — Hybrid (Cache Components + client islands + optimistic on 3 surfaces) | Best fit for mixed read-heavy + interaction-heavy screen set |
| Nav | Sidebar desktop / collapsible rail tablet / bottom tab + FAB mobile | Industry-standard pattern per breakpoint, Ledger-styled |

### 19.2 Short-Term Path (MVP + First 3 Months of Owner Use)

- Ship MVP per Phase 5 completion.
- Owner uses daily across phone (mostly at meals) + laptop (weekly review).
- Active instrumentation to watch: `ai_call_log` daily cost + latency p95, photo-log end-to-end p50, undo-toast "couldn't delete" frequency, dashboard p75 time-to-interactive.
- 30-day milestone: success criterion is owner using daily without reverting.
- 90-day milestone: Vietnamese food accuracy assessment. If region-tuned prompts underperform, iterate in `lib/ai/prompts.ts`.

### 19.3 Long-Term Path (Post-MVP — per Blueprint §3 Nice-to-Haves)

**Trigger for opening beyond owner:** 30 consecutive days of solo use + owner-decided invitation.

| Milestone | Unlocks |
|---|---|
| Owner + 5 invited friends | Command palette (⌘K), streak/milestone Lottie celebrations |
| 10–50 invited | Email digest notifications, named meal templates, Apple OAuth |
| 50–100 invited | Light mode, Hungarian + Vietnamese locales (via migration path in §12) |
| If user demand | Household / shared accounts, barcode scanning, Apple Health / Google Fit |
| Long-tail explorations | Exercise logging (requires schema expansion), Capacitor wrapper, marketing landing page |

Cost model review triggers at any point AI cost per daily-active user exceeds $0.10 (2× current target of $0.05). Enforcement cap added then.

### 19.4 Remaining Unknowns (Deferred to Implementation or Future Brainstorm)

| Topic | Resolution path |
|---|---|
| Exact Tailwind v4 CSS custom property mapping of Ledger palette | Implementation — Phase 1 Foundation task |
| Supabase vs. Vercel environment variable split | Implementation — standard Next.js pattern, no design decision |
| Exact folder structure (proposal above is non-binding) | `architecture.md` task proposes; first Phase 1 PR finalizes |
| Gemini Vision portion-estimation ground-truth acceptance | Manual accuracy pass on Vietnamese foods before Phase 5 close |
| Fuzzy-match threshold details (see §18.3) | Per Under-Spec review — lock to exact normalized-string equality for MVP |
| Merge-duplicates UX interaction details | Task spec in Phase 4 |
| Export CSV / JSON exact schema | Task spec in Phase 5 |
| TanStack Query inclusion | Decide in Phase 3 based on actual client-state coordination needs. Default is to skip it (Server Actions + `updateTag` only). |
| **Next.js 16 stability (Cache Components API)** | Upgrade from blueprint's "15+" to 16 is a risk accepted for PPR + Cache Components wins. Fallback plan: if Cache Components API breaks in a minor release, revert data-fetching to explicit `cache()` wrappers (Next.js 15-compatible pattern) without losing Approach C's structure. |

### 19.5 Follow-Up Questions (For Next Brainstorm Session, if any)

1. When owner invites first external user, does region-prompt customization need a UI to change region mid-use, or is onboarding-only sufficient?
2. At what user count (if any) does the cost log graduate from owner-visible stats page to a daily email report?
3. Is there appetite for a lightweight "print the year as a book" export path, given the Ledger aesthetic invites it?
4. Does the chronometer ring need variants for stage-of-day (morning/noon/evening) or is one arc set enough?
5. Vietnamese locale — should Vietnamese food names render in serif italic (current default) or a Vietnamese-appropriate type pair?

### 19.6 Dependency Mapping

```
Phase 1 (Foundation)
  └─▶ Design tokens locked, fonts loaded, Next.js 16 PPR proven in landing page
         │
         ▼
Phase 2 (Auth + Onboarding)
  ├─▶ RLS pattern proven on `profiles` (template for every subsequent table)
  └─▶ Mifflin-St Jeor + TDEE + target calc library in `lib/nutrition` (used by dashboard + weight log)
         │
         ▼
Phase 3 (Dashboard + Log Flow) ◀── FIRST-USABLE MILESTONE
  ├─▶ Cache Components + `updateTag` pattern proven on dashboard (template for Progress)
  ├─▶ Gemini client + prompts + `ai_response_cache` DB layer + cost log all proven
  ├─▶ Undo queue pattern in Zustand proven (template for library delete, weight delete)
  ├─▶ AI fallback to manual form proven
  └─▶ Optimistic update pattern proven on water quick-add (template for weight quick-add)
         │
         ▼
Phase 4 (Library + Progress)
  ├─▶ Library grid reuses Cache Components pattern from Phase 3
  ├─▶ Progress charts require 7+ days of data — seed fixture covers this, but real-user data accretes during testing
  ├─▶ Weight log auto-recalc integrates Phase 2's Mifflin-St Jeor
  └─▶ Weekly AI review reuses Phase 3's Gemini client + cache pattern
         │
         ▼
Phase 5 (Polish + PWA)
  ├─▶ Service worker + IDB cache layer depends on all fetch paths being stable (thus last)
  ├─▶ Visual regression baselines depend on final UI having settled (thus last)
  └─▶ Export CSV/JSON + account delete depend on every table existing (thus last)
```

**Critical dependencies:**
- **Cache Components + PPR patterns must be proven in Phase 3 Dashboard** before Phase 4 Progress relies on them. Phase 3's first dashboard story is effectively a spike.
- **RLS pattern proven in Phase 2 on `profiles`** is the template for every user-owned table added in Phases 3–5. Any RLS policy inconsistency here propagates.
- **`lib/ai/prompts.ts` + cost logging + `ai_response_cache` DB layer proven in Phase 3** are preconditions for Phase 4's weekly review.
- **`planning/architecture.md` must be written before Phase 3 begins** (defines all tables, FKs, RLS policies used across Phases 3–5).

### Lessons Applied

Four lessons from `~/.claude/lessonlearned.md` shaped this design — the sections embodying each:

- **"i18n from day 1"** → §12 (typed constants in `lib/i18n/en.ts`, library-ready shape; zero runtime i18n dependency for MVP).
- **"Silent data loss is always a bug"** → Invariant I7 (AI failure never blocks logging) + §7 graceful-degradation fallback design.
- **"Plans specify contracts not primitives"** → §7 AI integration (Zod response schema = contract over implementation primitive; storage choice deferred to architecture.md).
- **"Test the consumer, not the producer"** → §13 E2E tests exercise the UI the user sees (downstream consumer), not internal totalCalories fields or intermediate state.

---

## Section Completeness Check

All 19 required sections present:
1. Executive Summary — present
2. Product Vision & Scope — present
3. Users & Critical Flows — present
4. Architecture Overview — present
5. Data Model Overview — present
6. Authentication & Authorization — present
7. AI Integration Design — present
8. UX/UI Direction "The Ledger" — present
9. Navigation System — present (includes ASCII sketches for desktop, tablet, mobile)
10. Screens Inventory — present (all 10 screens)
11. State Management Strategy — present
12. Internationalization — present
13. Testing Strategy — present
14. PWA & Offline Strategy — present
15. Performance & Accessibility Targets — present
16. Observability & Error Tracking — present
17. Phasing & Delivery — present
18. Failure-First Analysis — present (10 failure modes, 10 invariants, 3 adversarial reviews)
19. Decision Summary — present (6 subsections)

Ready for Plan Quality Review and Codex adversarial review.
