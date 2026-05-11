# Kalori — Product Requirements Document

> **Project:** Kalori — AI-first calorie and nutrition tracker
> **Type:** Progressive Web App (dark-only, single-user, invite-only)
> **Status:** MVP requirements, locked after brainstorm + 2-round Codex review
> **Source authorities:**
> - `Planning/kalori-project-blueprint.md` — product spec, anti-scope, risks
> - `Planning/design-doc.md` — canonical design, invariants, failure modes
> - `Planning/tasks.md` — 26-task implementation plan + acceptance criteria
> - `Planning/architecture.md` — full DDL, route map, RLS policies *(created next in artifact sequence)*
> - `Planning/ui-design.md` — The Ledger component specs, responsive nav, motion *(created next in artifact sequence)*

---

## 1. Overview

Kalori is a dark-only, AI-first nutrition tracker that replaces global food-database search with three unified logging modes — natural-language parsing, photo recognition, and a personal food library that grows from everything the user logs. Built for a health-conscious single owner (a Da Nang-based AI engineer) who wants premium visual craft and Vietnamese-food accuracy that mainstream trackers cannot deliver, Kalori renders a dashboard of the day's eating as a printed ledger — a masthead, a chronometer ring, a meals bulletin, and a micronutrient heatmap — while a Gemini Flash model handles parse / vision / weekly-review duties behind server-only Route Handlers. MVP scope is locked to a single authenticated user per account, no notifications, no social, no barcode, no exercise; long-term post-MVP expansion into small invite cohorts is the scalability ceiling.

---

## 2. User Personas

### Primary User — Tamas (project owner, only MVP user)

| Attribute | Value |
|---|---|
| Role | AI engineer, based in Da Nang, Vietnam |
| Devices | Phone during meals, laptop for weekly review |
| Technical literacy | High |
| Design standard | Premium-SaaS reference class (Linear, Arc, Robinhood) |
| Real accuracy bar | Vietnamese / Asian cuisine — bún bò, phở, cơm tấm, bánh mì, bún thịt nướng |
| Success signal | Uses Kalori daily for 30 consecutive days without reverting to MyFitnessPal / Lose It |

**Primary use case — Vietnamese nutrition accuracy.** Tamas eats locally; most meals are regional Vietnamese dishes not represented well in Western food databases. The app must handle these as first-class citizens, not as exceptions. A typical day: photo of a bowl of bún bò for breakfast → Gemini Vision identifies the dish + estimates the portion + returns kcal/macros/micros with reasoning ("beef broth, rice noodles, ~2 oz beef slices, ~1 oz rare tendon, herbs, lime"). User confirms on a minimal confirmation screen, library saves the dish for one-tap re-log tomorrow. Western staples (eggs, toast, avocado) must also work, but the ranking of accuracy test priority is Vietnamese-first.

**Cross-device expectation.** Phone (375px) for meal logging, laptop (1280+) for weekly review. Tablet support (768px) is nice-to-have, never primary. The app must be equally fast on touch and keyboard.

**Tolerance profile.** Zero tolerance for: silent data loss, ad-bloat, cutesy tone, cartoon mascots, fitness-app tropes. Low tolerance for: latency over 15s on photo-log flow, dashboard first-paint blocked by AI calls, cross-user data leakage. Accepted MVP limitations: dark-mode-only (no light mode option), PWA-only (no native app), English-only (no i18n), invite-only cohort.

### Secondary Users (Post-MVP, Invite-Only)

Health-conscious adults 25–45 who have churned off mainstream trackers and pay for quality. Architecture supports 10–100 invited users; anything beyond that requires redesign of the Gemini cost model (per blueprint §11). **No MVP work optimizes for secondary users**; they are documented here only to constrain architectural choices (RLS enforced on every table from day one, AI cache keyed per-user, Gemini cost logged per-call — see Invariants I1, I2, F8).

---

## 3. Core Features (MVP)

Fourteen core features cover the entire "Yes" column of the blueprint MVP matrix (§3). Each entry below lists **Goal**, **User Flow**, **Data Model Implication** (tables touched), **Invariant Reference** (I1–I12 where relevant, failure modes F1–F12 where load-bearing), and a **Cross-reference** to `tasks.md` for the full acceptance criteria. Detailed component specs are in `ui-design.md`; full DDL is in `architecture.md`.

---

### 3.1 Onboarding Wizard (8-step)

**Goal.** Convert an unauthenticated visitor into a user with a complete bio profile and a personalized daily calorie target, computed transparently via Mifflin-St Jeor BMR → TDEE → target, in under 3 minutes.

**User Flow.**
1. Visitor lands at `/`, clicks "Sign in with Google" or "Email me a magic link."
2. After first authentication, redirect to `/onboarding`.
3. Eight sequential steps (all fields editable later in Settings):
   1. Bio sex
   2. Age
   3. Height (metric default, imperial toggle)
   4. Current weight
   5. Goal weight (delta shown real-time)
   6. Timeline pace — Relaxed / Steady / Aggressive, each with calculated target date
   7. Activity level (4 options)
   8. Results screen — Mifflin-St Jeor target + BMR/TDEE/macro split + "How we calculated this" expandable transparency panel + "Start tracking" CTA.
4. Step changes persist to `profiles` server-side (one row per user, keyed on `auth.uid()`).
5. On completion, redirect to `/dashboard`.

**Data Model Implication.** Writes/updates `profiles` (bio_sex, age, height_cm, current_weight_kg, goal_weight_kg, activity_level, region, dietary_prefs[], allergens[], unit_pref, goal_pace, bmr, tdee, calorie_target, target_mode=auto, timezone). Creates the user's first row in any user-owned table.

