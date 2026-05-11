# Codex Round 2 — Categorized Findings

**Batch:** `2026-05-08-mobile-water-button`
**Round:** 2 (re-review after round-1 auto-fixes)
**Scope:** working-tree diff (matches round-1 scope)
**Pre-flight:** diff size 45 KB (well under 500 KB threshold), runtime ready, ChatGPT auth active
**Auto-retry signals scanned:** none detected
**Verdict:** `needs-attention`

---

## Round 1 Fixes — Verification Status (per Codex)

| Finding | Round-1 Fix | Round-2 Verdict |
|---|---|---|
| C1 — column rename + Sentry hardening on `app/(app)/layout.tsx` | Applied (column → `id`, Sentry.captureException added with UTC fallback) | **Verified present**. Codex did not re-flag the column/Sentry fix itself. |
| I1 — `router.refresh()` post-success in `components/nav/nav-shell.tsx` | Applied (success-only, post-toast push) | **Verified present**. Codex did not re-flag the refresh-on-success behavior in isolation. However, the same nav-shell file surfaced a NEW Critical (C2) on a different code path — see below. |
| I2 — kept `.skip` + followups for e2e/visual specs | Applied (`.skip` retained, followups entry added, comments enriched) | **Re-flagged as High**. Codex disputes the deferral premise — see I3 below. |

**Round 2's headline finding** is that the C1 fix only addressed ONE failure mode (schema-drift / column typo) of a broader class of bugs ("client-supplied date sent to mutation API ends up in the wrong calendar day"). The session-lifetime variant is still live.

---

## NEW Findings (round 2 only — not present in round 1)

### C2 — Critical: Water FAB can log to yesterday after midnight crossing
**Location:** `components/nav/nav-shell.tsx:161-168`
**Verbatim title:** "Water FAB can log to yesterday after a long-lived session crosses local midnight"

**Codex finding (verbatim):**
> `loggedOn` is computed once in the server layout and passed into the persistent client nav shell. The click handler then reuses that captured prop as `logged_on`; there is no recalculation at tap time and no midnight tick. A user who opens the app before local midnight and taps the mobile water FAB after midnight sends the previous day. The API accepts the client date and inserts it as `water_log.date`, so the first post-midnight tap is durably written to the wrong calendar day and revalidates the wrong day tag. This is the same impact class as the fixed C1 timezone bug, just triggered by session lifetime rather than schema drift.

**Recommendation (verbatim):**
> Do not ship until the write path derives the date at mutation time, preferably server-side from the authenticated user profile timezone, or recalculates from a fresh timezone value immediately before POST. Add a regression covering an already-open non-UTC session crossing midnight.

**Severity rationale:** Same durable-write-to-wrong-day impact class as C1. PWA / mobile context makes long-lived sessions normal. Hits any user who keeps the app open across midnight.

---

### I3 — High: Skipped browser coverage is deferred on a false premise
**Location:** `tests/e2e/nav-responsive.spec.ts:78-236` (and the visual spec `tests/visual/water-fab-toast.spec.ts`)
**Verbatim title:** "Skipped browser coverage is deferred on a false premise"

**Codex finding (verbatim):**
> The new water-FAB E2E remains `test.skip` and the file still uses the forged `seedAuthSession` path, while the repo already contains `tests/e2e/fixtures/auth.ts` with a real Supabase `admin.createUser` + `signInWithPassword` fixture and cookie writer. The visual spec even imports that auth fixture but still skips both cases. That makes the followup claim that the auth fixture delegates to the forged-cookie helper inaccurate, and leaves the exact C1-class path unexecuted in CI despite an apparent in-repo mechanism to run it. Result: real browser failures in layout timezone lookup, `/api/water/log`, route preservation, toast rendering, and reduced-motion behavior can continue landing silently.

**Recommendation (verbatim):**
> Migrate the water-FAB E2E to `tests/e2e/fixtures/auth.ts`, unskip the visual auth-fixture cases, and update the followup text. Include a non-UTC assertion that posted `logged_on` matches the user's local date.

