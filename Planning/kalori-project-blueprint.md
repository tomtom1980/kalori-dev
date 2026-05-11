# Kalori — Project Blueprint

Planning context for Claude Code. Use alongside `CLAUDE.md` + `CLAUDE-planning.md` for methodology, workflows, and artifact templates. The authoritative design reference is `design/calorie-app-design-prompt.md` — this blueprint points to it rather than duplicating its contents.

---

## 1. Project Identity

| Field | Value |
|---|---|
| Project Name | Kalori |
| Project Type | Web App (AI-first nutrition tracker) |
| Target Platform(s) | Web (fully responsive), installable as PWA on iOS / Android / desktop |

**Vision Statement**

An AI-first calorie and nutrition tracker that replaces global food-database search with natural-language parsing, photo recognition, and a personal food library. Built for health-conscious adults who find MyFitnessPal and Lose It slow, ugly, and ad-bloated.

---

## 2. Detailed Product Description

### What It Does

**Core functionality:**

- Onboarding wizard captures bio sex, age, height, current weight, goal weight, activity level, region, dietary preferences, allergens, and goal pace. Calculates a personalized daily calorie target using Mifflin-St Jeor BMR → TDEE → target, with a collapsible "how we calculated this" transparency panel.
- Three unified ways to log food:
  1. **Type it** — natural-language input ("2 eggs and avocado toast") parsed by Gemini into structured items with calories, macros, and micronutrients.
  2. **Snap it** — photo upload or camera capture; Gemini Vision identifies items and estimates portions. A thumbnail (~256×256, <50kb) is retained on the resulting library entry; the original is deleted immediately after analysis.
  3. **From library** — one-click re-add from the user's personal food library, which grows from every logged item.
- Portion estimation uses the median value for the recognized food type; portion is always editable on the confirmation screen.
- Confirmation screen shows editable quantities, per-item kcal/macros/micronutrients, a "Why these numbers?" panel exposing AI reasoning, and a save-to-library toggle (default on).
- "Copy yesterday" / "copy this meal" shortcuts.
- Water intake as a first-class daily metric (+glass / +bottle, daily target, dashboard widget).
- Daily dashboard: hero calorie ring, macro bars (protein / carbs / fat), meal groups (Breakfast / Lunch / Dinner / Snacks / Drinks), micronutrient panel, water tracker, insights card.
- Progress analytics with Day / Week / Month toggle: calorie-adherence bar chart with target line, weight trajectory line chart with smoothed trend and dashed projection to goal, macro distribution stacked area, micronutrient heatmap (signature view — rows = nutrients, columns = days, cell color = % of target), logging consistency calendar.
- Personal food library with search, filter (most frequent / recent / highest protein), sort, edit (user can correct AI-generated nutrition), bulk delete, and duplicate-merge.
- Weight log with weekly prompt and on-demand entry. Target auto-recalculates on weight change with a dashboard nudge card ("Target updated to 2,040 kcal · see why").
- Calorie target has two modes: **auto** (recalculates on weight change) and **manual override** (user-locked value that ignores auto-recalc). Togglable in settings.
- Undo toast (5s) after delete or edit on any food/weight/water entry.
- Weekly AI review card: "This week you hit protein 6/7 days, iron ran low, here are three suggestions."
- Profile / settings: editable goals, units toggle (metric default / imperial), dietary prefs, allergens, region, data export (CSV + JSON), hard account deletion.

**Secondary features:**

- PWA installability (manifest + service worker).
- Client-side image compression to <500kb / 1600px max before upload.
- Gemini response caching per user (30-day TTL) keyed on normalized text hash and image content hash — latency + cost win.
- Per-user Gemini token/cost logging table for cost observability.
- Reduced-motion fallback (crossfades only) honoring `prefers-reduced-motion`.
- Backfill limit: logging can go back 30 days; anything older is read-only.

**What it explicitly does NOT do (anti-scope):**

