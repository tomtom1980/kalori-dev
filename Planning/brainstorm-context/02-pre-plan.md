# 02 — Pre-Plan Checkpoint (Kalori Brainstorm)

## Metadata

| Field | Value |
|---|---|
| Position | `design_complete` → entering Step 6 (plan writing) |
| Date | 2026-04-18 |
| Project | Kalori — AI-first calorie/nutrition tracker |
| Complexity tier | Complex (7 downstream artifacts) |
| Skill | `brainstorm-tomi` |
| Design status | Codex-reviewed (35 findings resolved: 10 Critical + 20 Suggestion + 5 Minor) |

## Purpose

Single-file handoff for the Phase 1 Step 6 plan-writing sub-agent. Everything required to write `Planning/tasks.md` is either stated inline below or pointed-to by path. **Read this file first**, then pull details from pointed-to files only as needed.

## Source-of-truth files (read order for Step 6)

1. **This file** (`Planning/brainstorm-context/02-pre-plan.md`) — compressed handoff
2. **`Planning/design-doc.md`** (~7,500 words, Codex-reviewed) — canonical design, failure-first analysis, invariants, responsive nav, testing matrix, phasing detail. **Reference when writing task scope; don't re-derive.**
3. **`Planning/kalori-project-blueprint.md`** — product spec, anti-scope, constraints, risks
4. **`Design/mockups-brainstorm/direction-1-editorial/brief.md`** — "The Ledger" visual system specs
5. **`Design/mockups-brainstorm/direction-1-editorial/index.html`** — implementation reference for visual language
6. **`Planning/brainstorm-state.md`** — resume metadata
7. **`~/.claude/lessonlearned.md`** — general session lessons (apply per §Lessons below)

## Stack (locked)

- **Framework**: Next.js 16 + React 19 + TypeScript strict mode
- **Styling**: Tailwind v4 + shadcn/ui
- **Motion**: Framer Motion (primary) + Lottie (empty states only)
- **Charts**: Recharts for standard charts; inline SVG for chronometer ring + micronutrient heatmap
- **State**: Zustand (ephemeral UI — log flow, undo queue, modals); TanStack Query **provisional** (Phase 3 decision); Supabase auth context
- **Backend**: Next.js Route Handlers proxying Supabase + Gemini (server-only Gemini key)
- **Database**: Supabase Postgres with RLS on every user-owned table
- **Hosting**: Vercel (frontend + API routes) + Supabase cloud (DB + Auth + Storage)
- **Image**: `browser-image-compression` client-side (<500kb, 1600px max) before upload
- **PWA**: `@serwist/next` (manifest + service worker + offline shell)
- **Testing**: Vitest + Playwright + @axe-core/playwright + MSW (Mock Service Worker for integration)
- **Observability**: Sentry (error tracking only — no performance, no session replay for MVP)
- **AI**: Gemini (`gemini-flash-latest`) via server-only Route Handlers, 30-day response cache in `ai_response_cache` Postgres table

## Architecture: Approach C Hybrid

- **Server-rendered (Cache Components + PPR)**: Dashboard, Progress, Library
- **Client-interactive (traditional)**: Log flow modal, confirmation screen, settings forms
- **Optimistic UX ONLY on 4 surfaces**: undo toast (5s), log-save, water +glass, weight quick-add
- **Cache strategy**: Next.js `use cache` + `cacheTag` + `updateTag` + `lib/cache/tags.ts` typed constants (ESLint rule enforces — Invariant I12)
- **AI cache**: MVP uses only the `ai_response_cache` DB table keyed by normalized-hash. Vercel Runtime Cache is post-MVP.
- **Cost logging**: Synchronous failure-tolerant insert into `ai_call_log` with `(user_id, created_at DESC)` index

## Design Direction: "The Ledger" (dark-only)

### Palette

| Role | Hex |
|---|---|
| bg-0 (page void) | `#0E0A08` |
| bg-1 (card field) | `#15100D` |
| bg-2 (inset) | `#1E1815` |
| hairline rule | `#2A2320` |
| hairline strong | `#3A3029` |
| ivory (text 1) | `#F4EBDC` |
| sand (text 2) | `#C9BDA8` |
| dust (text 3) | `#8A8173` |
| **oxblood (signature)** | `#8A2A1F` |
| ember (warm secondary) | `#C8693B` |
| ochre (carb tint) | `#B8894A` |
| moss (on-target data) | `#5C6B3D` |
| slate (neutral data) | `#4A5764` |

