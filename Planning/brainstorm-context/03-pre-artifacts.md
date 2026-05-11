# 03 — Pre-Artifacts Checkpoint (Kalori Brainstorm)

## Metadata

| Field | Value |
|---|---|
| Position | `plan_complete` → entering Step 6.6 (Lessons Write-Back) + Step 6.7 (Artifact creation) |
| Date | 2026-04-18 |
| Project | Kalori — AI-first calorie/nutrition tracker (PWA, dark-only, single-user) |
| Complexity tier | Complex (7 downstream artifacts; `tasks.md` is #4 and already exists) |
| Skill | `brainstorm-tomi` |
| Plan status | Codex-reviewed across 2 rounds (7 findings total — all resolved or residually logged) |

## Purpose

Single-file handoff for the Phase 1 Step 6.6 + 6.7 sub-agents. After context reset, Claude reads `brainstorm-state.md` + this file and can execute both steps without needing conversation history. Every load-bearing decision, finding, and quality bar is captured here or pointed-to by path.

## Source-of-truth files (read order for Step 6.6 + 6.7)

1. **This file** (`Planning/brainstorm-context/03-pre-artifacts.md`) — compressed handoff
2. **`Planning/brainstorm-state.md`** — resume metadata + decision tape (canonical state)
3. **`Planning/tasks.md`** — **ALREADY EXISTS** — 26-task plan, 2-round Codex-reviewed; will be cross-linked by other artifacts but NOT rewritten at Step 6.7
4. **`Planning/design-doc.md`** (~36k tokens, Codex-reviewed) — canonical design; Failure-First analysis (§18); Invariants (§19.1); testing matrix (§13); phasing detail; component specs (§8–10)
5. **`Planning/brainstorm-context/02-pre-plan.md`** — upstream compressed handoff from pre-plan checkpoint
6. **`Planning/brainstorm-context/01-pre-design.md`** — deepest upstream; Q&A transcript, approaches considered, mockup decisions. **Load for Step 6.7 ui-design.md artifact only** (full mockup context there)
7. **`Planning/kalori-project-blueprint.md`** — product spec, anti-scope, constraints, risks
8. **`Design/mockups-brainstorm/direction-1-editorial/index.html`** + `brief.md` — "The Ledger" visual reference (for ui-design.md artifact)
9. **`~/.claude/lessonlearned.md`** — existing lessons (for Step 6.6 append-only)

---

## Stack (locked)

- **Framework**: Next.js 16 + React 19 + TypeScript strict mode
- **Styling**: Tailwind v4 + shadcn/ui
- **Motion**: Framer Motion (primary) + Lottie (empty states only)
- **Charts**: Recharts for standard; inline SVG for chronometer ring + micronutrient heatmap
- **State**: Zustand (ephemeral UI); TanStack Query (provisional — Phase 3 decision); Supabase auth context
- **Backend**: Next.js Route Handlers proxying Supabase + Gemini (server-only Gemini key)
- **Database**: Supabase Postgres with RLS on every user-owned table
- **Hosting**: Vercel (frontend + API routes) + Supabase cloud (DB + Auth + Storage)
- **Image**: `browser-image-compression` client-side (<500kb, 1600px max) before upload
- **PWA**: `@serwist/next` (manifest + service worker + offline shell)
- **Testing**: Vitest + Playwright + @axe-core/playwright + MSW
- **Observability**: Sentry (error tracking only — no performance, no session replay for MVP)
- **AI**: Gemini (`gemini-flash-latest`) via server-only Route Handlers, 30-day response cache in `ai_response_cache` Postgres table

## Architecture: Approach C Hybrid

- **Server-rendered (Cache Components + PPR)**: Dashboard, Progress, Library
- **Client-interactive**: Log flow modal, confirmation screen, settings forms
- **Optimistic UX ONLY on 3 categories** (design-doc §6): undo toast (5s), log-save, water/weight quick-add category (water + weight share the pattern)
- **Cache strategy**: Next.js `use cache` + `cacheTag` + `updateTag` + `lib/cache/tags.ts` typed constants (ESLint rule enforces inline-tag ban — Invariant I12)
- **AI cache**: MVP uses only the `ai_response_cache` DB table keyed by normalized-hash. Vercel Runtime Cache is post-MVP
- **Cost logging**: Synchronous failure-tolerant insert into `ai_call_log` (Invariant I2)

## Design Direction: "The Ledger" (dark-only)

### Palette (all 12 colors)

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

- **Serif display/numerals**: Newsreader (300-400, optical size enabled) — Wordmark 104px / Section titles 44px / Calorie value 82px tabular-lining
- **Sans labels/chrome**: Inter (300-600) — Labels 10.5px UPPERCASE tracking 0.18-0.22em
- **Mono timestamps/codes**: JetBrains Mono (400, 10.5-11px)
- All numerals `font-variant-numeric: tabular-nums` + lining

### Shape + motion

- Radii: **0** (everything is a rule or rectangle). Circles only: chronometer ring, data points, water bullet. FAB is a zero-radius exception on mobile
- Borders: 1px hairline (`#2A2320`) for dividers; 1px strong (`#3A3029`) for card frames
- Shadows: **NONE**. Depth from rules + whitespace + tonal cards
- Motion: 120-180ms transitions; `cubic-bezier(.2,.8,.2,1)` easing; ring draws in 600ms; `prefers-reduced-motion` → crossfades only

## Navigation System (responsive)

- **Desktop (1280+ px)**: persistent left sidebar (240px), oxblood active state
- **Tablet (768-1279 px)**: collapsible sidebar (56px rail default, expands on hover)
- **Mobile (375-767 px)**: bottom tab bar (56px, 4 destinations) + 56×56 FAB center-offset
- **All**: 44×44 min tap target; visible focus rings; `/` = search, `n` = new log (desktop/tablet)

## Data model (summary — full DDL goes in `architecture.md`)

7 tables with RLS on all user-owned ones:
- `profiles` — bio data, onboarding-captured, `recalc_threshold_pct` + `last_target_recalc_at` + `last_dashboard_visit_at`
- `food_entries` — `client_id uuid UNIQUE` (I11), FKs to library, items[], ai_reasoning, `logged_at` + `created_at_server`
- `food_library_items` — `client_id uuid UNIQUE`, `normalized_name` indexed, `thumbnail_url` nullable, log_count, `last_used_at`
- `weight_log` — `client_id uuid UNIQUE`, date, weight_kg, note nullable
- `water_log` — `client_id uuid UNIQUE`, date, count, unit
- `ai_response_cache` — normalized-hash PK, call_type, parsed_payload jsonb, expires_at 30d
- `ai_call_log` — user_id FK, call_type, input_hash, tokens, cost_estimate, latency_ms, cached_flag, created_at

FK policy: `user_id REFERENCES auth.users(id) ON DELETE CASCADE`; `food_entries.library_item_id` uses `ON DELETE SET NULL` (entry history survives library pruning).

Storage: `food-thumbnails` bucket (NOT public); RLS policy on `storage.objects` with path-based ownership (`split_part(name, '/', 1)::uuid = auth.uid()`); signed URLs with 10-min TTL for reads.

## Invariants I1–I12 (must hold through implementation)

| # | Invariant |
|---|---|
| I1 | RLS active on every user-owned table; 4-verb policies |
| I2 | Every AI-lookup writes `ai_call_log` (failure-tolerant) |
| I3 | Gemini API key server-only; never in client bundle |
| I4 | Photo originals deleted immediately post-analysis; thumbnails <50kb persist |
| I5 | Mifflin-St Jeor math is pure functions with unit tests |
| I6 | Auth required for all routes except `/`, `/login`, `/auth/callback` |
| I7 | AI failure never blocks logging (fallback to manual entry) |
| I8 | Undo toast 5s + optimistic + rollback + LIFO + cleared-on-nav |
| I9 | Account deletion: Storage objects first → DB rows → `auth.users` last; zero-object test |
| I10 | AI response shape strictly Zod-validated before persist |
| I11 | Every client-initiated write carries `client_id` UUID; server enforces unique; replays return 200 no-op |
| I12 | All `cacheTag`/`updateTag` calls use `lib/cache/tags.ts` constants; ESLint rule forbids inline literals |

## Failure modes F1–F12

F1–F10 per design-doc §18.1. Added by Codex review of design doc:
- **F11** Prompt injection → role-separated input (Gemini parts array), token sanitization, Zod reasoning length cap 500 chars + control-char strip
- **F12** Auth session expired mid-mutation → `@supabase/ssr` refresh middleware + 401-response interceptor retries once; cross-tab sign-out via `BroadcastChannel`

## Phasing (5 linear phases)

| Phase | Name | Tasks | Milestone |
|---|---|---|---|
| 1 | Foundation | 5 (3 impl + 2 gate) | — |
| 2 | Auth + Onboarding | 4 (2 impl + 2 gate) | — |
| 3 | Dashboard + Log | 7 (5 impl + 2 gate) | **FIRST-USABLE** (Task 3.7) |
| 4 | Library + Progress | 6 (4 impl + 2 gate, 4.3 split into 4.3a/4.3b) | — |
| 5 | Polish + PWA | 4 (2 impl + 2 gate) | **FINAL SHIPPABLE** (Task 5.4) |

**Total: 26 tasks.** See `tasks.md` for the full plan.

---

## Known Residual Risks (carried forward from `tasks.md` preamble)

### R1 — Task 2.1 is a dense critical-path bottleneck

Codex Round 2 flagged that Task 2.1 owns: auth flows, profiles, RLS policies, middleware, Mifflin/TDEE/target calc modules, AND the F12 refresh-and-retry interceptor. Nearly every Phase 3/4 mutation task depends on it.

**Accepted rationale:** Single-owner project; coordination cost of a 2.1a/2.1b split exceeds critical-path cost.

**Mitigation stance (LOAD-BEARING — enforce during execution):**
1. Treat Task 2.1 as the longest Phase 2 task; allocate buffer.
2. **Phase 3/4 mutation tasks are EXPLICITLY FORBIDDEN from implementing local refresh behavior.** If `lib/auth/refresh-interceptor.ts` is not ready when a Phase 3 task is unblocked, that Phase 3 task WAITS.
3. During execution, if 2.1 trends to miss its time-box, pause Phase 3 kick-off. Do NOT let downstream create local refresh shims.
4. Revisit before Phase 3 starts: if 2.1 proved too large, split into Task 2.1.5 as reactive mitigation.

**Codex Round 2 recommendation NOT followed:** split Task 2.1 into 2.1a / 2.1b. Deliberate — recorded for reviewers.

---

## Codex findings raw material (for Step 6.6 lessons)

### Design doc (Step 5.5 — committed earlier)

- 10 Critical + 20 Suggestion + 5 Minor — ALL applied (commits `1610aee`, `1238906`)
- Representative patterns caught:
  - **F11 prompt injection mitigation** missing (added role-separated input + Zod length cap)
  - **F12 auth session expiry** missing (added 401 retry contract)
  - **I11 client_id idempotency** missing (added UUID contract on every write)
  - **I12 typed cache tags** missing (added ESLint rule)
  - **Storage-first account deletion** (I9) reversed (added Storage → DB → auth.users ordering)
  - **Edition-number spec** (design-doc §8) under-specified
  - **Weekly-review sparse-data fallback** (§7) missing
  - **Log-flow copy-yesterday** (§10) added as a named affordance
  - Minor M1-M5: Next.js 16 stability footnote, edition-number spec, ASCII rendering note, §19.1 column header fix, MSW acronym spelled out

### Plan Round 1 (commit `aa5634a`) — 2H + 2M, ALL auto-fixed

- **H1 (high)** — Offline outbox `client_id` replay idempotency contract moved from Task 5.2 → 5.1. Task 5.1 now owns the complete offline mutation path. Risk averted: first shipped offline mutation could have duplicated entries on reconnect/refresh
- **H2 (high)** — F12 refresh-and-retry interceptor moved from Task 5.2 → 2.1. `lib/auth/refresh-interceptor.ts` + `tests/integration/auth-refresh-retry.test.ts` ship in Phase 2. Tasks 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3b gained "wraps fetch via interceptor + forced-401 test" AC. Risk averted: Phase 3 first-usable milestone could have lost writes on expired sessions
- **M1 (medium)** — Task 3.2 VN smoke promoted from "Codex-review-blocking" to **MERGE-BLOCKING** for Phase 3 gate + every PR. Task 5.4 rewritten as tiered AI gate: critical-tier (5 VN + 3 Western staples) merge-blocking, advisory-tier requires named sign-off comment
- **M2 (medium)** — Preamble invariant + failure matrices reconciled (I8→3.4+5.2, I11→3.1+3.4+4.3b+5.1, F6→3.4+5.2, F12→2.1+reinforcement)

### Plan Round 2 (commit `8a0075f`) — 1H + 2M; mechanical fixed + 1 residual

- **H1-R2 (high)** — ACs in Tasks 3.2/3.3/4.1/4.2 claimed F12 coverage for multiple endpoints but named only ONE test each. Added 6 endpoint-specific forced-401 integration tests: `ai-vision-refresh.test.ts`, `ai-weekly-review-refresh.test.ts`, `log-flow-text-parse-refresh.test.ts`, `log-flow-vision-refresh.test.ts`, `library-bulk-delete-refresh.test.ts`, `library-delete-refresh.test.ts`. Matrix now backed by tests at leaf level
- **M1-R2 (medium)** — AI fixture path drift: 3.2 used `tests/fixtures/ai-accuracy/...` while 5.1 used `tests/ai-accuracy/fixtures/...`. Normalized to `tests/fixtures/ai-accuracy/...` (canonical). Task 5.1 now explicitly extends 3.2's fixture tree + loader; `critical.ts` registry is single source of truth for tiered AI gate
- **M2-R2 (medium)** — Task 2.1 is dense critical-path bottleneck. **NOT fixed per user decision**; logged as Known Residual Risk R1 with mitigation stance (above)

**Round 3 NOT run** (2-round cap per brainstorm-tomi spec honored).

### Transferable lesson candidates (distill in Step 6.6)

Not a directive — raw material for the lessons sub-agent to pick from. Pick 3–5 most valuable and write in the lessonlearned.md format:

1. **Matrix overclaim is recurrent at multiple levels.** Reconciling the top-level I/F matrix (M2 Round 1) doesn't fix the bug if the per-AC claims under each matrix entry still overclaim (H1-R2 Round 2). Verify claim-to-test correspondence at leaf level, not just aggregate.
2. **Idempotency contracts must ship WITH the infrastructure that consumes them.** Splitting offline-outbox (5.1) from replay-idempotency (5.2) created a duplicate-entry corruption window that would have merged first.
3. **Auth-refresh contracts belong in auth middleware, not Phase 5 hardening.** Every write-heavy Phase 3 is a first-usable gate that can't safely ship without session-recovery semantics.
4. **Fixture path drift is catchable at commit-1.** "Shares the fixture loader" + different paths = bug; don't wait for a future round to surface it.
5. **Dense critical-path bootstrap tasks can be accepted with an explicit mitigation contract.** Task 2.1 was not split but carries "downstream forbidden from local shims + reactive split option." That prohibition is the contract that makes density safe.
6. **Two-round adversarial review catches 2+ classes of bugs.** Round 1 fixes surface; Round 2 catches next-layer manifestations. Single-round is structurally insufficient on Complex plans.
7. **Single-owner projects favor density over split.** The 2.1a/2.1b coordination overhead exceeds the critical-path cost when one person owns everything. Judgment flips at team scale.
8. **The "merge-blocking vs advisory" distinction matters for AI accuracy gates.** "Codex-review-blocking not merge-blocking" lets the core logging behavior drift silently — promote to merge-blocking at the first-usable gate for any path the user directly experiences.

---

## Step 6.6 Instructions: Lessons Write-Back

### Target file

`~/.claude/lessonlearned.md` — **APPEND only, never overwrite.**

### Skip condition check

NOT applicable — Codex had non-zero Critical + Suggestion findings both rounds (design 35; plan 7). Lessons MUST be written.

### Entry format (per brainstorm-tomi spec)

```
## [YYYY-MM-DD] — [Project name]

**Tech stack:** [key frameworks]

**Codex findings:** design-doc [N Critical + N Suggestion + N Minor]; plan [N rounds, N findings]

**Design Insights:**
- [distilled lesson 1]
- [distilled lesson 2]
- ...

**Planning Insights:**
- [distilled lesson 1]
- [distilled lesson 2]
- ...

**Requirements Gaps (caught late):**
- [area where initial questioning missed something]
- ...
```

### Sub-agent instructions for Step 6.6

1. Read `~/.claude/lessonlearned.md` in full to understand current format + content.
2. Read this file (`03-pre-artifacts.md`) "Codex findings raw material" section for source.
3. Read `Planning/design-doc.md` §18 (failure modes) + §19 (invariants) for design context.
4. Draft entry:
   - **Date:** 2026-04-18
   - **Project:** Kalori (AI-first calorie tracker, PWA)
   - **Tech stack:** Next.js 16 + React 19 + Supabase + Gemini + Vercel + Playwright + Sentry
   - **Codex findings:** design-doc 35 (10C + 20S + 5M); plan 2 rounds (Round 1: 2H + 2M; Round 2: 1H + 2M)
   - **Design Insights:** distill 3–5 from design-doc findings + the transferable lesson candidates above (focus on transferable patterns, not Kalori-specific facts)
   - **Planning Insights:** distill 3–5 from plan findings
   - **Requirements Gaps:** list areas where brainstorm questioning missed (e.g., prompt injection, auth refresh timing, fixture layout conventions, matrix claim verification depth)
5. APPEND to `~/.claude/lessonlearned.md` (Read first, then Edit to add at end, OR Read → full content → Write with append — use Edit for precision).
6. Commit with message: `lessons: append Kalori brainstorm insights (design + plan Codex findings)`
7. Update `Planning/brainstorm-state.md` position: `lessons_written` (new intermediate state before `artifacts_complete`).

### Quality bar for lessons

- Transferable to future projects, not Kalori-specific facts
- Each lesson has a "why this is load-bearing" framing — reader understands the consequence, not just the rule
- No duplication with existing entries in `lessonlearned.md`

---

## Step 6.7 Instructions: Sequential Artifact Creation

### Core rules

1. **6 artifacts remaining** (`tasks.md` is #4 and already exists — skip it)
2. **ONE AT A TIME** — never parallelize across artifacts
3. **All sub-agents spawned with `model: "opus"`** per brainstorm-tomi overrides
4. **Dependency order** — respect the sequence below; later artifacts depend on earlier
5. **After each artifact:** sub-agent reports, main agent commits, moves to next
6. **NO per-artifact Codex review** — artifacts are derived from Codex-reviewed sources (design-doc + tasks.md)
7. **State save:** after artifact #7 (CHANGELOG.md), sub-agent updates `brainstorm-state.md` position to `artifacts_complete`

### Artifact 1 — `Planning/PRD.md`

**Sub-agent model:** opus

**Reads (in order):**
1. `03-pre-artifacts.md` (this)
2. `02-pre-plan.md`
3. `Planning/kalori-project-blueprint.md`
4. `Planning/design-doc.md` (full — §2 success metrics, §3 critical flows, §10 screen specs)
5. `Planning/tasks.md` (for acceptance-criteria cross-references)

**Required sections:**
- **Overview** — one-paragraph product summary
- **User personas** — single-user but detailed; include Vietnamese-nutrition primary use case from blueprint
- **Core features** (from blueprint §3; all "Yes" rows in the MVP matrix):
  - Onboarding (8-step)
  - Text log (Gemini parse)
  - Photo log (Gemini vision)
  - Library log (saved items)
  - Confirmation screen with "Why these numbers?"
  - Dashboard (chronometer, macros, meals, water, micros, insight)
  - Water tracker (+glass/+bottle)
  - Progress view (5 chart sections)
  - Weight log + auto-recalc target
  - Auto/manual target override
  - Undo toast (5s)
  - Weekly AI review (7-day cache)
  - Data export (CSV + JSON)
  - Account delete
- **Anti-scope** (from blueprint §3)
- **Post-MVP nice-to-haves** (explicit out-of-scope list)
- **Success metrics** (from design-doc §2 — Gemini cost <$0.05/DAU, Lighthouse >90, RLS verified, undo reliable)
- **Technical constraints** (PWA-only, dark-only, single-user, no third-party analytics beyond Sentry)
- **Risks** — summarize 3 major risks from blueprint + R1 carryover
- **Acceptance criteria** — reference `tasks.md` for task-level ACs

**Quality bar:**
- Exhaustive MVP feature coverage
- Each feature has goal + user flow + data model implication + invariant reference (I1–I12 where relevant)
- Cross-references `architecture.md` + `ui-design.md` by name (not yet created — forward references acceptable)
- No implementation code

**Commit:** `artifact: PRD.md -- Kalori product requirements`

---

### Artifact 2 — `Planning/architecture.md`

**Sub-agent model:** opus

**Reads:**
1. `03-pre-artifacts.md`
2. `Planning/design-doc.md` §5–7 (state management + architecture)
3. `Planning/tasks.md` (files referenced across tasks — extract the full file layout)
4. `Planning/PRD.md` (just-created)

**Required sections:**
- **System overview** — architecture diagram in prose; Next.js 16 + Supabase + Gemini topology; deployment (Vercel + Supabase cloud)
- **Full Supabase DDL** for all 7 tables:
  - `profiles`
  - `food_entries` (with `client_id uuid UNIQUE` per I11)
  - `food_library_items`
  - `weight_log`
  - `water_log`
  - `ai_response_cache`
  - `ai_call_log`
- **RLS policies** — 4 verbs (SELECT/INSERT/UPDATE/DELETE) × 5 user-owned tables = 20 policy statements
- **Storage bucket policies** — `food-thumbnails` bucket SQL per Task 3.1 Storage amendment
- **Folder structure** — full `app/` layout with route groups `(marketing)`, `(auth)`, `(app)`
- **Route map** — all API routes (`/api/ai/text-parse`, `/api/ai/vision`, `/api/ai/weekly-review`, `/api/profile/save`, `/api/entries/save`, `/api/water/log`, `/api/weight/log`, `/api/library/merge`, `/api/library/bulk-delete`, `/api/library/[id]/update`, `/api/library/[id]/delete`, `/api/export/csv`, `/api/export/json`, `/api/account/delete`)
- **Cache-tag constants** (`lib/cache/tags.ts` full spec): `TAGS.userEntries(uid, day)`, `TAGS.userLibrary(uid)`, `TAGS.profile(uid)`, `TAGS.weeklyReview(uid, weekStartOn)`, `TAGS.userProgress(uid, range)`
- **Route Handler patterns** — auth wrapper + F12 interceptor wrapper + client_id enforcement + Zod validation + cost-log insertion
- **Gemini prompt storage** (`lib/ai/prompts.ts`) — template versioning convention
- **ESLint rules** — I12 cache-tag constants; I3 server-only Gemini key
- **`client_id` enforcement pattern** — DB unique constraint + route handler idempotency check

**Quality bar:**
- Every invariant I1–I12 maps to an architecture decision
- DDL is complete + production-ready (can be pasted into Supabase SQL editor)
- RLS policies cover all 4 verbs on every user-owned table
- File layout matches Task numbers in `tasks.md` (cross-check)

**Commit:** `artifact: architecture.md -- full DDL, RLS, folder structure, route map`

---

### Artifact 3 — `Planning/ui-design.md`

**Sub-agent spawn pattern:** MULTI-SUB-AGENT per `ui-design-team.md` (Complex UI → 4–6 sub-agents)

Kalori is Complex UI. Spawn **6 parallel opus sub-agents**, one per component area. Main agent synthesizes.

**Sub-agent areas (each reads design-doc + mockup + this file):**
1. **Agent 1 — Design tokens + typography + color + shape system** (design-doc §8 + mockup direction-1-editorial tokens.css)
2. **Agent 2 — Navigation system** (sidebar + tablet rail + mobile bottom-tab + FAB; responsive breakpoints)
3. **Agent 3 — Dashboard components** (masthead, chronometer ring, macro bars, meals bulletin, water tracker, micronutrient panel, weekly insight card)
4. **Agent 4 — Log flow + confirmation + undo** (3-tab modal, Type/Snap/Library tabs, confirmation screen with "Why these numbers?", undo toast LIFO patterns)
5. **Agent 5 — Library + food detail + merge** (4-col ruled grid, search/filter/sort, merge dialog per-field picker, thumbnail letter-mark)
6. **Agent 6 — Progress + charts + micronutrient heatmap + weekly review island** (5 chart sections, heatmap 7×30 signature view, PPR Suspense island)

**Each sub-agent reads:**
- `03-pre-artifacts.md` (this)
- `Planning/design-doc.md` §8–10 (component specs for their area)
- `Planning/brainstorm-context/01-pre-design.md` (mockup decisions)
- `Design/mockups-brainstorm/direction-1-editorial/index.html` (visual reference)
- `Design/mockups-brainstorm/direction-1-editorial/brief.md` (specs)

**Each sub-agent outputs** a markdown fragment for their area. Main agent assembles into `ui-design.md` in this order:
1. Overview
2. Design tokens (Agent 1)
3. Navigation (Agent 2)
4. Screen-by-screen component specs (Agents 3–6)
5. Motion system (from Agent 1)
6. Accessibility rules (from all agents — consolidate)
7. Screen inventory (from all agents)

**Required sections (assembled):**
- **Token dictionary** — all 12 colors + 3 typefaces + spacing scale + radii
- **Component spec per screen family** — variants, states, animations, responsive behavior per component
- **Responsive behavior** — 3 breakpoints (375 / 768 / 1280) per component
- **Motion system** — timing (120–180ms), easing, reduced-motion fallbacks (crossfade only)
- **Accessibility rules** — 2px focus rings, 44×44 tap targets, WCAG AA contrast, keyboard shortcuts (`/`, `n`)
- **Screen inventory** — list of every screen with its component composition

**Quality bar:**
- Each component has: variant list + state list + props interface + responsive breakpoints + motion spec + a11y notes
- Every design-doc §8–10 element is represented
- Zero hardcoded colors in specs — reference token names
- Mockup direction-1-editorial is the single visual reference

**Commit:** `artifact: ui-design.md -- The Ledger component specs (6-agent synthesis)`

---

### Artifact 4 — `Planning/tasks.md`

**ALREADY EXISTS. Codex-reviewed across 2 rounds. Skip this artifact in Step 6.7.**

If during Step 6.7 any newly-created artifact (PRD, architecture, ui-design) introduces a name or path that tasks.md should cross-reference, apply surgical Edit operations only. DO NOT rewrite. DO NOT trigger a new Codex round.

Verify before moving to Artifact 5: all forward references in tasks.md (e.g., `(pending Step 6.7)` in Reads fields) now point to files that exist.

---

### Artifact 5 — `Planning/testing-strategy.md`

**Sub-agent model:** opus

**Reads:**
1. `03-pre-artifacts.md`
2. `Planning/design-doc.md` §13 (testing matrix)
3. `Planning/tasks.md` (extract every test file referenced across all 26 tasks — this is the full fixture + test inventory)
4. `Planning/architecture.md` (for ESLint rules + RLS policies — test scaffolding)

**Required sections:**
- **Full test matrix** — expanded from design-doc §13
  - Unit (Vitest) — pure logic, nutrition math, parsers, normalizers, cache keys
  - Component (Vitest + Testing Library) — client components, optimistic rollback
  - Integration (Vitest + MSW) — Route Handlers, cache-tag round-trips, F12 forced-401 paths (7 tests)
  - RLS (Playwright) — 8 tables × 4 verbs = 32 assertions + Storage bucket assertions
  - E2E (Playwright) — ~10 flows
  - Visual (Playwright screenshots) — 6 screens × 3 breakpoints = 18 baselines
  - Accessibility (@axe-core/playwright) — on every E2E
  - Lighthouse (advisory ≥90 mobile)
  - AI accuracy (Vitest snapshots) — tiered (critical merge-blocking, advisory named sign-off)
- **Fixture organization** —
  - `tests/fixtures/ai-accuracy/` — VN + Western + photo fixtures; `critical.ts` registry
  - `tests/fixtures/rls/` — 2-user fixture from Task 1.2
  - `tests/fixtures/seed/` — 14-day dev data
- **Fixture loader utility spec** — shared across 3.2 smoke + 5.1 regression
- **CI gate definition per level** — blocking vs advisory matrix
- **Playwright config** — browsers (Chromium primary; Firefox + Safari for visual only), breakpoints, parallel workers, retry count
- **MSW handler patterns** — what to mock (Gemini API, Supabase Storage), what NOT to mock (Supabase DB — use RLS against real DB)
- **Coverage targets** — ≥70% unit branch coverage
- **AI accuracy gate tier spec** — critical fixtures (5 VN + 3 Western staples) merge-blocking; advisory tier requires named sign-off comment from project lead
- **Mutation-evidence principle** — tests must fail when code is transiently broken; phase-level Testing Sweep validates
- **RLS test harness setup** — 2-user fixture with separate auth tokens; shared across all RLS assertions

**Quality bar:**
- Every task in tasks.md has test level requirement matched
- CI config is executable (GitHub Actions YAML skeleton)
- Fixture tree is canonical (matches 3.2 + 5.1 as reconciled in Codex Round 2)
- F12 endpoint tests (7 total — list exhaustively) all appear

**Commit:** `artifact: testing-strategy.md -- full test matrix, fixtures, CI gates`

---

### Artifact 6 — `Planning/progress.md`

**Sub-agent model:** opus (but content is mostly scaffolding)

**Reads:**
1. `03-pre-artifacts.md`
2. `Planning/tasks.md` (full task list)
3. `Planning/brainstorm-state.md` (for R1 residual)

**Required sections:**
- **Header** — "Kalori Progress — Phase/Task Tracker" + template usage instructions (update after every task completion per user's CLAUDE.md)
- **Known Residual Risks (carryover from `tasks.md` preamble)** — R1 listed at top so execution cannot forget it
- **Phase 1 — Foundation** — 5 task entries (1.1, 1.2, 1.3, 1.4, 1.5); each with:
  - Status: Not Started | In Progress | Blocked | Done
  - Timestamp (completion)
  - Files changed (list)
  - Tests added/modified (count)
  - Notes
- **Phase 2 — Auth + Onboarding** — 4 entries (2.1, 2.2, 2.3, 2.4)
- **Phase 3 — Dashboard + Log** — 7 entries (3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7)
- **Phase 4 — Library + Progress** — 6 entries (4.1, 4.2, 4.3a, 4.3b, 4.5, 4.6)
- **Phase 5 — Polish + PWA** — 4 entries (5.1, 5.2, 5.3, 5.4)
- **Per-phase Codex findings log** — empty placeholder per phase for tracking Codex Review task outcomes
- **Per-phase Testing Sweep outcome** — empty placeholder per phase
- **Change log pointer** — references `CHANGELOG.md`

**Quality bar:**
- All 26 tasks listed with correct numbers + short titles (match tasks.md task names exactly)
- R1 residual prominent at top
- Template is immediately usable — no further editing needed to start Phase 1 Task 1.1

**Commit:** `artifact: progress.md -- initial tracking template with R1 residual`

---

### Artifact 7 — `Planning/CHANGELOG.md`

**Sub-agent model:** opus (minimal)

**Reads:**
1. `03-pre-artifacts.md`
2. `Planning/brainstorm-state.md` (for git history of planning phase)

**Required sections:**
- **Header** — "Kalori CHANGELOG" + format reference per user's CLAUDE.md: `## [Date] - Brief Description` with **Type** (ADD/FIX/CHANGE), **Files affected**, **Description**, **Related task**
- **Planning phase entries** (backfilled from git history):
  - `2026-04-18` — BRAINSTORM: Kalori project kickoff (blueprint + mockups)
  - `2026-04-18` — DESIGN: Design doc Codex review complete (10C + 20S + 5M)
  - `2026-04-18` — PLAN: Implementation plan written (26 tasks, 5 phases)
  - `2026-04-18` — PLAN: Codex Round 1 findings resolved (H1 offline replay, H2 auth refresh, M1 AI gate, M2 matrices)
  - `2026-04-18` — PLAN: Codex Round 2 findings resolved (endpoint F12 tests, fixture path); R1 residual logged
  - `2026-04-18` — ARTIFACTS: Step 6.7 complete (PRD, architecture, ui-design, testing-strategy, progress, CHANGELOG)
- **Empty placeholders per phase** (populated during execution):
  - `## Phase 1 — Foundation` — empty; one entry per task completion
  - `## Phase 2 — Auth + Onboarding`
  - `## Phase 3 — Dashboard + Log`
  - `## Phase 4 — Library + Progress`
  - `## Phase 5 — Polish + PWA`

**Quality bar:**
- Planning-phase entries are accurate (match git history)
- Format matches user's CLAUDE.md Normal Mode workflow
- Forward-appendable (no structure that forces reshuffling)

**Commit:** `artifact: CHANGELOG.md -- initial template, backfilled planning-phase entries`

---

## State save after Step 6.7 completes

After all 6 artifacts are created + committed (7 artifacts total counting tasks.md), final sub-agent:

1. Update `Planning/brainstorm-state.md`:
   - Frontmatter `position: artifacts_complete`
   - Current position description: `artifacts_complete — all 7 Complex-tier artifacts exist in Planning/. Next action: USER says "start tasks" to begin Phase 3 execution of tasks.md.`
   - Add artifacts to git-artifacts list with commit hashes
2. Commit: `state: artifacts_complete -- all 7 planning artifacts exist, ready for execution`

## Final deliverable list (after Step 6.7)

The user will have:

| File | Origin |
|---|---|
| `Planning/PRD.md` | Step 6.7 #1 |
| `Planning/architecture.md` | Step 6.7 #2 |
| `Planning/ui-design.md` | Step 6.7 #3 |
| `Planning/tasks.md` | Step 6 + Codex Round 1 + Round 2 |
| `Planning/testing-strategy.md` | Step 6.7 #5 |
| `Planning/progress.md` | Step 6.7 #6 |
| `Planning/CHANGELOG.md` | Step 6.7 #7 |
| `Planning/design-doc.md` | Step 5.5 (pre-this-session) |
| `Planning/kalori-project-blueprint.md` | baseline |
| `Planning/brainstorm-context/01-pre-design.md` | Step 4.6 (pre-this-session) |
| `Planning/brainstorm-context/02-pre-plan.md` | Step 5.5 (pre-this-session) |
| `Planning/brainstorm-context/03-pre-artifacts.md` | this file |
| `Planning/brainstorm-state.md` | position: `artifacts_complete` |
| `Design/mockups-brainstorm/direction-1-editorial/` | selected mockup direction (earlier) |

Plus the `~/.claude/lessonlearned.md` append from Step 6.6.

## What happens AFTER Step 6.7

Per brainstorm-tomi: the user says **"start tasks"** to begin execution. At that point:
- Normal Mode / Task Execution Mode kicks in per user's CLAUDE.md routing table
- First task is Phase 1 Task 1.1 (Scaffold Next.js 16 + Tailwind v4 + shadcn + CI + Sentry)
- TDD-first per every task's Canonical TDD Mandate
- Per-phase gates enforce Codex Review + Phase Testing Sweep

**DO NOT start execution in Step 6.7.** Step 6.7 ends when artifacts exist + state is `artifacts_complete`. User explicitly authorizes execution with "start tasks."

---

## Git state at this checkpoint

| Commit | Description |
|---|---|
| `6179495` | baseline — blueprint, design brief, 4 mockup directions, `.gitignore` |
| `1610aee` | design-doc Critical + Suggestion fixes + brainstorm state (earlier) |
| `1238906` | design-doc Minor fixes (M1-M5) |
| `6b86801` | pre-plan checkpoint (`02-pre-plan.md`) + state pointer |
| `80fe86d` | **Step 6 — tasks.md first draft** (26 tasks, 5 phases) |
| `aa5634a` | **Step 6.5 Codex Round 1 auto-fixes** (H1 + H2 + M1 + M2) |
| `8a0075f` | **Step 6.5 Codex Round 2 auto-fixes** (endpoint F12 tests, fixture path, R1 residual) |
| `3236945` | **state transition** to `plan_complete` |
| (pending this commit) | `03-pre-artifacts.md` + state pointer update |

---

## Known deferred items (for Step 6.7 awareness)

Carry these through artifact creation; they are deferred implementation decisions (NOT pre-lockable in artifacts):

- **TanStack Query inclusion** — decided during Phase 3 execution. Default: Server Actions + `updateTag`. Add TanStack only if cross-component client-cache coordination emerges
- **`edition_number` masthead** — computed server-side from `profiles.created_at` + user timezone; implementation in Phase 3 Dashboard (Task 3.5)
- **Cold-start latency on Vercel free tier** — accepted MVP constraint; revisit in Phase 5 polish
- **Post-MVP items** — light mode, Apple OAuth, command palette, named meal templates, streak celebrations, household accounts, barcode scanning, exercise logging, Apple Health/Google Fit; NOT in any artifact's scope

---

**End of pre-artifacts checkpoint.**

Next: fresh-session Claude reads `brainstorm-state.md` + this file, executes Step 6.6 (Lessons Write-Back), then Step 6.7 (6 artifacts sequentially). Target end state: `artifacts_complete`, user says "start tasks."