- No global food database / search — personal library only.
- No exercise or workout logging.
- No barcode scanning.
- No social, feed, sharing, or friends features.
- No gamification beyond a lightweight streak indicator — no badges, levels, cartoon mascots.
- No marketing landing page. Public root is a minimal app-name + sign-in CTA.
- No native mobile app (PWA only).
- No multi-user or household accounts (single user per account).
- No notifications (push, email digests, reminders) for MVP.
- No Apple OAuth for MVP.
- No command palette (⌘K) for MVP.
- No light mode — dark only.

### Who Uses It

- **Primary user**: Project owner (Tamas) — AI engineer based in Da Nang, Vietnam. First and only user through MVP. Uses across devices (phone during meals, laptop for weekly review). High technical literacy, high design standards.
- **Secondary users (post-MVP, invite-only)**: Health-conscious adults 25–45 who've churned off mainstream trackers. Pay for quality.
- **Scale**: Single-digit users through MVP. Architecture supports ~10–100 invited users. Not designed for public-scale; would require redesign of AI cost model if opened.

### Why They Need It

- MyFitnessPal / Lose It are slow, ad-heavy, and force search through 10M-item databases.
- Snapping a photo or typing a sentence is an order of magnitude faster than search-and-log.
- Most people eat the same 30–50 foods on rotation — a personal library fits reality better than a global database.
- Premium users want visual polish that existing trackers don't deliver.

### User Journey

1. User visits public root, clicks "Sign in with Google" or "Email me a magic link."
2. First-time users enter the onboarding wizard (8 steps; see design brief §6.3).
3. Land on dashboard with empty state + clear "Log your first meal" CTA.
4. User logs a meal via any of the three methods, reviews the confirmation screen, saves.
5. Day accumulates. Ring fills. Micronutrients populate. Week / Month views populate after ~7 days of data.
6. Weekly AI review card surfaces on dashboard each Sunday.
7. User logs weight weekly when prompted; target auto-adjusts if in auto mode.

**Three most critical flows:**

1. Photo → logged meal in under 20 seconds end-to-end.
2. Re-log "usual breakfast" from library in one tap.
3. Dashboard first paint on start of day.

### Success Criteria

- Owner uses it daily for 30 consecutive days without reverting to a previous tracker.
- Photo-log flow completes in <15 seconds median (upload → confirmation visible).
- Gemini cost per active user per day stays under $0.05.
- Lighthouse performance score >90 on mobile.
- Undo works reliably — zero "I lost an entry" incidents.
- RLS isolation verified — two test users cannot read each other's rows on any table.

---

## 3. Features & Scope

### Must-Have (MVP)

- Supabase Auth: email magic link + Google OAuth
- 8-step onboarding wizard with Mifflin-St Jeor math and transparency panel
- Dietary preferences, allergens, and region fields in profile (feed AI prompts)
- Unit toggle: metric default / imperial
- Three-tab unified log flow (Type / Snap / Library)
- Gemini text parsing with per-user 30-day response cache
- Gemini Vision analysis: client-side compression, thumbnail retention, original deletion
- Confirmation screen with editable quantities, "Why these numbers?" panel, save-to-library toggle
- Personal food library: search, filter, sort, edit, bulk delete, merge duplicates
- Dashboard: calorie ring, macro bars, meal groups, micronutrient panel, water tracker, weekly insight card
- Water intake tracker (+glass / +bottle, daily target)
- "Copy yesterday" and "copy this meal" shortcuts
- Progress view with Day / Week / Month toggle: calorie adherence bar chart, weight trajectory with trend + projection, macro distribution stacked area, micronutrient heatmap, logging consistency calendar
- Weight log with weekly prompt and manual entry
- Auto-recalc calorie target on weight change + dashboard nudge card
- Manual target override mode (locks auto-recalc)
- Undo toast (5s) on delete/edit across all entry types
- Weekly AI review card
- Data export (CSV + JSON) from settings
- Hard account deletion (cascades all user data and storage objects)
- PWA manifest + service worker
- Reduced-motion fallback
- Full responsive design at 375 / 768 / 1280+ px breakpoints
- Dark mode only
- Sentry error tracking
- Gemini per-call cost logging table