### Typography

- **Serif display/numerals**: Newsreader (300-400, optical size enabled)
  - Wordmark 104px / -0.035em
  - Section titles 44px / -0.02em
  - Calorie value 82px (tabular lining figures)
- **Sans labels/chrome**: Inter (300-600)
  - Labels 10.5px UPPERCASE tracking 0.18-0.22em
- **Mono timestamps/codes**: JetBrains Mono (400, 10.5-11px)
- All numerals `font-variant-numeric: tabular-nums` + lining

### Shape

- Radii: **0** across the board (everything is a rule or rectangle). Only circles: chronometer ring, data points, water bullet.
- Borders: 1px hairline (`#2A2320`) for dividers; 1px strong (`#3A3029`) for card frames
- Shadows: **NONE**. Depth entirely from rules + whitespace + tonal cards
- Grid: real, visible column/row rules (3-col dashboard, 5-col meals bulletin, 4-col library, 30-col heatmap)

### Motion

- Calm, paper-like. 120-180ms transitions. `cubic-bezier(.2,.8,.2,1)` easing
- Cards "wet" tonally brighter on hover (no lift, no scale)
- Numbers cross-fade (no count-up animation)
- Ring draws once on load in ~600ms (ink settling)
- Heatmap cells fade in row-by-row on first view
- `prefers-reduced-motion`: crossfades only

## Navigation System (responsive breakpoints)

### Desktop (1280+ px)
- **Persistent left sidebar** (240px wide) with primary nav: Dashboard / Log / Library / Progress
- Brand/logo at top
- Settings in profile menu at bottom
- Oxblood active state (left-edge rule + oxblood label)

### Tablet (768-1279 px)
- **Collapsible sidebar**: icon-only 56px rail default; expands on hover to full labels
- Top app bar shows current section title + hamburger toggle
- Pinned-expanded option via settings

### Mobile (375-767 px)
- **Bottom tab bar** (56px, iOS HIG + Material 3): 4 primary destinations (Dashboard / Log / Library / Progress)
- **FAB** 56×56px circular, oxblood fill, positioned `bottom: calc(56px + env(safe-area-inset-bottom) + 8px)` above tab bar. Zero-radius exception from Ledger (valid per design-doc §8)
- Top app bar with page title + profile avatar (Settings via avatar menu, not tab)
- Modal stacking: opening log flow from sub-route dismisses no state; back chevron returns to sub-route

### All breakpoints
- 44×44 tap target minimum
- Visible focus rings (2px oxblood-tinted outline)
- Keyboard: `/` search, `n` new log (desktop/tablet)
- WCAG AA contrast

## Data model (summary)

Full DDL deferred to `architecture.md` (Step 6.7 artifact). Tables:

- `profiles` — bio sex, age, height, weight, goal, activity, region, dietary_prefs[], allergens[], unit_preference, timezone, target_mode (auto/manual), manual_override_value, current_bmr, current_tdee, current_target
- `food_entries` — `client_id uuid UNIQUE` (I11), timestamp, meal_category, source (text/photo/library), parent_library_item_id (NULL ok), items[], ai_reasoning, logged_at (UTC), created_at_server
- `food_library_items` — `client_id uuid UNIQUE`, display_name, normalized_name (indexed), default_portion, nutrition_profile, thumbnail_url (nullable), log_count, last_used_at, user_edited_flag, source
- `weight_log` — `client_id uuid UNIQUE`, date, weight_kg, note (nullable)
- `water_log` — `client_id uuid UNIQUE`, date, count, unit
- `ai_response_cache` — normalized-hash PK, call_type, parsed_payload (jsonb), expires_at (30d)
- `ai_call_log` — user_id (FK), call_type, input_hash, input_tokens, output_tokens, cost_estimate, latency_ms, cached_flag, created_at

RLS on all user-owned tables. `user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE`. `food_entries.library_item_id` is `ON DELETE SET NULL` (entry history survives library pruning).

## Invariants (I1-I12) — must hold through implementation

