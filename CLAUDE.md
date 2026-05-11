# Kalori — Project Instructions

> **MANDATORY Session Start Protocol below. Read it and execute it BEFORE responding to the user's first message. No exceptions.**

---

## 🚨 Session Start Protocol (mandatory, blocking)

**BEFORE responding to any user message in a fresh session, execute these steps in order — even if the user's first message sounds simple or urgent.** This is how context rehydrates automatically after a reset.

### Step 1 — Read the state files (in this order)

1. **`CLAUDE.md`** (this file) — project map + protocols
2. **`Planning/setup-state.md`** — which infra is configured (Supabase / Vercel / Sentry / Google OAuth / GitHub Actions)
3. **`Planning/brainstorm-state.md`** — brainstorm-tomi phase state (should say `artifacts_complete`)
4. **`Planning/progress.md`** — **authoritative current task state** with Residual Risks at top
5. **`Planning/tasks.md`** (preamble + the specific task to work on) — canonical task definitions
6. **`Planning/CHANGELOG.md`** (last 30 entries) — what was done in the previous session

### Step 2 — Identify the current task

From `progress.md`:
- If any task has status `🔄 In Progress`, **resume that task** (read its notes field for handoff info)
- If all tasks up to task N are `✅ Completed`, **next task is N+1**
- If task N's status is `❌ Blocked`, report the blocker to the user and wait for direction
- If task N's status is `🔍 In Review`, check Codex findings in `Planning/progress.md` → per-phase Codex Findings Log, resume from there

### Step 3 — Announce the context state

In your first user-facing message, state clearly:
- Last completed task (with commit hash)
- Current task to work on (or "awaiting user: start tasks")
- Any residual risks that apply to the current task
- Any blockers or infra concerns

Example first response after a fresh session:
> "Session primed. Last completed: Task 1.1 (commit `abc123`). Current task: 1.2 — Supabase init + auth middleware shell + RLS test harness. R1 residual applies later (Task 2.1). Infrastructure fully configured per setup-state.md. Starting now."

### Step 4 — Proceed only after Steps 1–3

Do NOT skip the reads, do NOT proceed based on assumed state, do NOT ask the user "what were we doing" — the answer is always in the state files.

**Exception:** If the user's first message is "I have a question" or similar, you may answer the question first, THEN execute Steps 1–3 before any state-changing work.

---

## 🔄 Post-Task Update Protocol (mandatory, runs at every task boundary)

After completing ANY task, the execution sub-agent OR main agent MUST:

### 1. Update `Planning/progress.md`
- Set task status to `✅ Completed` (or `❌ Blocked` / `🔍 In Review`)
- Fill in `Completed:` timestamp
- List `Files changed:` (run `git diff --name-only <previous-commit>..HEAD`)
- List `Tests added:` / `Tests modified:` count
- Add `Decisions:` line with any non-obvious choices made during the task
- Add `Blockers:` if any were encountered + how resolved
- Add `Codex review outcome:` summary (count findings; auto-fixed vs deferred)
- Add `Related CHANGELOG entries:` (commit hashes)
- Refresh "Last updated" timestamp at top
- If complexity was reassessed during execution, update BOTH `tasks.md` and `progress.md` to stay in sync

### 2. Update `Planning/CHANGELOG.md`
Add one entry at the TOP of the relevant phase section per user's CLAUDE.md format:
```
### <YYYY-MM-DD> — <Brief Task Description>
**Type:** ADD / FIX / CHANGE
**Files affected:** <path list>
**Description:** <1–3 sentence dense summary of what shipped>
**Related task:** Phase N Task N.M
**Commit:** <short hash>
```

### 3. Update `Planning/setup-state.md` (only if infra changed)
If the task provisioned / modified any external service (Supabase config, Vercel env var, Sentry release config, GitHub secrets, Storage bucket), update the relevant section + Summary Table.

### 4. Commit + push
```bash
git add Planning/progress.md Planning/CHANGELOG.md [other changed files]
git commit -m "<conventional message with Co-Authored-By trailer>"
git push origin main
```

Commit message convention:
- Implementation commit: `task N.M: <verb> <what>` — e.g., `task 1.1: scaffold Next.js 16 + Tailwind v4 + CI`
- Fix commit (during Codex auto-fix): `fix: task N.M — <what>`
- Progress/docs commit (pure tracking): `docs: task N.M progress + changelog`