### Nice-to-Have (Post-MVP)

- Command palette (⌘K)
- Streak / milestone Lottie celebrations
- Marketing landing page (only if app opens beyond invite-only)
- Apple OAuth
- Email digest notifications
- Named meal templates ("my usual breakfast")
- Light mode
- Multi-language (Hungarian, Vietnamese)
- Household / shared accounts
- Exercise / workout logging
- Barcode scanning
- Native mobile wrapper (Capacitor)
- Apple Health / Google Fit integration

### Explicitly Out of Scope

- Global food database search
- Social / sharing features
- Ads or ad space
- In-app purchases
- Cartoon mascots or generic "fitness app" visual tropes

---

## 4. Data, Integrations & Auth

### Data the System Handles

- **Profile**: bio sex, age, height, weight (current + full history), goal weight, activity level, region, dietary prefs (array), allergens (array), unit preference, goal pace, calculated BMR / TDEE / target, target mode (auto | manual), manual override value.
- **Food entries**: timestamp, meal category, source (text | photo | library), parent library item ref, items[] (name, portion, unit, kcal, macros, micronutrients{}, confidence), AI reasoning text.
- **Personal food library**: unique entries with default portion, nutrition profile, thumbnail URL (if photo-sourced), log count, last-used timestamp, user-edited flag, created-from source.
- **Weight log**: date, weight, optional note.
- **Water log**: date, count, unit (glass | bottle | ml).
- **AI call log**: user id, call type (text | vision | weekly-review), input hash, input tokens, output tokens, cost estimate, latency ms, timestamp, cached flag.
- **AI response cache**: hash → parsed payload → expiry (30 days).

**Volume expectations**: ~3–10 food entries / day / user; library converges around 100–300 unique items per active user in 6 months; thumbnails ~50kb each. Per-user total storage in single-digit MB.

**Sensitivity**: PII (body metrics, food intake). RLS enforced on every user-owned table. Never exposed to other users.

**Retention**: Indefinite while account active. Account deletion hard-deletes all user-owned rows + Storage objects via cascading policy.

### Authentication & Users

| Field | Value |
|---|---|
| Auth Required? | Yes |
| Auth Method | Supabase Auth — email magic link + Google OAuth |
| User Roles | Single role (no in-app admin UI; admin ops via Supabase dashboard) |
| Multi-tenancy | Single tenant per user; RLS-isolated |

### External Integrations

| Service | Purpose | MVP? |
|---|---|---|
| Supabase | Auth, Postgres DB, Storage (thumbnails), RLS | Yes |
| Gemini API (`gemini-flash-latest`) | Text parse, vision analysis, weekly review generation | Yes |
| Google OAuth (via Supabase) | Social login | Yes |
| Vercel | Hosting + API routes | Yes |
| Sentry | Error tracking | Yes |

### Content & Assets

- User-generated (food photos → thumbnails, manual corrections).
- AI-generated (parsed nutrition, reasoning text, weekly review copy).
- Static (Lotties for empty states, Lucide/Phosphor icons, PWA icon set).
- Photos: compressed client-side, analyzed server-side via Gemini Vision, thumbnail stored in Supabase Storage, original discarded immediately post-analysis.

---

## 5. UI/UX Configuration

| Field | Value |
|---|---|
| UI Type | Full responsive web UI (PWA installable) |
| Design Style | Premium dark-mode SaaS — Linear / Arc / Robinhood-inspired |
| AI Design Tool | Claude Code only |
| Accessibility Level | WCAG AA |
| Responsive Required? | All devices — 375 / 768 / 1280+ px breakpoints |

**Design source of truth**: `design/calorie-app-design-prompt.md`. Treat §4 (palette, typography, shape language) and §6 (screen inventory) as authoritative specs. This blueprint does not duplicate them.

### Design References

- Linear — density + restraint
- Arc Browser — motion delight
- Robinhood — dark-mode data viz
- Vercel dashboard — dark + data rhythm

