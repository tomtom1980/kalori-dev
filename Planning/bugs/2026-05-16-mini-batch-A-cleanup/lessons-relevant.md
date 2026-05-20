# Lessons relevant — mini-batch A cleanup

Filtered from `~/.claude/lessonlearned.md` for keywords (env-loader, sessionStorage, security, PNG decode, sharp, Zustand, sort default, lint, ESLint, fixture, prod-gate, CRLF, `.env.local`) and tags (bugfix-tomi / superpowers-exec-tomi / project: kalori). Highest priority: the 6 bullets just appended at end of parent batch.

Theme: parent-batch reaffirmed that wave/sub-agent GREEN ≠ project sweep GREEN, that CI-gated E2E env signatures must be classified before crying RED, that fixture/env loaders are first-class footguns, and that prod-gating fixture bypasses cleanly mirrors existing `KALORI_SKETCH_DISABLED` shape.

---

## From parent batch (2026-05-16-library-overhaul — Session Log row + recent bullets)

- **[2026-05-16] Wave-internal test suite GREEN ≠ project sweep GREEN; only the full project-wide audit catches cross-wave invariant violations (focus-ring tokens, nav-audit pragmas, schema-drift hash markers).** Wave sub-agents must run project-wide invariant tests (`focus-ring-token.test.ts`, `nav-audit.test.ts`, `schema-drift/generated-types-fresh.test.ts`) before reporting completion. For mini-batch A: each item must run its scoped tests + the relevant project-wide ones (lint, types-fresh) before signaling done. (source: bugfix-tomi · project: kalori)

- **[2026-05-16] CAS UPDATE `.lt('attempt_count', MAX)` is NOT atomic — both concurrent workers satisfy the loose bound and BOTH fire side-effects; true CAS requires `.eq('attempt_count', preflight_value)` to pin the stale read so the loser's UPDATE affects 0 rows.** Relevant to PNG decode cap (M1) only insofar as that surface is the same `sketch-pipeline.ts`; the cap is sequential within a worker so atomicity isn't at risk, but the same surface's existing CAS contract MUST NOT regress while editing. (source: bugfix-tomi · project: kalori — Codex R2 finding)

- **[2026-05-16] Wave / cluster sub-agents implementing per-bug fixes MUST receive project-wide audit + contract files in their briefing (focus-ring tokens, nav-audit pragmas, schema-drift hash markers, design-system token allowlists), not only the bug-scoped Reads list.** For mini-batch A: each implementation sub-agent must receive at minimum the env-loader file path, the sketch-pipeline file path, the image-client file path, and the relevant test files + ESLint config so the unused-var fix doesn't drift. (source: bugfix-tomi · project: kalori)

- **[2026-05-16] Phase Testing Sweep that classifies a LOCAL E2E mass-fail with auth-fixture env signature MUST check it against the by-design CI-gated pattern before reporting RED — same-class signature (`admin.createUser failed: Invalid API key` from `tests/e2e/fixtures/auth.ts`) on a missing `SUPABASE_TEST_*` set is CI-DEFERRED, not RED.** Directly relevant to F-LIBOVR-E2E-INFRA-DRIFT: the env-loader changes must STILL allow CI-DEFERRED classification when LOCAL env is missing test fixture vars. The prod-ref refuse guard should fire BEFORE the missing-env classification path. (source: superpowers-exec-tomi · project: kalori-mvp-stabilization)

## From earlier work (relevant)

- **CI env parity is non-negotiable.** Phase-close "N/N passing" from local `.env.local` is false green when CI omits the same vars. Run `pnpm test:ci` profile at every phase close AND pre-push. Apply to F-LIBOVR-E2E-INFRA-DRIFT verification: the env-loader strip + prod-ref guard need to be tested both with and without CRLF artifacts and with/without prod ref input. (source: kalori)

- **React 19 + SSR + sessionStorage persistence requires `useSyncExternalStore` two-phase pattern.** F-LIBOVR-BUG7B-LOGMODAL-SORT touches a Zustand-backed sort store — if it crosses an SSR boundary the same hydration-mismatch trap applies. Verify whether the log-modal renders client-only or has an SSR shell before picking option (a). (source: kalori)

- **`npx tsc --noEmit` GREEN is a smoke test, not a verification gate — for E2E specs touching middleware-redirected routes, only a headed Playwright run against a real dev server proves the chosen route renders the asserted observable.** F-LIBOVR-E2E-INFRA-DRIFT involves env-loader changes, not spec rewrites — but if the guard's behavior is asserted via E2E (rather than unit), the CI-deferred path still applies; unit tests over the loader function are the right verification gate. (source: superpowers-exec-tomi · project: kalori)

- **Test fixtures that skip on auth-redirect MUST include a never-skipping canary that probes the OPPOSITE direction.** Relevant when the prod-ref-refuse guard fires: the test ASSERTING the guard fires must itself be a positive-direction assertion (i.e. fixture refuses + throws / logs) — not a silent-skip pattern that an auth-guard regression could falsely pass. (source: bugfix-tomi · project: kalori)

- **Cache-invalidation string literals are a silent-staleness bug surface; typed tag constants + ESLint ban on string-literal `cacheTag`/`updateTag` args.** Not directly applicable to mini-batch A items, but the same anti-pattern shape (ESLint guard against drift) lives in mind for items #1 (env-key strings) and #3 (env-var name strings — consider exporting a constant or using a typed env helper rather than inline `process.env.KALORI_SKETCH_FIXTURE_BASE64`). (source: kalori brainstorm)
