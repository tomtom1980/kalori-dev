# Bug 3: Mobile-feel animation / motion drift from Framer Motion + LazyMotion prescription

## Classification
needs_debug_shallow

## Root Cause
The prescribed motion foundation does not exist. `Planning/ui-design.md` §2.6 (lines 217-228) and §6 (line 654) mandate `framer-motion` with the **`LazyMotion + m`** pattern and a shared `lib/motion/defaults.ts` exporting `EASE_EDITORIAL`, `motion.{micro,standard,expressive,chrono,pageTurn}`, and `variants.{inkFade,emberPulse,pageSettle}`. In the actual codebase: (1) `framer-motion` is NOT in `package.json` dependencies, (2) `lib/motion/` contains ONLY `reduced-motion-audit.ts` (a vitest-only scanner — never imported at runtime per its own header comment), (3) every animation in the app — log row enter/exit, modal open, wizard step, skeleton pulse, drop cap, chart tooltip, mobile log enter/exit, focus rings — is hand-rolled CSS `@keyframes` in `app/globals.css` (35+ keyframe rules, lines 280-803) and `Design/tokens.css`. The "mobile feel" complaint is structural: CSS `@keyframes` cannot do interruptible spring physics, gesture-driven animation, layout/`AnimatePresence` exit, or `layoutId` shared-element transitions — all of which Framer Motion provides and the spec assumes. Reduced-motion IS honored via `@media (prefers-reduced-motion: reduce)` overrides + `html[data-reduce-motion='1']` mirror selectors (the audit script enforces this), so the a11y floor is intact — but the prescribed library + pattern is missing entirely.

## Proposed Change (Diff Outline)
- `package.json`: add `framer-motion` (or `motion` v12) to dependencies; lock to a version compatible with React 19.2
- `lib/motion/defaults.ts` (NEW): export `EASE_EDITORIAL`, durations object `{ micro: 120, standard: 220, expressive: 320, chrono: 600, pageTurn: 280 }`, variants `{ inkFade, emberPulse, pageSettle }`, plus `useReducedMotionVariants(variants)` helper that respects `useReducedMotion()` from framer-motion
- `app/layout.tsx` (or root client boundary): wrap children in `<LazyMotion features={domAnimation} strict>` so every consumer is forced through `m.*` not `motion.*`
- ESLint rule (incremental): forbid `import { motion }` from framer-motion repo-wide; only `m`, `LazyMotion`, `AnimatePresence`, hooks allowed
- **Migrate the high-impact mobile surfaces FIRST** (deferred to implementation phase by importance):
  - `components/log-flow/*` (modal open/close + step transitions) — use `m.div` + `AnimatePresence` to replace `kalori-wizard-step-enter` + `kalori-log-enter-mobile` keyframes
  - Dashboard log row enter/exit (`kalori-log-enter-mobile/exit-mobile`) — replace with `<AnimatePresence>` over a `m.li`, plus stagger via `lib/motion/dashboard-choreography.ts` (already specced)
  - Modal/Drawer surfaces using `@radix-ui/react-dialog` — wrap content in `m.div` for spring-based slide + scale (current CSS keyframes do linear opacity + translate only)
- Keep ambient CSS surfaces (skeleton shimmer, focus ring transition, hairline color crossfades) as CSS — these are not "interactions" and Framer adds no value
- All new `m.*` consumers: pass `transition` from `lib/motion/defaults.ts`; honor `useReducedMotion()` via the helper

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\package.json`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\motion\defaults.ts` (NEW)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\layout.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\log-flow\*` (modal + steps; exact files TBD by impl agent)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\dashboard\*` (log row enter/exit)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\globals.css` (remove migrated keyframes; keep ambient ones)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\eslint.config.*` (no-restricted-imports)

## TDD Required
yes — `lib/motion/defaults.ts` reduced-motion helper requires a unit test (mock `useReducedMotion`, assert returned variants collapse to opacity-only). Per-component migration: visual-regression via Playwright for the migrated surfaces; existing `tests/integration/reduced-motion-audit.test.ts` keeps the CSS audit honest for whatever stays in CSS.

