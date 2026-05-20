# Security Review — bugfix `2026-05-19-bac-not-working`

**Scope:** commit `2535265` vs `HEAD~1`. Files: `lib/alcohol/bac.ts` (math fix), `tests/unit/lib/alcohol/bac.test.ts`, `planning/CHANGELOG.md`, `planning/progress.md`.

**Verdict:** Clean — **no Critical or High findings**. 2 Informational notes for awareness.

---

## Severity counts

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Informational | 2 |

---

## Findings

### INF-1 — Numerical-precision DoS surface is theoretical, blocked by DB + API constraints
**File:** `lib/alcohol/bac.ts:39-85`
**Issue:** The new piecewise-integration code does not enforce a soft cap on `logs.length` or sanitize `alcohol_grams` for NaN/Infinity/MAX_VALUE. Theoretical attack vectors:
- `alcohol_grams = Infinity` → `peakBac = Infinity` → first segment yields `bac = Infinity`, rounded as `"Infinity"` and reported to dashboard.
- `alcohol_grams = NaN` → propagates NaN through `reduce` → `Number(NaN.toFixed(4)) = NaN`.
- `logs.length = 10_000` → events array up to ~20k; sort = O(n log n) ≈ 287k ops; segment loop O(events × drinks) ≈ 200M filter passes. ~1–2s CPU on a Vercel function. With Vercel function timeout 10s and asymmetric latency 150–200ms to SG Supabase, a single dashboard render costs a tail latency spike but not an outage.

**Why this is Informational, not Medium:**
1. **DB CHECK constraint** at `supabase/migrations/0026_bac_alcohol_tracking.sql:39`: `alcohol_grams numeric(8,3) not null check (alcohol_grams > 0)`. `numeric(8,3)` caps the value at 99999.999 — `Infinity` and `NaN` are rejected at INSERT time. Negative values are rejected. So the data feeding `calculateBac` cannot contain these pathological values via the supported write path.
2. **API CHECK constraint** at `app/api/entries/save/route.ts:120-126`: `volume_ml: z.number().positive().max(5000)`, `abv_percent: z.number().positive().max(100)`. Derived `alcohol_grams = volume × abv × 0.789 / 100` is ceiling-bounded at ~3945g per drink. Computed server-side via `calculateAlcoholGrams`, not client-controlled.
3. **Window constraint** at `lib/dashboard/fetch.ts:74-91`: `fetchAlcoholLogs` already enforces a 72-hour `consumed_at` window AND filters by `user_id` (RLS-backed). The single user would need to insert ~10,000 drinks within 72h to hit the DoS scenario — physically impossible (one drink every ~26s for three days).
4. **Single-user app**: PRD §1 — this is a single-user PWA. There is no multi-tenant DoS surface; the worst-case attacker is the user themselves degrading their own dashboard.

**Recommended fix:** None required. The defensive layer is the DB constraint + the fetch window, both already in place. If desired for documentation purposes, add a JSDoc note to `calculateBac` stating it trusts caller-side bounds. Do not add runtime sanitization to a hot pure function — it would only mask upstream bugs.

---

### INF-2 — `Number(bac.toFixed(4))` returns `NaN` if `bac` is `NaN`
**File:** `lib/alcohol/bac.ts:84`
**Issue:** Same theoretical vector as INF-1. If a malformed `consumed_at` slipped past `Number.isFinite(consumedMs)` (it cannot — that guard is correct), or `weightGrams * r` were ever 0 (blocked at line 44), `peakBac` could be `NaN`/`Infinity` and propagate. The `Math.max(0, …)` in the loop does NOT clamp NaN (since `Math.max(0, NaN) === NaN`).
**Why Informational:** All three entry guards (`Number.isFinite(asOfMs)`, `Number.isFinite(weightGrams) && weightGrams > 0`, `Number.isFinite(consumedMs)`) hold in current production callers. The fix's preserved guard structure is correct.
**Recommended fix:** Optional defensive `if (!Number.isFinite(bac)) return 0;` before the final return. Surgical, two-line, no behavior change in happy path. Not required for this batch.

---

## Per-checklist verification

1. **Input validation** — Inherits validation from DB + API layer (numeric(8,3), Zod schemas, RLS). Pure function trusts caller per design — acceptable given the upstream guarantees.
2. **Authn/authz** — Pure function. Sole caller `lib/dashboard/aggregate.ts:100` receives logs from `fetchAlcoholLogs`, which filters `user_id = uid` under RLS. No cross-user leakage possible.
3. **PII handling** — No logging, no error messages echoing user input. The new code path is silent.
4. **Injection vectors** — No SQL, NoSQL, command, template, or prompt strings introduced. Diff is purely numeric math.
5. **Secret leakage** — No env vars, tokens, keys touched.
6. **XSS / CSRF** — No HTML, no form, no fetch side-effects.
7. **Race conditions** — Pure function. No shared state, no `Date.now()` (uses caller-supplied `asOf`). Determinism preserved.
8. **DoS via expensive computation** — See INF-1. Mitigated by upstream window + DB constraints.
9. **Numerical precision** — See INF-1, INF-2. Mitigated by `numeric(8,3)` CHECK + Zod max.
10. **Authz bypass via dashboard flow** — Diff does not touch the dashboard data flow. Confirmed via `git diff --stat`: only `bac.ts`, `bac.test.ts`, and two planning docs changed.

---

## Aggregate verdict

**CLEAN.** No Critical, High, or Medium findings. The two Informational notes describe theoretical vectors fully mitigated by existing DB constraints (`numeric(8,3) check > 0`), API-layer Zod validation (`volume_ml.max(5000)`, `abv_percent.max(100)`), the 72h fetch window in `fetchAlcoholLogs`, and the single-user PRD context. The math fix introduces no new attack surface and preserves all existing input guards.

Proceed to Phase 7.