Always include the `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.

### 5. If this task completes a phase
- Run the mandatory Phase Testing Sweep + Codex Adversarial Review tasks (they're already in `tasks.md`)
- Update progress.md phase-level status after both pass
- Do NOT start the next phase until the phase gate closes

### 6. Save state for the next session

The commit IS the state save. Because:
- `progress.md` reflects current position
- `CHANGELOG.md` reflects what shipped
- `setup-state.md` reflects infra state
- git history is the audit trail

A fresh session opening this repo sees the current state in a single `git pull` + read of the 4 files above. No manual handoff needed.

---

## 🌊 Mid-Task Interruption Protocol (context runs out / crash / abort)

If a session is interrupted mid-task:

1. The orchestrator writes **partial progress** to `progress.md` with status `🔄 In Progress` and detailed Notes describing:
   - What step of the task was reached
   - What files were modified (even if uncommitted)
   - What the next step is
   - Any transient state (e.g., "waiting on Codex review round 2 output")
2. Any completed work is committed (even if task isn't done yet) with message `wip: task N.M — <partial>`
3. Next session's Session Start Protocol Step 2 sees `🔄 In Progress` and resumes from the notes

---

> Points to state files that tell you what's done, what's next, and what credentials exist.

## Project summary

**Kalori** — AI-first calorie/nutrition tracker (PWA, dark-only, single-user). Vietnamese nutrition primary; Western secondary. Complex-tier project: 7 planning artifacts, 26 implementation tasks across 5 phases, TDD-first execution with per-phase Codex gates.

Stack: Next.js 16 + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui + Supabase + Gemini (`gemini-flash-latest`) + Vercel + Sentry (errors-only).

Design direction: **"The Ledger"** — dark editorial archival broadsheet, oxblood `#8A2A1F` + ivory `#F4EBDC` on warm near-black `#0E0A08`, Newsreader serif + Inter + JetBrains Mono, zero-radius + hairline rules + no shadows.

## Read-on-session-start files

| File | Purpose | Read when |
|---|---|---|
| `CLAUDE.md` (this) | Project map | Always first |
| `Planning/setup-state.md` | **What infra is configured** (Supabase / Vercel / Sentry / Google OAuth / GitHub Actions) | Every session |
| `Planning/brainstorm-state.md` | Brainstorm-tomi phase state (`artifacts_complete`) | Every session |
| `Planning/progress.md` | Live task tracker with R1 residual at top | Every session — mirrors `tasks.md` |
| `Planning/tasks.md` | **Canonical 26-task plan** — task execution source | When starting any task |
| `Planning/PRD.md` | Product requirements, 14 features, goals | Feature context |
| `Planning/architecture.md` | DDL, RLS, folder structure, route map, ESLint rules | Infrastructure + backend tasks |
| `Planning/ui-design.md` | Component specs, design tokens, accessibility rules (two-pass synthesis) | UI tasks |
| `Planning/testing-strategy.md` | Test matrix, fixtures, CI config, per-task test levels | Every task (`Reads:` field drives it) |
| `Planning/design-doc.md` | **Authoritative design** — tiebreaker for conflicts | Conflict resolution |
| `Planning/CHANGELOG.md` | Per-task change log | Update on every task commit |

## Credentials (gitignored — never commit)

| File | Contents |
|---|---|
| `Planning/apikeys.txt` | Production values: Gemini key, Supabase prod + keys + DB password, Sentry prod DSN, Vercel token, Google OAuth, SENTRY_AUTH_TOKEN |
| `Planning/devapikeys.txt` | Development + preview + test values: same keys for `kalori-dev` Supabase + `kalori-dev` Sentry |

Both files listed in `.gitignore`. Auto-load env vars from these when scripting Vercel / Supabase / Sentry operations.

## Infrastructure (✅ all configured, ready for execution)

See `Planning/setup-state.md` for full detail. Summary:

- **Supabase:** `kalori-prod` (ref `dryysypycsexvlbabtwq`) + `kalori-dev` (ref `aaiohznsqlqchsoxaqkz`), both in `ap-southeast-1` (Singapore), new-format `sb_publishable_*` / `sb_secret_*` keys, Google OAuth provider enabled with redirect allowlists set
- **Gemini:** `gemini-flash-latest` API key (shared dev/prod for MVP)
- **GitHub:** Private repo `tomtom1980/kalori`, authed locally via `gh` CLI (user `tomtom1980`, scopes `repo`+`workflow`)
- **Vercel:** Project `kalori` (ID `prj_MUe9UgXliFJzK6rjNusHcZjNJvQp`, team `tamasszalay-2846` Hobby), linked to GitHub, 24 env vars across Production+Preview+Development scopes, auto-deploy configured. Production URL `https://kalori-one.vercel.app`. Function region `iad1` (Hobby constraint; cross-region to SG Supabase = ~150–200ms RTT). SSO protection enabled on preview URLs (bypass token configured during Task 1.1).
- **Sentry:** Org `kalori`, projects `kalori-prod` + `kalori-dev` (`javascript-nextjs` platform), DSNs wired to Vercel env vars per scope
- **Google OAuth:** Client `Kalori Web` in Google Cloud project `Kalori` (Testing mode, single test user), credentials configured in both Supabase Auth + Vercel
- **GitHub Actions secrets:** 6 secrets set (`SUPABASE_TEST_*`, `GEMINI_TEST_API_KEY`, `SENTRY_AUTH_TOKEN`, `VERCEL_TOKEN`) — active once `ci.yml` lands in Task 1.1