## Test Approach
- Unit (vitest): `useReducedMotionVariants` returns opacity-only when `useReducedMotion()` is true; returns full transform variants when false
- Unit (vitest): `lib/motion/defaults.ts` exports the contracted shape (`motion.micro`, `variants.inkFade`, etc.) — guards against silent contract drift
- Playwright visual-regression at 375px / 768px: log modal open + step transition + log row enter at all 3 breakpoints
- Playwright reduced-motion baseline (`tests/screenshots/reduced-motion/`) re-baseline once migration lands
- Bundle-budget check (`scripts/check-bundle-budget.mjs`) — assert `LazyMotion + m` keeps initial JS under existing budget; full `motion` import would blow it

## Risk Assessment
high — adding a runtime dependency, replacing the foundation of every animated surface, and re-baselining visual screenshots is wider than typical bug-fix scope. Recommend implementation-phase split into (1) install + defaults + LazyMotion wrapper + ESLint rule (foundation, low risk), (2) modal + log row migration (high-impact), (3) deferred surfaces (next bundle).

## Regression Sweep Needed
- Every animated surface at 375 / 768 / 1440px viewports
- `tests/screenshots/reduced-motion/` baseline re-capture
- A11y regression: focus management during `AnimatePresence` exit (Radix Dialog already handles focus; verify `m.div` exit doesn't trap focus)
- Bundle budget (`pnpm check:bundle-budget`)
- Existing `reduced-motion-audit.test.ts` — must still pass (CSS audit covers ambient surfaces)

## UI Touching
true

## Quick-Pick Citation
- `web-ui-guide.md` line 18: "Page/route transitions, layout animations | Motion (Framer Motion) ⚛ | ~32 KB | Declarative API"
- `web-ui-guide.md` line 52: "tradeoff is bundle size (~32 KB), which can be mitigated with `LazyMotion` (4.6 KB initial, rest lazy-loaded)"
- `web-ui-guide.md` line 571: "Motion: Use `LazyMotion` + `m` components to defer feature loading (4.6 KB initial, 15–25 KB lazy)"
- `web-ui-guide.md` line 578: "Motion: `<MotionConfig reducedMotion=\"user\">` disables transform/layout animations while keeping opacity fades"

## Design-Doc Edits Required
none — enforce existing spec. `Planning/ui-design.md` §2.6 already prescribes the exact shape; the codebase simply never adopted it. One **clarification** to add post-fix: explicit list of which surfaces are CSS-ambient vs Framer-driven (currently all CSS — ambiguous which were intended).

## Open Questions
1. Use legacy `framer-motion` package or new `motion` package? Spec says "Framer Motion" but the new package is the maintained successor (web-ui-guide line 48). Recommend `motion` v12 — same API, future-proof.
2. Migrate ALL CSS keyframes in this bug-bundle scope, or only the high-impact mobile surfaces (modal + log rows + wizard steps) and defer ambient ones (skeleton, drop-cap) to a follow-up? Recommend the latter — keep this bug fix scoped, file follow-ups for the rest.
3. Does `next/dynamic` boundary at `LogModal` (per ui-design.md §6 line 656) interact with `LazyMotion`? Need to verify the dynamic-imported modal code-splits correctly with `m.*` references.

---

## STOP-THE-WORLD FLAG

**Foundation is missing.** The bug description "doesn't feel like a real mobile app" maps to absent infrastructure, not drift in existing infrastructure. Implementation will be substantially larger than a typical bug fix:
- 1 new dependency
- 1 new module (`lib/motion/defaults.ts`)
- ESLint rule + repo-wide compliance
- ≥3 component-family migrations (modal, log rows, wizard)
- Visual-regression re-baseline

Recommend the orchestrator either (a) accept this as a high-risk single bug-fix with explicit user approval at the proposal gate, OR (b) escalate Bug #3 out of `bugfix-tomi` into a small FA so the foundation lands with proper Phase Codex Review + re-baseline ceremony. Bugs #4 (wheel picker) and #5 (FAB) likely depend on this foundation existing first — sequencing matters.