| # | Invariant |
|---|---|
| I1 | RLS active on every user-owned table; policies restrict by `auth.uid()` at insert + select + update + delete |
| I2 | Every AI-lookup path (including cache hits) writes an `ai_call_log` row; write is failure-tolerant (Sentry on error, does not block response) |
| I3 | Gemini API key server-only; never in client bundle |
| I4 | Photo originals deleted immediately after analysis; only thumbnail (<50kb) persists in Storage |
| I5 | Mifflin-St Jeor math is pure functions with unit tests |
| I6 | Auth required for all routes except `/`, `/login`, `/auth/callback` |
| I7 | AI failure never blocks logging (fallback to manual entry form) |
| I8 | Undo toast window is 5s + optimistic delete + rollback on server confirm. LIFO reveal order. Queue cleared on route navigation. |
| I9 | Account deletion: Storage objects first → DB rows → auth.users last; test asserts zero objects remain under user prefix AND zero rows in any user-owned table |
| I10 | AI response shape strictly Zod-validated before persistence |
| I11 | Every client-initiated write carries a client-generated UUID (`client_id`); server enforces uniqueness; replays return 200 no-op |
| I12 | All `cacheTag` / `updateTag` calls use `lib/cache/tags.ts` constants; ESLint rule forbids inline tag literals |

## Failure modes (F1-F12) — design implementation to mitigate

F1-F10 per design-doc.md §18.1. Added by Codex review:
- **F11 Prompt injection** → mitigate via role-separated input (Gemini parts array, never concat into system message), role-control token sanitization (`<|system|>`, `IGNORE PRIOR`, etc.), Zod reasoning length cap 500 chars + control-char strip
- **F12 Auth session expired mid-mutation** → `@supabase/ssr` refresh middleware + 401-response interceptor retries once; cross-tab sign-out via `BroadcastChannel`

## Phasing (5 linear phases)

| Phase | Name | Scope | Task count |
|---|---|---|---|
| 1 | **Foundation** | Next.js 16 scaffold + App Router; Supabase project init + Auth setup; shadcn installed + configured with Ledger tokens (tokens.css, tailwind.config); CI pipeline (GitHub Actions or Vercel CI); test harness (Vitest + Playwright + MSW + axe); RLS test scaffolding (2-user fixtures); seed script with 14-day fixture data; base layouts + responsive nav shell; i18n `lib/i18n/en.ts` typed constants; `lib/cache/tags.ts` typed cache-tag constants; Sentry init | ~4-5 tasks |
| 2 | **Auth + Onboarding** | Supabase Auth magic link + Google OAuth wiring; 8-step onboarding wizard (strict sequential); Mifflin-St Jeor math (pure functions + unit tests); target calculation transparency panel; profile table RLS policies | ~3-4 tasks |
| 3 | **Dashboard + Log** (FIRST-USABLE MILESTONE) | food_entries + food_library_items schema with `client_id` (I11) + RLS; 3-tab log flow modal (Type / Snap / Library); Gemini Route Handlers + Zod schemas + cache + cost logging (I2, I12); confirmation screen with "Why these numbers?" panel + save-to-library toggle; dashboard chronometer ring + macro bars + meal groups + water + micronutrient panel + weekly AI insight card (PPR Suspense island); prompt injection mitigation (F11) | ~5-6 tasks |
| 4 | **Library + Progress** | Library grid + search + normalized-name dedup + merge-duplicates UI (FK repoint); food detail panel; Progress D/W/M toggle + calorie adherence + weight trajectory + macro distribution + **micronutrient heatmap signature view**; weekly AI review sparse-data fallback | ~4-5 tasks |
| 5 | **Polish + PWA** | Undo queue edge cases (LIFO, cross-tab, offline replay); `@serwist/next` PWA manifest + service worker + offline shell; `prefers-reduced-motion` audit; Lighthouse hardening (≥90 mobile); data export (CSV + JSON ZIP); account deletion cascade (I9 with Storage-first ordering); auth session refresh (F12); AI accuracy regression fixtures | ~3-4 tasks |

**Target total: 15-20 tasks across 5 phases.** Each phase ends with 2 mandatory review tasks (see below).

## Testing matrix (summary)