## Pre-execution delta (IMPORTANT for Task 1.1 + 1.2)

Several task steps that ASSUME unprovisioned infrastructure are now PRE-DONE. Verify state, don't re-provision:

- **Task 1.1 Step 9** "Push branch, confirm Vercel preview builds" — Vercel project + GitHub link already exist; just push and verify
- **Task 1.2 Step 2** "Provision Supabase dev project; persist URL + anon key + service-role key in .env and Vercel env vars" — ALREADY DONE. Task 1.2 just needs to write `.env.example` with the variable names (values live in `devapikeys.txt`) and apply migrations against the existing project

Task 1.1 Sentry step should use the existing `kalori-prod` + `kalori-dev` Sentry DSNs from apikeys files (no new projects needed).

Do not create new Vercel projects, new Sentry projects, new Supabase projects, or new Google OAuth clients during execution. If a task seems to require this, **verify state first via `Planning/setup-state.md` before taking action**.

## Mandatory deferred Supabase DB work (first execution tasks)

These are CONFIGURED but not yet APPLIED to the database:

- **DDL + RLS policies** — SQL in `Planning/architecture.md` §2–3, applied during Task 1.2 via `DATABASE_URL_DIRECT` (port 5432) or Supabase CLI
- **`food-thumbnails` Storage bucket + RLS** — SQL in `architecture.md` §4, applied during Task 3.1
- **`.env.example` creation** — values come from `apikeys.txt` / `devapikeys.txt`, file itself is gitignored except the example

## Coding principles (governs all tasks)

1. **Think before coding** — state assumptions, surface tradeoffs, ask if unclear
2. **Simplicity first** — minimum code, no speculative abstractions, no features not asked
3. **Surgical changes** — touch only what the task requires; don't refactor adjacent code
4. **Goal-driven execution** — TDD always, verify against acceptance criteria, loop until green

See `~/.claude/CLAUDE.md` for global rules, `~/.claude/rules/testing.md` for TDD policy, `~/.claude/rules/codex-review.md` for adversarial review policy.

## Execution flow (when user says "start tasks")

Per user's global CLAUDE.md routing table:
- "start tasks" → load `skills/project-task/SKILL.md` (if exists) OR `superpowers-exec-tomi` as fallback
- Task orchestrator reads `Planning/tasks.md` + current progress in `Planning/progress.md` + `Planning/setup-state.md` to know state
- Task complexity drives review depth per `tasks.md` preamble:
  - Small → phase-level Codex only
  - Medium → per-task Codex + Unit+Integration tests
  - Complex → per-task Codex + full test matrix per type tags
- Per-phase gates are **non-negotiable**: end-of-phase Codex Adversarial Review + Testing Sweep

**Report back to user:**
- Block on user input ONLY if: credentials missing, unrecoverable test failure, destructive action needed, or R1 mitigation contract would be violated
- Otherwise proceed autonomously per plan

## Residual risks to enforce during execution

- **R1 — Task 2.1 density.** Single critical-path task owns auth + profiles + RLS + middleware + Mifflin math + F12 interceptor. Phase 3/4 mutation tasks are **FORBIDDEN from implementing local refresh shims** — wait for Task 2.1's `lib/auth/refresh-interceptor.ts`.

## Session hand-off

See **Post-Task Update Protocol** at top — commits ARE the state save. No separate hand-off step needed if every task commits properly.

If user manually invokes `/clear` or context fills mid-task, follow **Mid-Task Interruption Protocol** at top.

---

## Orchestrator commands (user-facing)

| User says | Orchestrator action |
|---|---|
| `start tasks` | Session Start Protocol → if progress.md shows no tasks started, begin Phase 1 Task 1.1 |
| `continue tasks` | Session Start Protocol → resume from first non-✅ task in progress.md |
| `continue with plan` | Same as `continue tasks` |
| `do task N.M` | Session Start Protocol → jump to that specific task (skip earlier incomplete if user confirms) |
| `status` | Report current state from progress.md without doing any work |
| `resume brainstorm` | No-op (brainstorm is `artifacts_complete` — say so and point to `start tasks`) |
| Anything else without "tasks" | Regular conversation, but still run Session Start Protocol silently in the first turn so state is known |