**Invariant Reference.**
- **I1** — profiles RLS active: user can only read/write their own row.
- **I5** — Mifflin-St Jeor math is pure functions with unit tests.
- **I6** — Auth required for `/onboarding`; only `/`, `/login`, `/auth/callback` are unauthenticated.
- **F5** — Timezone captured at step 7 / results; all day-boundary aggregations downstream use this.

**Cross-reference to tasks.md.** Task 2.1 (auth flows + profiles table + RLS + middleware + Mifflin-St Jeor + target calc) establishes the math and profile write path; Task 2.2 (8-step onboarding wizard with transparency panel) ships the wizard UI.

---

### 3.2 Text Log (Gemini Parse)

**Goal.** Let the user log food by typing a natural-language description ("2 eggs and avocado toast" or "tô bún bò nhỏ"), have Gemini parse it into structured items with calories / macros / micronutrients, and surface the result on a confirmation screen within ~2 seconds on a cache hit.

**User Flow.**
1. User taps the FAB (mobile) or presses `n` (desktop/tablet) → log flow modal opens on the "Type it" tab.
2. User types a multiline serif input; optional time + meal category.
3. On submit, client POSTs `/api/ai/text-parse` → server normalizes input (lowercase, strip punctuation, sort tokens), checks `ai_response_cache` by hash, either returns cached payload OR calls Gemini Flash, validates with Zod, writes to `ai_call_log` (failure-tolerant), and responds with parsed items.
4. User lands on the shared confirmation screen (§3.5) — editable portions, editable per-item nutrition, save-to-library toggle (default on), Confirm CTA.
5. Confirm writes one `food_entries` row (`source = 'text'`, `client_id` UUID generated client-side).
6. Modal dismisses; dashboard reflects the new entry optimistically.

**Data Model Implication.** Reads/writes `ai_response_cache` (normalized-hash PK, 30-day TTL, per-user). Writes `ai_call_log` on every call (including cache hits). Writes `food_entries` (one row, `items[]` JSONB with parsed structure, `ai_reasoning` text capped at 500 chars). May write `food_library_items` if toggle is on AND normalized-name dedup doesn't match existing.

**Invariant Reference.**
- **I2** — every AI lookup writes `ai_call_log` (failure-tolerant — Sentry on error, never blocks response).
- **I3** — Gemini API key server-only; never in client bundle.
- **I7** — AI failure never blocks logging; fallback to manual entry form pre-filled with original text.
- **I10** — AI response shape strictly Zod-validated before persistence.
- **I11** — client-generated `client_id` UUID on the entry; server enforces uniqueness; replays return 200 no-op.
- **F2** — Gemini timeout/rate-limit handled (8s warning, 30s fallback-to-manual boundary).
- **F8** — cache key includes `user_id` to prevent cross-user cache poisoning.
- **F11** — prompt injection mitigated: role-separated parts array (never concat into system message), role-control token sanitization, Zod reasoning cap 500 chars + control-char strip.
- **F12** — auth session refresh-and-retry interceptor wraps the fetch; forced-401 integration test `log-flow-text-parse-refresh.test.ts` verifies.

**Vietnamese-first requirement.** Prompts must explicitly guide Gemini to recognize Vietnamese dish names (region field from `profiles` fed into system prompt). Critical-tier AI accuracy fixtures include bún bò, phở, cơm tấm, bánh mì, bún thịt nướng; regression failures are merge-blocking (see §6 Success Metrics, §9 Acceptance Criteria).

**Cross-reference to tasks.md.** Task 3.2 (Gemini Route Handlers + prompts + Zod + cache + cost log + F11 mitigation) owns the AI pipeline; Task 3.3 (3-tab log flow modal) owns the Type-it UX; Task 3.4 (confirmation screen + client_id mutations) owns the save path.

---

### 3.3 Photo Log (Gemini Vision)

**Goal.** Let the user snap or upload a meal photo and have Gemini Vision identify the dishes + estimate portions, with the photo-to-confirmation-visible flow completing in <15s median — the critical-flow target from blueprint §2.

**User Flow.**
1. User opens log flow → "Snap it" tab.
2. Desktop: drag-drop zone + "Browse" button. Mobile: "Take photo" (camera) + "Choose from gallery" buttons.
3. Client-side compression (`browser-image-compression`): target <500kb, max 1600px, JPEG quality tuned to preserve dish detail.
4. Upload compressed image to Supabase Storage bucket `food-thumbnails` under `{userId}/{entryId}/original.jpg`.
5. Server calls `/api/ai/vision` with the Storage path → Gemini Vision identifies items, estimates portions (median-value strategy per `lib/nutrition/portion-medians.ts`), returns structured items with per-item confidence + reasoning.
6. **Immediately after Gemini returns**, server deletes the original image from Storage (I4) and generates a <50kb thumbnail that persists on the resulting library entry.
7. User sees shimmer → detected-items cards with "Why these numbers?" expandable panel.
8. User lands on confirmation screen (shared with text-log).

**Data Model Implication.** Temporary write to Storage `food-thumbnails` bucket (original, deleted within seconds). Persistent write: thumbnail (<50kb) on `food_library_items.thumbnail_url` if save-to-library is on. Writes `food_entries` (source = 'photo', items[] JSONB, ai_reasoning, client_id). Writes `ai_call_log` (call_type = 'vision'). Writes `ai_response_cache` keyed on image content hash (30-day TTL).

**Invariant Reference.**
- **I3** — Gemini Vision API key server-only.
- **I4** — photo originals deleted immediately after analysis; only thumbnails <50kb persist.
- **I7** — vision failure never blocks logging; fallback to manual entry.
- **I10** — Zod validation on vision response.
- **I11** — `client_id` UUID contract on the entry and any new library row.
- **F2, F7** — Gemini timeout + photo-upload-silently-drops mitigations (retry logic, optimistic "still analyzing" state).
- **F11** — same prompt-injection mitigations as text-parse.
- **F12** — refresh-interceptor wraps upload + analyze calls; test `log-flow-vision-refresh.test.ts` verifies.