| Level | Tool | Scope | Gate |
|---|---|---|---|
| Unit | Vitest | Pure logic (Mifflin-St Jeor, parsers, normalizers, cache keys, dedup) | Blocking |
| Component | Vitest + Testing Library | Client components; optimistic-rollback tests (water +glass, weight quick-add, undo restore on server error) | Blocking |
| Integration | Vitest + Mock Service Worker (MSW) | Route Handlers, cache-tag invalidation round-trip (mutation → `updateTag` → read returns fresh) | Blocking |
| RLS | Playwright | 8 user-owned tables × 4 verbs = 32 assertions + CI lint check forbidding service-role key imports under `app/` | Blocking |
| E2E | Playwright | ~10 flows: 4 blueprint (onboarding, text-log, photo-log, RLS two-user) + 6 secondary (water, weight, library edit, undo toast, copy-yesterday, settings profile edit) | Blocking (happy paths) |
| Visual | Playwright screenshots | 6 screens × 3 breakpoints = 18 baselines | Advisory |
| A11y | @axe-core/playwright | Runs on every E2E | Advisory |
| Lighthouse | CI | ≥90 mobile target | Advisory |
| AI accuracy | Vitest snapshot | 5 VN (bún bò, phở, cơm tấm, bánh mì, bún thịt nướng) + 5 Western fixture photos + 10 text prompts; ±15% kcal tolerance | Advisory |

Full spec: `design-doc.md` §13

## Step 6 plan-writing instructions (for sub-agent)

### Output

`Planning/tasks.md` — markdown with hierarchical task structure. Finalized at Step 6.7 after Codex review.

### Task sizing rules

- **Right-sized target**: 1-4 related files per task, 30min-2h focused effort
- **Right-size signals**: cohesive unit of work, single review/test cycle produces clear pass/fail, testable atomically
- **OK to bundle**: setup + first use ("add schema + write insert function"), component + unit tests (TDD pairs them), handler + validation + error paths (one cohesive behavior)
- **Real split signals**: crosses subsystems (UI + API + DB → 2-3 tasks), different review criteria (frontend visual vs backend logic), unblocks user feedback independently, > 2hrs focused work
- **Anti-split signals** (do NOT split on these): task description contains "and" (language, not structure), two related files, has a setup step, has error handling

### Required task header format

```markdown
### Task N.M: [Name]
**Complexity:** Simple | Medium | Complex
**Codex review:** Per-task required (Medium/Complex) | Per-phase covers (Simple)
**Type tags:** [UI] [backend] [API] [database] [design] [testing] [infrastructure] [integration] [review]
**Files:** [estimated relative paths]
**Reads:** [artifacts the sub-agent must load before starting — always includes tasks.md own entry + relevant design-doc.md sections]
**Goal:** [one-line description]

[Detailed steps / acceptance criteria / test cases]
```

### Complexity classification (project-context-aware)

- **Simple**: 1 file, <30min, trivial (config change, string update, rename, copy tweak)
- **Medium**: 1-4 files, 30-90min, real logic or module integration
- **Complex**: 4+ files, >90min, or cross-cutting changes

When in doubt, label UP (Medium instead of Simple).

### Per-task review/testing gating (drives execution-time decisions)

- **Simple** → no per-task Codex, no per-task testing (phase-level covers)
- **Medium** → per-task Codex + Unit/Integration tests
- **Complex** → per-task Codex + Unit/Integration/Visual/A11y/E2E per type tags

### Canonical TDD Mandate (inject verbatim into every implementation task)

> **MANDATORY**: Follow TDD — write a failing test first for each behavior, verify it fails for the right reason, write minimal code to pass, verify all tests pass. Required test types: unit tests, integration tests, E2E tests. If UI work: use Playwright for E2E. All tests must pass before reporting task complete.

### Mandatory per-phase tasks (both are the LAST tasks of their phase)

**Last review task template:**

> **Task N.X: Codex Adversarial Review — [Phase Name]**
> Run the Standard Codex Gate Sequence on all changes from this phase. Categorize findings into Critical / Suggestion / Minor. Auto-fix Critical/Suggestion via opus sub-agent. Cap: 2 rounds. Log outcome in progress.md Notes.

**Last testing sweep template:**

> **Task N.Y: Phase Testing Sweep — [Phase Name]**
> Run full applicable test suite for the phase: unit + integration + E2E for completed features + visual regression for UI + accessibility audit for UI + coverage report. Block phase completion on any failures.

Never omit either. Even single-phase trivial slices get both.

### Task ordering dependencies

- **Phase 1 must come before all others** — RLS test scaffolding, seed script, design tokens, test harness, nav shell
- RLS test harness (2-user fixtures) must exist BEFORE any user-owned table is created
- Design tokens + shadcn primitives come early in Phase 1 (so later tasks render against the design system)
- `client_id` idempotency schema enters in Phase 3 (per Codex C4)
- Mifflin-St Jeor pure functions come in Phase 2 before onboarding wizard consumes them
- Gemini prompts in `lib/ai/prompts.ts` come in Phase 3 before log flow depends on them
- Weekly AI review (PPR Suspense island) comes in Phase 4 (Progress)
- PWA service worker comes in Phase 5 (needs cache-buster hash from Next 16 build — comes late so builds are stable)