**Severity rationale:** Codex categorizes this as "high" (above Improvement, below Critical in their own phrasing). For our 2-tier review schema this maps to **Critical** because:
- It directly contradicts the round-1 deferral premise (the F-TEST-4 #1 blocker claim is allegedly inaccurate per Codex)
- The bug Codex found in C2 is exactly the kind of failure real-browser E2E would catch
- Round-1 triage's I2 deferral may need to be reversed

However, the round-1 sub-agent should be the authoritative voice on whether F-TEST-4 #1 is actually unblocked by the existing `tests/e2e/fixtures/auth.ts` — this requires user / main-agent decision because:
1. If `tests/e2e/fixtures/auth.ts` does work as Codex claims → I3 escalates to **Critical** (we should unskip in this batch).
2. If F-TEST-4 #1 is genuinely blocked beyond what Codex sees → I3 stays **Improvement** (defer per round 1).

**Categorization:** Borderline Critical/Improvement depending on point 1 vs point 2. Default to **Critical** for safe escalation since the user-decision STW will route correctly either way.

---

## Counts Summary

| Severity | NEW (round-2 only) | Round-1 carryover |
|---|---|---|
| Critical | **2** (C2 + I3-as-Critical) | 0 (C1 verified clean) |
| Improvement | **0** | 0 (I1 verified, I2 re-flagged as I3) |
| Minor | **0** | 0 |

**Net count of NEW Critical findings: 2.**

Per skill HARD-RULE 4 (two-round cap):

> Critical > 0 → state.md: `codex_round_2: escalated_pending_user_decision`. STW: surface to main agent for user-decision (force-commit / round-3 / abort+rollback). Do NOT auto-advance silently — that's a Red Flag.

**Decision:** **STW-escalate** to main agent / user. Round 3 is past the 2-round cap, so options are:
1. **Force-commit** — accept the residual risk, document in followups, ship anyway.
2. **Abort+rollback** — revert the batch, re-route to brainstorm-tomi or Medium FA flow.
3. **Inline-fix bypass** — user authorizes a HARD-RULE 4 override to fix C2 + I3 in this batch (NOT a round 3 — direct fix without re-review).

Recommended user prompt below.

---

## Round 1 Fix Cross-Check (Codex did NOT re-flag these)

✅ **C1 fix held** — column rename to `id` is correct, Sentry capture happens BEFORE UTC fallback returns, no other call sites in `app/(app)/layout.tsx` flagged.
✅ **I1 fix held** — `router.refresh()` only fires on POST success, after toast push, no race conditions or render double-fire flagged.
✅ **Store contract change `ttlMs?` on `useUndoQueueStore`** — no regression flagged.
✅ **UndoToast canonical `kind:'delete-failed'`** — no library/pattern drift flagged.
✅ **Token drift / hard-coded values** — no regression flagged.
✅ **Reduced-motion / a11y** — no regression flagged.
✅ **Unit test `tests/unit/app/layout-timezone-derivation.test.ts`** — Codex did not flag inadequate coverage.

The round-1 auto-fixes are correct and complete for the issues they were meant to address. C2 and I3 are NEW issues that round 1 did not surface.

---

## Suggested STW message to main agent / user

> Round 2 of the Codex adversarial review surfaced **2 NEW Critical findings** that did not appear in round 1:
>
> **C2 (Critical):** The water FAB still has a wrong-day write bug — separate failure mode from the C1 column rename. `loggedOn` is computed once in the server layout and passed as a prop to the persistent client nav shell. After a session crosses local midnight, the captured prop is stale and the mutation writes to yesterday's date. PWA / mobile use is the high-risk path.
>
> **I3 (Critical, was I2 in round 1):** Codex disputes the round-1 deferral premise. The repo already contains `tests/e2e/fixtures/auth.ts` with a real `admin.createUser` + `signInWithPassword` fixture. If true, F-TEST-4 #1 is not actually blocking and the e2e + visual specs should be unskipped in this batch. Round 1 sub-agent's claim that the existing fixture delegates to the forged-cookie helper may be inaccurate.
>
> **Per HARD-RULE 4, the 2-round cap is reached.** I am not allowed to loop another auto-fix round. Your options:
>
> 1. **Force-commit + defer** — accept C2 + I3 as known residual risk, document in `Planning/followups.md`, advance to Phase 6 anyway. (Risk: durable wrong-day water logs ship to users; e2e gap stays open.)
> 2. **Abort + rollback** — revert the batch and re-route to brainstorm-tomi Medium FA, where the broader water-mutation date-derivation surface gets proper architectural treatment. (Cost: round-1 fixes lose their commit, scope balloons to multi-day.)
> 3. **HARD-RULE 4 override (inline fix in this batch)** — you authorize a one-time bypass of the two-round cap to fix C2 directly (move date derivation to mutation time / server-side) and verify I3 by inspecting `tests/e2e/fixtures/auth.ts` (unskip if Codex is right, document blocker if round-1 was right). No round-3 Codex review — just the fix + Phase 6 security review + Phase 7 E2E.
>
> My recommendation: **Option 3**. C2 is a localized fix (one prop derivation in nav-shell.tsx, possibly server-side date derivation in the API route), and I3 is a 5-minute file-read to verify which side is correct. The cost of either option 1 or option 2 substantially exceeds option 3, and option 3 surfaces the truth on I3 cheaply.
>
> Path to artifacts:
> - Round-2 verbatim: `Planning/.tmp/bugfix-2026-05-08-mobile-water-button/codex/round-2.md`
> - Round-2 categorized: `Planning/.tmp/bugfix-2026-05-08-mobile-water-button/codex/round-2-categorized.md`