**Vietnamese-first requirement.** Photo-log is the flagship accuracy path for Vietnamese food — photos of regional dishes must identify correctly and return plausible nutrition. 5-Vietnamese critical-tier fixture photos gate every Phase 3 merge (see §6 Success Metrics).

**Cross-reference to tasks.md.** Task 3.2 (AI pipeline + prompts), Task 3.3 (Snap-it UX + compression + fallback), Task 3.4 (save path), Task 5.4 (tiered AI accuracy gate — critical-tier merge-blocking).

---

### 3.4 Library Log (Saved Items)

**Goal.** Let the user re-log a previously-eaten food in 1 tap + 1 confirm from their personal library — the "re-log usual breakfast" critical flow from blueprint §2.

**User Flow.**
1. User opens log flow → "From library" tab.
2. Grid renders their library items, frequency-sorted by default (most-logged first).
3. Sort toggle: Frequent / Recent / Highest-protein.
4. Search bar focuses on `/` keypress; filter pills (All / Most frequent / Recent / Highest protein).
5. User multi-selects one or more items (tap), adjusts quantity with inline stepper, taps "Add selected."
6. Confirmation screen renders with pre-filled items — user confirms meal category + time → saves.
7. Each library-log write bumps `food_library_items.log_count`, updates `last_logged_at`, and creates a new `food_entries` row with `source = 'library'` and `library_item_id` FK.