### Content & Copy

| Field | Value |
|---|---|
| Content Source | Written during implementation |
| Tone of Voice | Confident, professional, fast. No cutesy, no exclamation marks, no hype. Factual over emotional. |
| Imagery Approach | Icons (Lucide or Phosphor Duotone, 1.5px stroke); user food thumbnails; minimal Lottie for empty states only |

### Key Screens

- **Public root** (`/`) — minimal: app name, one-line value prop, sign-in CTA. No marketing content.
- **Auth** (`/login`) — email magic link input + Google button.
- **Onboarding wizard** (`/onboarding`) — 8 steps, progress indicator, Mifflin-St Jeor results screen.
- **Dashboard** (`/`, authenticated) — hero ring, macros, meal groups, micronutrients, water, insight card.
- **Log food** (`/log`) — three-tab flow + shared confirmation screen.
- **Food library** (`/library`) — grid/list with filters, detail panel/view.
- **Progress** (`/progress`) — D/W/M toggle, all chart sections.
- **Settings** (`/settings`) — grouped list: profile, goals, preferences, data export, delete account.
- **Weight log** (`/weight`) — quick entry + history list.

All screens designed at three breakpoints. Full specs in design brief §6.

---

## 6. Priorities

| Priority | Tier |
|---|---|
| Speed to MVP | Flexible |
| Low Cost / Free Tier | Important (Supabase free + Vercel hobby + owner's Gemini key) |
| Scalability | Flexible (single-digit users through MVP) |
| Security & Privacy | **Critical** (RLS on every table, no cross-user leakage) |
| Developer Experience | Important |
| Long-term Maintainability | Important |
| Visual Polish / Design Quality | **Critical** |

---

## 7. Timeline

| Field | Value |
|---|---|
| Target MVP Date | No deadline |
| Available Dev Time | Part-time / as available |
| Milestone Expectations | Phased delivery — foundation → auth + onboarding → dashboard + log flow → library + progress → polish + PWA |

---

## 8. Technical Preferences

| Preference | Value |
|---|---|
| Primary Language | TypeScript (strict mode) |
| Frontend Framework | Next.js 15+ App Router + React 19 |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Motion | Framer Motion (primary) + Lottie (empty states / rare celebrations). Not using GSAP or React Spring. |
| Charts | Recharts for standard charts; raw SVG for calorie ring and micronutrient heatmap |
| State Management | TanStack Query (server state) + Zustand (ephemeral client state: log-flow step, modal state, undo queue) + Supabase auth context |
| Backend Approach | Next.js Route Handlers proxying Supabase + Gemini. Server-only Gemini key. |
| Database | Postgres via Supabase with RLS on every user-owned table |
| Hosting Budget | Free tier (owner's personal Gemini key) |
| Hosting Preference | Vercel (frontend + API routes) + Supabase cloud (DB + Auth + Storage) |
| Deployment Strategy | CI/CD via Vercel GitHub integration; preview deploys on PR |
| Environments Needed | Dev + Prod (no staging) |
| Domain / DNS | Vercel-assigned subdomain for MVP; custom domain optional later |
| Testing | Vitest (unit — nutrition math, Mifflin-St Jeor, cache key normalization, target calc). Playwright (E2E — onboarding completion, text-log, photo-log, RLS isolation between two test users). |
| Error Tracking | Sentry (free tier) |
| Image Handling | `browser-image-compression` client-side (<500kb, max 1600px) before upload |
| PWA | Next.js PWA plugin — manifest + service worker + offline shell |

---

## 9. Constraints & Boundaries

- Fully responsive — every screen functional at 375 / 768 / 1280+ px.
- Equal-quality input support for touch (mobile/tablet) and keyboard + mouse (desktop).
- Respect `prefers-reduced-motion`.
- Dark mode only — no light-mode code paths anywhere.
- WCAG AA minimum; min 44×44px tap targets on mobile; visible focus rings everywhere.
- RLS enforced on every table containing user data.
- Gemini API key stays server-side only — all AI calls proxied through Next.js Route Handlers.
- Photo originals deleted immediately after analysis completes; only thumbnails persist.
- All nutrition math must be transparent — "how we calculated this" panel on onboarding results and "Why these numbers?" panel on food confirmation.
- No data leaves the Supabase / Vercel / Gemini / Sentry perimeter. No third-party analytics beyond Sentry.
- Lighthouse performance >90 on mobile.
- Backfill horizon: 30 days. Older dates are read-only.

---

## 10. Starting Point

**Greenfield** — brand new project, no existing code.

**Existing resources**:

- Design brief at `design/calorie-app-design-prompt.md` — authoritative for visual and interaction spec.
- Gemini API key provided by owner during implementation.
- Supabase project: created during foundation phase.
- Vercel project: created during foundation phase.
- No existing brand guidelines — design brief is the brand.

---

## 11. Risks & Concerns

- **Gemini portion estimation accuracy** — "an avocado" ranges 150–300 kcal. Mitigation: median-value strategy for recognized foods (already decided); portion prominent and editable on confirmation screen; confidence indicator per item.
- **Gemini hallucinated ingredients** — Vision may infer oil/butter not visible in image. Mitigation: "Why these numbers?" panel exposes reasoning; user can correct inline.
- **Gemini cost drift** if app opens beyond invite-only. Mitigation: per-user cost logging table, aggressive 30-day caching on text + image hashes, soft daily cap per user enforceable later.
- **Spotty mobile connections during photo upload**. Mitigation: client-side compression + retry logic + optimistic UI with clear "still analyzing" state.
- **Vietnamese / Asian food accuracy** — owner is in Da Nang; this is the real accuracy bar. Mitigation: region field in profile feeds AI system prompt; manual test pass against bún bò, phở, cơm tấm, bánh mì, bún thịt nướng before shipping.
- **Supabase Storage costs at scale**. Mitigation: thumbnails only (<50kb); originals deleted post-analysis.
- **RLS misconfiguration leaking data between users**. Mitigation: Playwright test creates two users and asserts isolation on every table; RLS policies reviewed explicitly before prod deploy.
- **Undo queue edge cases** with rapid consecutive deletes. Mitigation: queue multiple undos; each toast handles one entry; clear queue on navigation.
- **Silent target recalc causing user confusion**. Mitigated by design: dashboard nudge card on target change.
- **Dark-mode-only accessibility** — some users genuinely need light mode. Accepted as known limitation for MVP; logged for post-MVP.
- **PWA service worker cache staleness** during rapid iteration. Mitigation: cache-bust on deploy via Next.js build hash.

---

## 12. Open Questions (For Planning Phase to Resolve)

- Full Supabase schema — tables, FKs, indexes, RLS policies. Planning phase to propose complete DDL.
- Gemini prompt templates — system prompts for (a) text parse, (b) vision analysis, (c) weekly review. Consolidate into `lib/ai/prompts.ts` for easy iteration.
- Cache key normalization for text input — lowercase + strip punctuation + sort tokens, vs. raw text. Start with normalized-sorted approach.
- Image hash algorithm — content hash (simple, fast) vs. perceptual hash (catches re-photographed meals). Start with content hash; perceptual is post-MVP.
- Exact color tokens from design brief translated into Tailwind v4 CSS custom properties.
- Gemini proxying — Next.js Route Handlers (MVP default) vs. Supabase Edge Functions (if Vercel→Gemini latency proves problematic).
- Final folder structure for the Next.js app — planning phase proposes.
- Dev seed data — small set of example food entries for visible dashboard on first dev run. Yes, include.
- Exact weekly AI review trigger — server cron vs. lazy on-dashboard-visit. Lazy-on-visit is simpler for MVP; cache result for 7 days.

---

*Ready for planning in Claude Code. Requires: CLAUDE.md + CLAUDE-planning.md. Design reference: design/calorie-app-design-prompt.md.*