### Lessons to apply (from `~/.claude/lessonlearned.md`)

| Lesson | Applied in |
|---|---|
| i18n from day 1 | `lib/i18n/en.ts` typed constants (Phase 1) |
| Silent data loss is always a bug | Graceful degradation fallback, never block logging (I7) |
| Plans specify contracts not primitives | Zod schemas for AI responses (design-doc §7) — contract over implementation |
| Test the consumer not the producer | E2E tests exercise the UI the user sees (design-doc §13) |
| Per-task Codex review non-negotiable | Medium/Complex tasks get per-task Codex (gating above) |
| Mutation-evidence required | Tests must fail when code is transiently broken (phase-level Testing Sweep checks) |

## Step 6 completion criteria

`Planning/tasks.md` is Step 6 complete when:

1. 15-20 total tasks across 5 phases
2. Each phase ends with 2 mandatory tasks (Codex review + Phase Testing Sweep)
3. Every task has complexity label, type tags, Reads field, files, goal, acceptance criteria
4. Every implementation task includes Canonical TDD Mandate verbatim
5. Dependencies between tasks are explicit (via **Reads** + phase ordering + upstream task references)
6. First-usable milestone is reached at end of Phase 3

After Step 6, proceed to Step 6.5 (Codex review of `tasks.md`).

## 7 Complex-tier final artifacts (Step 6.7, after Codex plan review)

Created sequentially in dependency order:

1. **`Planning/PRD.md`** — consolidated product requirements (derived from blueprint + design-doc)
2. **`Planning/architecture.md`** — full Supabase DDL (with RLS policies), folder structure, route map, cache-tag constants, Route Handler patterns, Gemini prompt storage, `client_id` enforcement patterns
3. **`Planning/ui-design.md`** — The Ledger full component specs, responsive navigation detail, motion system, accessibility rules, screen inventory
4. **`Planning/tasks.md`** — finalized task breakdown (from Step 6, Codex-reviewed)
5. **`Planning/testing-strategy.md`** — full test matrix, fixtures, CI config, Playwright setup, MSW handlers
6. **`Planning/progress.md`** — initial empty tracking template
7. **`Planning/CHANGELOG.md`** — initial empty changelog template

## Git state at this checkpoint

| Commit | Description |
|---|---|
| `6179495` | baseline — blueprint, design brief, 4 mockup directions, `.gitignore` |
| `1610aee` | design-doc.md (Codex Critical+Suggestion fixes) + brainstorm-state.md |
| `1238906` | design-doc.md (Codex Minor M1-M5 fixes) + updated state |
| (this commit) | pre-plan context checkpoint + state pointer update |

## Known deferred items (for Step 6 awareness)

- **TanStack Query inclusion**: decide during Phase 3 implementation. Default is Server Actions + `updateTag`; add TanStack only if cross-component client-cache coordination emerges
- **`edition_number` masthead calculation (M2)**: implement in Phase 3 Dashboard task (computed server-side from `profiles.created_at` + user timezone)
- **Cold-start latency on Vercel free tier** (S7): accepted MVP constraint; revisit in Phase 5 polish if first-paint critical flow is impacted
- **Post-MVP items** (light mode, Apple OAuth, command palette, named meal templates, streak celebrations, household accounts, barcode scanning, exercise logging, Apple Health/Google Fit): NOT in `tasks.md`. Flagged in design-doc §19.3 long-term path.

## Architecture decisions NOT yet made (will arise during implementation)

These are implementation-level decisions that should NOT be pre-locked in tasks.md but SHOULD be noted as upcoming discovery points:

- Exact folder structure under `app/` (`(auth)`, `(marketing)`, `(app)` route groups)
- Gemini prompt template versions (inline constants vs DB-stored with semver tags)
- Seed script CLI interface (fixture JSON flags)
- Specific shadcn components to install per task
- Tailwind v4 theme configuration details (CSS custom properties mapping)
- Specific Zod schemas per AI call type
- Exact Playwright fixture data for RLS tests

---

**End of pre-plan checkpoint.** Next: Step 6 sub-agent writes `Planning/tasks.md` per instructions above.