**Data Model Implication.** Reads `food_library_items` (normalized_name indexed for search). Writes `food_entries` (source = 'library', library_item_id FK, items[] from library's nutrition profile). Updates `food_library_items.log_count` and `last_logged_at`.

**Invariant Reference.**
- **I1** — library + entries RLS by user_id.
- **I7** — library load never blocks logging; empty library on first use = library tab shows empty state, user uses Type or Snap instead.
- **I11** — `client_id` on every entry write.
- **F12** — save path wrapped by refresh-interceptor.

**FK survival on library prune.** `food_entries.library_item_id` uses `ON DELETE SET NULL` so that historical entries survive when a library item is deleted or merged (per `02-pre-plan.md` data model note).

**Cross-reference to tasks.md.** Task 3.1 (library schema), Task 3.3 (Library tab UI), Task 4.1 (library grid + search + filter + sort).

---

### 3.5 Confirmation Screen with "Why These Numbers?"

**Goal.** Give the user a single unified confirmation surface across all three logging modes — Type, Snap, Library — where quantities / nutrition / meal category / time are fully editable, AI reasoning is transparent, and a save-to-library toggle governs library growth.

**User Flow.**
1. User lands on confirmation after Type, Snap, or Library flow.
2. Screen shows:
   - Item list with editable portion + unit + kcal + macros + micronutrients
   - Total sum (tabular-lining figures)
   - Meal category selector (Breakfast / Lunch / Dinner / Snacks / Drinks)
   - Time editor (defaults to now; backfill allowed up to 30 days per blueprint §9)
   - **"Why these numbers?" expandable panel** exposing Gemini's reasoning (for Type + Snap only — Library items source from stored nutrition)
   - **Save-to-library toggle** (default ON)
   - **Normalized-name equality dedup prompt** — if the item's normalized name matches an existing library entry, user is prompted to merge (reuse existing row) or create new
3. Confirm CTA → writes `food_entries` (+ potentially new/updated `food_library_items`) → closes modal → dashboard updates optimistically.

**Data Model Implication.** Same as the logging mode that preceded it (Text / Photo / Library → see §3.2, §3.3, §3.4). The dedup prompt reads/matches `food_library_items.normalized_name` (indexed).

**Invariant Reference.**
- **I7** — fallback to manual entry form if AI pipeline failed; form is this same confirmation screen with empty AI reasoning.
- **I10** — Zod validation enforces that `ai_reasoning` is ≤500 chars and stripped of control characters (F11 length cap).
- **I11** — `client_id` UUID generated client-side before the POST; server enforces UNIQUE.

**Vietnamese-first requirement.** The "Why these numbers?" panel is the accuracy trust surface. For Vietnamese dishes, Gemini's reasoning text ("bowl of bún bò ~400g, beef broth with rice noodles, ~2oz beef slices, fish sauce, herbs, lime") is the user's signal that the parse was plausible. Reasoning text must handle Vietnamese dish names and ingredient vocabulary.

**Cross-reference to tasks.md.** Task 3.4 (confirmation screen with dedup prompt + save-to-library + client_id mutations).

---

### 3.6 Dashboard (Chronometer, Macros, Meals, Water, Micros, Insight)

**Goal.** Present the day's eating as a printed ledger at a glance — calorie progress, macro split, meal bulletin, water, micronutrients, and a weekly AI insight — with fast first paint that never blocks on AI.

**User Flow.**
1. Authenticated user visits `/dashboard`.
2. **Static shell renders immediately** (masthead, grid rules, section kickers) via Next.js 16 PPR.
3. **Cache Components fill dynamic islands**: chronometer ring (today's kcal), macro bars, meals bulletin (5 columns — Breakfast/Lunch/Dinner/Snacks/Drinks), water tracker, micronutrient panel, weekly insight card (its own Suspense boundary).
4. Weekly insight card renders lazy — if no valid `weekly_reviews` row exists for the user's current week-start, the island shows a skeleton while Gemini generates. Dashboard first paint never blocks on this.
5. Target-updated nudge card appears only when an auto-recalc fired since the last dashboard visit.
6. "Copy yesterday" shortcut copies each yesterday's entry to today with `logged_at = now()`, preserving `meal_category`. Confirm modal allows multi-select subset. Merges (not replaces) into today.

**Components per design-doc §10.4.**
- Masthead (wordmark + edition line + hairline rule)
- Chronometer ring (center, 82px calorie sum, Roman hour numerals, dual-arc oxblood/ember)
- Three thin horizontal macro bars (protein / carbs / fat, current/target grams + mono %)
- Five-column meals bulletin (italic serif names + mono timestamps + oxblood kcal)
- Micronutrient panel — union of micronutrients from last 7 days, sorted: protein > iron > vitamin D > vitamin C > calcium > fiber > rest alphabetical, max 10 visible
- Water tracker (single-row `water bullet` with +glass / +bottle affordances)
- Weekly insight card (pull-quote, italic serif, oxblood drop cap) — PPR dynamic island
- Target-updated nudge card (conditional)

**Data Model Implication.** Reads `food_entries` (today, user TZ), `water_log` (today), `weekly_reviews` (current week), `profiles` (target, nudge state). Writes `profiles.last_dashboard_visit_at` on visit. On "Copy yesterday", creates new `food_entries` rows with new `client_id`s.

**Invariant Reference.**
- **I1** — RLS on all reads.
- **I6** — `/dashboard` requires auth.
- **I11** — copy-yesterday writes carry new `client_id`s each.
- **I12** — all `cacheTag` / `updateTag` calls use `lib/cache/tags.ts` constants (`TAGS.userEntries(uid, day)`, `TAGS.weeklyReview(uid, weekStartOn)`).
- **F5** — day-boundary aggregation uses `profiles.timezone`, not server TZ.
- **F12** — copy-yesterday mutation wrapped by refresh-interceptor.

**Rendering strategy.** Next.js 16 Cache Components + PPR. Static shell + dynamic islands. `cacheLife` on per-day entries; `updateTag` on any mutation. Weekly insight island has an independent Suspense boundary + skeleton so Gemini cold-starts don't delay first paint.

**Cross-reference to tasks.md.** Task 3.5 (dashboard — masthead, chronometer, macros, meals bulletin, water, micronutrient panel).

---

### 3.7 Water Tracker (+Glass / +Bottle)

**Goal.** First-class daily water-intake metric with frictionless quick-add — the second optimistic-UX surface in the 3-surface allowlist.

**User Flow.**
1. Water bullet renders on dashboard (single row, positioned per `design-doc §10.4`).
2. User taps "+glass" or "+bottle" → count increments optimistically immediately.
3. Server reconciles (POST `/api/water/log` with `client_id`).
4. On server error, rollback increment + show toast.

**Data Model Implication.** Writes `water_log` (one row per entry, `unit` = glass | bottle | ml, `logged_on` in user TZ date). Updates daily tally on dashboard read.

**Invariant Reference.**
- **I1** — water_log RLS.
- **I11** — `client_id` UUID per write; server enforces UNIQUE so rapid double-taps don't double-insert.
- **F3** — optimistic-update rollback test asserts UI unwinds on server error.

**Optimistic allowlist membership.** Water + weight share the "quick-add" optimistic category per `02-pre-plan.md` architecture section (3 categories: undo toast, log-save, water/weight quick-add).

**Cross-reference to tasks.md.** Task 3.5 (water tracker component on dashboard).

---

### 3.8 Progress View (5 Chart Sections)

**Goal.** Give the user analytic insight across D / W / M timescales — calorie adherence, weight trajectory, macro distribution, micronutrient heatmap (signature view), and logging consistency — without the maximalist charting-library tropes that make mainstream trackers feel bloated.

**User Flow.**
1. User visits `/progress`.
2. Top segmented control: D (today) / W (7 days) / M (30 days).
3. Five chart sections (design-doc §10.8):
   - **§05 Calorie adherence** — bar chart with target line; adherence cells colored oxblood (over) / moss (on) / ember (approaching).
   - **§06 Weight trajectory** — line chart with logged dots, smoothed trend, horizontal goal line, dashed ember projection to goal.
   - **§07 Macro distribution** — stacked area (oxblood = protein, ochre = carbs, moss = fat).
   - **§08 Micronutrient heatmap (signature)** — 7 nutrients × 30 days grid, warm ramp from dust to oxblood.
   - **§09 Logging consistency calendar** — GitHub-style squares.
4. Charts render server-side via PPR + Cache Components keyed on `(user, range)`.
5. Sparse-data fallback: if user has <7 days of data, heatmap + weight trajectory show skeleton-with-explanation rather than empty.

**Data Model Implication.** Reads `food_entries` (aggregated by day), `weight_log`, `water_log`. Cached per `(user, range)` via `TAGS.userProgress(uid, range)`.

**Invariant Reference.**
- **I1** — all reads RLS-scoped.
- **I12** — progress cache tags typed.
- **F5** — daily aggregation buckets use user TZ.
- **F4** — weekly review card on progress invalidates on week rollover.

**Cross-reference to tasks.md.** Task 4.3a (Progress D/W/M view — 5 chart sections + weekly AI review PPR island + sparse-data fallback).

---

### 3.9 Weight Log + Auto-Recalc Target

**Goal.** Enable weekly weight tracking; when the user logs a weight change, the app auto-recalculates the calorie target (Mifflin-St Jeor) and surfaces a nudge card on the dashboard so the recalc is never silent.

**User Flow.**
1. Dashboard prompts weekly on Sunday if no weight logged this week.
2. User visits `/weight` (or uses quick-add path).
3. Unit-aware number input + today-default date picker (backfill allowed up to 30 days) + optional note.
4. Save → writes `weight_log` row.
5. If `profiles.target_mode = 'auto'` AND `abs(new_weight - current_weight) > recalc_threshold_pct`, server recomputes BMR/TDEE/target and updates `profiles.current_weight_kg` + `current_bmr` + `current_tdee` + `current_target` + `last_target_recalc_at`.
6. Dashboard nudge card renders on next visit: "Target updated to 2,040 kcal · see why."
7. If `target_mode = 'manual'`, weight log still writes but target is NOT recalculated.

**Data Model Implication.** Writes `weight_log` (date, weight_kg, note nullable, client_id). Conditionally updates `profiles` fields listed above.

**Invariant Reference.**
- **I1** — weight_log + profiles RLS.
- **I5** — recalc uses pure Mifflin-St Jeor functions with unit tests.
- **I11** — `client_id` on weight entries.
- **F9** — auto-recalc surprise mitigated by dashboard nudge card (never silent).
- **F12** — weight save wrapped by refresh-interceptor (test `library-delete-refresh.test.ts` covers a sibling pattern; Task 4.3b owns the weight-specific coverage).

**Optimistic allowlist membership.** Weight quick-add shares the optimistic category with water.

**Cross-reference to tasks.md.** Task 4.3b (weight log + auto-recalc pipeline + nudge card).

---

### 3.10 Auto / Manual Target Override

**Goal.** Give the user two target modes — **auto** (recalculates on weight change) and **manual** (user-locked value that ignores auto-recalc) — with clean mode transitions in Settings.

**User Flow.**
1. User goes to `/settings` → Goals group.
2. Target mode toggle: Auto / Manual.
3. **Auto → Manual transition:** current auto-calculated target is copied into `manual_override_value`; no nudge fires. User can then edit the manual value freely.
4. **Manual → Auto transition:** immediate recalc from current weight fires; dashboard nudge card fires.
5. In Auto mode, weight log changes (past recalc threshold) update target with nudge.
6. In Manual mode, weight changes do NOT touch target.

**Data Model Implication.** Updates `profiles.target_mode` ('auto' | 'manual'), `manual_override_value`, `current_target`, `last_target_recalc_at`.

**Invariant Reference.**
- **I1** — profiles RLS.
- **I5** — pure target calc functions tested.
- **F9** — auto-recalc transparency preserved in both modes.

**Cross-reference to tasks.md.** Task 2.1 (profile + target calc foundation), Task 4.3b (weight recalc pipeline), settings-level wiring in Phase 5 polish (Task 5.2 export + settings cleanup).

---

### 3.11 Undo Toast (5s)

**Goal.** Give the user a 5-second window to undo any delete or edit across all entry types (food, weight, water), with LIFO reveal order, optimistic-first behavior, and a queue cleared on route navigation — so the user never loses an entry to an accidental tap.

**User Flow.**
1. User performs a destructive action (delete food entry, delete weight row, delete water tick, edit that would overwrite).
2. UI updates optimistically immediately (entry disappears).
3. Toast appears: "Entry deleted · Undo" with 5-second countdown.
4. If multiple toasts are queued (rapid consecutive deletes), they surface in LIFO order — most recent toast is visible; earlier toasts queue behind and become visible as the current one dismisses.
5. Tap Undo → server reinserts (or reverts edit) → entry reappears.
6. On route navigation, the undo queue is **cleared** — any unacknowledged toasts commit their destructive action.
7. Cross-tab: a toast in one tab does NOT block commits in another tab (cross-tab undo coordination is handled via `BroadcastChannel` in Phase 5 polish).

**Data Model Implication.** Optimistic delete → server write deferred 5s. On undo, server reverse-writes (recreates row with original client_id OR reverts edit). All undo flows respect `client_id` idempotency contract (replays return 200 no-op).

**Invariant Reference.**
- **I8** — **load-bearing invariant**. Undo toast 5s + optimistic + rollback + LIFO + cleared on route nav.
- **I11** — `client_id` enables idempotent recreation on undo.
- **F3** — optimistic rollback tested.
- **F6** — undo-expires-before-persist-across-nav handled by Zustand persist + cleared-on-nav-timer-continues pattern.

**Cross-reference to tasks.md.** Task 3.4 (initial undo toast + LIFO), Task 5.2 (cross-tab extension via BroadcastChannel).

---

### 3.12 Weekly AI Review (7-day Cache)

**Goal.** Generate a weekly nutrition review from the past 7 days of entries ("You hit protein 6/7 days, iron ran low, here are three suggestions") and surface it as a pull-quote insight card on the dashboard — without blocking first paint and without re-generating on every visit.

**User Flow.**
1. User visits `/dashboard`.
2. Weekly insight card island renders with a skeleton.
3. Server checks `weekly_reviews` table for a row matching the user's current `week_start_on`.
4. If a valid row exists (not past `expires_at`): return cached content.
5. If no valid row: call `/api/ai/weekly-review` → Gemini receives the past 7 days of aggregated entries + user profile → returns review text → persist to `weekly_reviews` with `expires_at = generated_at + 7d`.
6. Card renders with italic serif body + oxblood drop cap.
7. **Sparse-data fallback:** if user has <5 days of data in the past 7, show a "Still learning your patterns — log 3 more days for your first review" skeleton message instead of calling Gemini.

**Data Model Implication.** Reads `food_entries` (past 7 days aggregated), `profiles` (for system prompt context). Writes `weekly_reviews` (id, user_id, week_start_on, content, generated_at, expires_at). Writes `ai_call_log` on generation (call_type = 'weekly-review').

**Invariant Reference.**
- **I1** — weekly_reviews RLS.
- **I2** — weekly-review calls write ai_call_log.
- **I3** — server-only Gemini key.
- **I10** — Zod validation on review shape.
- **F4** — stale-on-week-rollover handled by `expires_at` TTL.
- **F12** — wrapped by refresh-interceptor (test `ai-weekly-review-refresh.test.ts`).

**Cross-reference to tasks.md.** Task 4.3a (weekly AI review PPR island + sparse-data fallback).

---

### 3.13 Data Export (CSV + JSON)

**Goal.** Let the user export all their data in two formats (flat CSV for spreadsheets + nested JSON for portability) from Settings, with schema version v1.

**User Flow.**
1. User goes to `/settings` → Data group → "Export all data."
2. Server generates a ZIP containing:
   - `kalori-export-{userId}-{date}.csv` — flat `food_entries` + `weight_log` + `water_log`, one row per entry, ISO 8601 timestamps in UTC + user-TZ columns.
   - `kalori-export-{userId}-{date}.json` — nested profile + library + entries + logs, with schema version `v1`.
3. Browser downloads the ZIP.

**Data Model Implication.** Read-only across all user-owned tables. No writes.

**Invariant Reference.**
- **I1** — all reads RLS-scoped; user can only export their own data.
- **I6** — endpoint auth-required.

**Cross-reference to tasks.md.** Task 5.2 (data export ZIP + account deletion cascade).

---

### 3.14 Account Delete

**Goal.** Let the user hard-delete their account, cascading removal of all user-owned data — Storage objects first, DB rows next, `auth.users` row last — with a zero-object post-delete assertion.

**User Flow.**
1. User goes to `/settings` → Account group → "Delete account" (double-confirm required: typed phrase + modal).
2. Server executes in strict order:
   - **Step 1** — delete all Storage objects under `food-thumbnails/{userId}/**`.
   - **Step 2** — delete rows from every user-owned DB table in FK-safe order (`food_entries` before `food_library_items` before `profiles`, etc.; `ON DELETE CASCADE` handles most).
   - **Step 3** — delete `auth.users` row.
3. Post-delete assertion (test-only): zero objects under user prefix AND zero rows in any user-owned table.
4. Browser receives success → redirect to `/`.

**Data Model Implication.** Cascading delete across `profiles`, `food_entries`, `food_library_items`, `weight_log`, `water_log`, `ai_response_cache`, `ai_call_log`, `weekly_reviews`, Storage bucket objects, and `auth.users`.

**Invariant Reference.**
- **I9** — **load-bearing invariant**. Storage → DB → auth.users ordering; post-delete zero-object test.

**Cross-reference to tasks.md.** Task 5.2 (account deletion cascade — I9).

---

## 4. Anti-Scope (Explicit Non-Goals for MVP)

Kalori deliberately excludes the following to protect quality + scope + shipping discipline. These are **locked out** of MVP; downstream tasks may not implement them without re-entering planning (per blueprint §3).

- **No global food database or search.** Personal library only; the library grows from the user's actual eating. Search is scoped to the user's own items.
- **No exercise, workout, or calorie-burn logging.** Nutrition-in only. Post-MVP (see §5).
- **No barcode scanning.** Post-MVP.
- **No social, feed, sharing, or friends features.** Kalori is a personal ledger, not a platform.
- **No gamification beyond a lightweight logging-consistency calendar.** No badges, levels, cartoon mascots, XP, celebrations.
- **No marketing landing page.** Public root is minimal: app-name + sign-in CTA. No hero copy, no feature grid, no pricing, no testimonials.
- **No native mobile app.** PWA only (installable via manifest + service worker).
- **No multi-user, household, or shared accounts.** Single user per account. No roles, no admin UI in-app.
- **No notifications.** No push, no email digests, no reminders for MVP.
- **No Apple OAuth.** Magic link + Google OAuth only for MVP.
- **No command palette (⌘K).** Keyboard shortcuts are limited to `/` (search), `n` (new log), `?` (shortcuts overlay).
- **No light mode.** Dark-only. All token naming, component styling, and test baselines assume dark.
- **No third-party analytics beyond Sentry error tracking.** No Mixpanel, no Amplitude, no GA4, no session replay.
- **No multi-language beyond English.** i18n plumbing exists (`lib/i18n/en.ts` typed constants) but only English keys ship.
- **No public signup.** Invite-only cohort; single user through MVP.

---

## 5. Post-MVP Nice-to-Haves (Explicit Out-of-Scope for This Planning Cycle)

These are future features, explicitly out-of-scope for this planning cycle. Do not implement, design, or plan around them in any of the 26 MVP tasks. They are documented here to close the loop on what the product does and does not intend to become.

- **Light mode** (with parallel token theme)
- **Apple OAuth** (third sign-in method)
- **Command palette (⌘K)**
- **Named meal templates** ("my usual breakfast" saved as a template distinct from a library item)
- **Streak / milestone celebrations** (Lottie animations for consecutive-day streaks)
- **Household accounts** (multi-user sharing of library + meals)
- **Barcode scanning**
- **Exercise / workout logging**
- **Apple Health / Google Fit integration**
- **Email digest notifications** (weekly email with insight summary)
- **Marketing landing page** (only if app opens beyond invite-only)
- **Multi-language UI** (Hungarian, Vietnamese)
- **Native mobile wrapper** (Capacitor)
- **Perceptual image hashing** for cross-photo dedup (MVP uses content hash only)

---

## 6. Success Metrics

Measured at end of MVP shipping (Phase 5 Task 5.4 — final shippable gate) and continuously during the 30-day owner-use trial period. Sources: `design-doc.md §2`, `blueprint.md §2`, `tasks.md` preamble.

| # | Metric | Target | Source / Verification |
|---|---|---|---|
| 1 | **Gemini cost per active user per day** | **<$0.05** | `ai_call_log` daily aggregation per user; blueprint §2 success criteria |
| 2 | **Lighthouse performance score** | **>90 mobile** | CI Lighthouse advisory check (Task 5.1); `design-doc §15` |
| 3 | **RLS isolation** | **32 assertions pass (8 user-owned tables × 4 verbs)** | Playwright RLS harness with 2-user fixture (Task 1.2) + per-table verification (Tasks 3.1, 4.5); `design-doc §13` |
| 4 | **Undo reliability** | **I8 holds — 5s window, LIFO, cleared-on-nav, zero "lost entry" incidents** | Component + E2E tests on undo rollback (Tasks 3.4, 5.2); user-observable on 30-day trial |
| 5 | **Photo-log flow latency** | **<15s median end-to-end** (upload → confirmation visible) | Sentry custom timing spans (Task 3.3); design-doc §3 critical-flow #1 |
| 6 | **Owner daily use** | **30 consecutive days** without reverting to a previous tracker | Self-report during trial; blueprint §2 |
| 7 | **AI accuracy — critical tier** | **5 VN + 3 Western staples pass** with ±15% kcal tolerance; merge-blocking | AI accuracy regression fixtures (Tasks 3.2, 5.1, 5.4); critical-tier gate per `tasks.md` preamble Round-1 M1 |
| 8 | **AI accuracy — advisory tier** | Named sign-off from project lead on broader VN + Western fixture set | Task 5.4 tiered AI gate |
| 9 | **Zero cross-user cache poisoning** | F8 mitigation holds; cache keyed per-user | Integration test on `ai_response_cache` (Task 3.2) |
| 10 | **Account deletion — zero residual** | I9 holds: zero Storage objects + zero DB rows under user prefix post-delete | Playwright end-to-end on Task 5.2 |

**Merge-blocking vs advisory distinction.** Per Round-1 Codex finding M1, the 5 Vietnamese + 3 Western critical-tier AI accuracy fixtures are **merge-blocking** on every Phase 3+ PR — not just advisory. The tiered gate was promoted after Codex flagged that "Codex-review-blocking not merge-blocking" would let core logging accuracy drift silently.

---

## 7. Technical Constraints

Locked constraints — these bound every architectural and implementation decision in the 26-task plan.

- **PWA only.** No native wrapper, no Capacitor, no React Native. Installable via `@serwist/next` manifest + service worker.
- **Dark only.** No light-mode token set, no theme switching. All Ledger palette tokens assume dark.
- **Single user per account.** No multi-tenant patterns, no shared-library UX, no role matrix.
- **No third-party analytics beyond Sentry error tracking.** No performance monitoring or session replay — Sentry stays narrow.
- **Vietnamese-nutrition-first, Western secondary.** AI prompts consume `profiles.region`; critical-tier fixture set weights Vietnamese 5:3 over Western.
- **No barcode scanning, no exercise logging, no household accounts** — hard lockouts for MVP.
- **RLS active on every user-owned table.** No exceptions. Service-role key imports under `app/` are lint-blocked (Task 1.2).
- **Gemini API key server-only.** Never in client bundle. ESLint rule enforces (Task 1.1).
- **Photo originals deleted immediately post-analysis; thumbnails <50kb persist** (I4).
- **No cron / scheduled jobs for MVP.** Weekly review is lazy-on-dashboard-visit + 7-day cache.
- **Backfill horizon: 30 days.** Older dates are read-only; client + server-side validation block writes beyond.
- **TypeScript strict mode. Next.js 16 App Router. React 19. Tailwind v4. shadcn/ui.** Stack locked at brainstorm.
- **Supabase Postgres + Auth + Storage. Vercel hosting. Gemini Flash model.** Backend locked.
- **Dev + Prod environments only. No staging.**
- **Free tier budget.** Supabase free + Vercel hobby + owner's personal Gemini key.
- **Lighthouse ≥90 mobile.** Enforced as advisory CI gate (Task 5.1).
- **WCAG AA minimum. 44×44 tap targets. Visible focus rings.**
- **Responsive breakpoints: 375 / 768 / 1280+.**

Full cross-references to implementation decisions live in `architecture.md`.

---

## 8. Risks

Three primary product risks from blueprint §11 + one residual-risk carryover from the 2-round Codex plan review.

### R1 (Residual — accepted but mitigated) — Task 2.1 is a dense critical-path bottleneck

| Field | Value |
|---|---|
| Impact | Nearly every Phase 3/4 mutation task depends on Task 2.1. If Task 2.1 slips or lands partial, downstream work stalls. Task 2.1 owns: auth flows, profiles table, RLS policies, middleware, Mifflin-St Jeor math, target calc modules, and the F12 refresh-and-retry interceptor. |
| Rationale for accepting | Single-owner project. Splitting into 2.1a/2.1b introduces coordination overhead (two sub-tasks, two Codex/testing gates, dependency fan-out) that for a one-person team exceeds the critical-path cost of density. Codex Round 2 recommended a split; the split was deliberately **not followed**. |
| Mitigation contract | (1) Treat 2.1 as the longest Phase 2 task; allocate buffer. (2) **Phase 3/4 mutation tasks are EXPLICITLY FORBIDDEN from implementing local refresh behavior.** If `lib/auth/refresh-interceptor.ts` is not ready when a Phase 3 task is unblocked, that Phase 3 task WAITS. (3) If 2.1 is trending to miss its time-box, pause Phase 3 kick-off and reassess — do NOT let downstream create a local refresh shim as a workaround. (4) Reactive split option: if 2.1 proves too large, split the interceptor into a new Task 2.1.5. See `tasks.md` preamble for enforcement language. |

### R2 — Gemini portion estimation accuracy

| Field | Value |
|---|---|
| Impact | "An avocado" ranges 150–300 kcal. Inaccurate portion inference undermines the entire logging premise. Vietnamese food is the highest-risk category. |
| Mitigation | Median-value strategy for recognized foods (`lib/nutrition/portion-medians.ts`). Portion prominent + always editable on confirmation screen. Per-item confidence indicator. "Why these numbers?" panel exposes AI reasoning so the user can correct inline. Critical-tier fixture gate blocks merges on accuracy drift (5 VN + 3 Western; ±15% kcal tolerance). |

### R3 — Gemini cost drift if app opens beyond invite-only

| Field | Value |
|---|---|
| Impact | Gemini cost scales per-call. If Kalori opens to 100+ users, cost model breaks the hobby-tier budget. |
| Mitigation | `ai_response_cache` with 30-day TTL on normalized text hash + image content hash. Per-user `ai_call_log` gives real-time cost visibility. Soft daily cap per user is enforceable without schema change (post-MVP). Success metric #1 caps at <$0.05/DAU. Architecture supports 10–100 invited users — beyond that triggers cost redesign. |

### R4 — RLS misconfiguration leaking data between users

| Field | Value |
|---|---|
| Impact | Cross-user data exposure would be catastrophic (PII + body metrics + eating patterns). |
| Mitigation | RLS enforced on every user-owned table (I1). 2-user Playwright harness (Task 1.2) runs 32 assertions (8 tables × 4 verbs) on every Phase 3+ merge. CI lint check forbids service-role key imports under `app/`. Storage bucket RLS policy uses path-based ownership (`split_part(name, '/', 1)::uuid = auth.uid()`). Pre-prod manual RLS policy review gated on Task 5.4 (final shippable gate). |

---

## 9. Acceptance Criteria

Per-task acceptance criteria are **not duplicated here**. Authoritative source: `Planning/tasks.md`. The PRD is the product-level "what"; `tasks.md` is the implementation-level "how verified."

| Feature | tasks.md reference |
|---|---|
| Onboarding + Mifflin-St Jeor | Task 2.1 + Task 2.2 |
| Text log / Photo log / Library log | Task 3.2 (AI pipeline), Task 3.3 (log flow modal), Task 3.4 (confirmation + save) |
| Confirmation + "Why these numbers?" + dedup + undo toast | Task 3.4 |
| Dashboard | Task 3.5 |
| Water tracker | Task 3.5 (water component) |
| Library grid + search + filter + sort + merge | Task 4.1 |
| Food detail + edit + log-now | Task 4.2 |
| Progress view (5 charts) + weekly AI review | Task 4.3a |
| Weight log + auto-recalc + nudge + manual override | Task 4.3b |
| Cross-tab undo + data export + account deletion | Task 5.2 |
| PWA + offline + Lighthouse + AI accuracy regression | Task 5.1 |
| AI accuracy tiered gate | Task 5.4 |
| RLS isolation (32 assertions) | Task 1.2 (harness) + per-table verification in Tasks 3.1, 4.5, 5.4 |

See `testing-strategy.md` (created next) for the full test matrix that backs these criteria.

---

## 10. Cross-References

- **`Planning/architecture.md`** (created next in artifact sequence) — full Supabase DDL for all 8 tables (`profiles`, `food_entries`, `food_library_items`, `weight_log`, `water_log`, `ai_response_cache`, `ai_call_log`, `weekly_reviews`), 4-verb RLS policies × 5 user-owned tables (20 policy statements), Storage bucket policies, folder structure with `(marketing)` / `(auth)` / `(app)` route groups, full route map for all API endpoints, `lib/cache/tags.ts` typed-constant shape, Route Handler patterns, Gemini prompt storage, ESLint rules for I12 + I3, `client_id` enforcement pattern.
- **`Planning/ui-design.md`** (created next in artifact sequence) — The Ledger full component specs (chronometer ring, macro bars, meals bulletin, water bullet, micronutrient panel, weekly insight pull-quote, library ruled grid, confirmation screen, undo toast, progress charts, micronutrient heatmap), token dictionary (12 colors + Newsreader/Inter/JetBrains Mono + spacing scale), responsive behavior at 375 / 768 / 1280, motion system (120–180ms, `cubic-bezier(.2,.8,.2,1)`, reduced-motion crossfades), accessibility rules (2px focus rings, 44×44 tap targets, WCAG AA, `/` + `n` keyboard shortcuts), screen inventory.
- **`Planning/tasks.md`** (already exists, Codex-reviewed × 2 rounds) — 26-task implementation plan with per-task acceptance criteria, TDD mandate, invariant/failure-mode coverage matrices, and R1 residual risk.
- **`Planning/testing-strategy.md`** (created after architecture.md + ui-design.md) — full test matrix expanding design-doc §13, fixture organization, CI gate definitions, RLS harness setup, AI accuracy tier spec.
- **`Planning/progress.md`** (created after testing-strategy.md) — phase/task tracker initial template with R1 residual prominent.
- **`Planning/CHANGELOG.md`** (created last) — initial template + backfilled planning-phase entries.
- **`Planning/design-doc.md`** (already exists) — canonical design source; this PRD derives from it + the blueprint. Full §2 success metrics, §3 critical flows, §8 UX, §10 screens, §18 failure modes, §19 invariants all live there.
- **`Planning/kalori-project-blueprint.md`** (already exists) — original product spec; §3 MVP feature matrix + anti-scope + §11 risks sourced this PRD's §3, §4, §8.
- **`Planning/brainstorm-context/02-pre-plan.md`** and **`03-pre-artifacts.md`** — upstream compressed handoffs; authoritative for stack lock + architecture approach + invariants I1–I12 + failure modes F1–F12.

---

*End of PRD. This document is product-level only; no implementation code. Next artifact: `Planning/architecture.md`.*
