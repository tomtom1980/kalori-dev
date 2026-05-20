# Codex Round 1 — Categorized Findings

**Batch:** `2026-05-16-mini-batch-A-cleanup`
**Verdict:** `needs-attention` (`critical_present`)
**Round 1 completed:** 2026-05-16
**Auto-retry signals:** none

---

## Counts

| Severity | Count |
|---|---|
| **Critical** | 3 |
| **Improvement** | 0 |
| **Minor** | 0 |

Codex emitted all three findings under the **Critical** category (with `severity: critical / high / high`). Each blocks shipment per Codex's "No ship" verdict.

---

## Critical findings (3) — MUST auto-fix in Phase 5 round 2

### C1 — sharp failOn weakens default validation posture
- **File:** `lib/library/sketch-pipeline.ts:302-312`
- **Item / cluster:** Item 2 (SEC-M1 PNG decode cap) / Cluster B
- **Root issue:** `failOn: 'truncated'` is **less strict** than sharp 0.34.5's default `'warning'`. The order is `none < truncated < error < warning`. By specifying `'truncated'`, the batch *lowered* sharp's failure sensitivity below the pre-batch default, undercutting SEC-M1 instead of strengthening it.
- **Impact:** Malformed Gemini PNGs that previously aborted under `failOn: 'warning'` can now reach decode/re-encode paths. Defense surface shrunk.
- **Test coverage gap:** The truncated-header regression test only proves an 8-byte invalid input still fails (likely via metadata, not via `failOn`). It does NOT prove non-truncated malformed PNGs are rejected.
- **Recommendation (Codex):** Use the default or explicitly set `failOn: 'warning'` / `'error'`; add a malformed-but-not-truncated PNG regression case.
- **Auto-fix complexity:** Trivial — remove the `failOn` override entirely (rely on default `'warning'`) OR set `failOn: 'warning'` explicitly. Add one regression spec.
- **Specific concern from briefing answered:** "does failOn: 'truncated' work as expected for PNG inputs in sharp 0.34.x?" → **No.** It is strictly weaker than the default. This is a backwards-regression hidden as a hardening change.

### C2 — Oversize guard runs after unbounded Gemini JSON materialization
- **File:** `lib/ai/image-client.ts:122-126` (in `runSketchPipeline`, but the actual JSON materialization happens earlier in `callGeminiImage`)
- **Item / cluster:** Item 2 (SEC-M1 PNG decode cap) / Cluster B
- **Root issue:** `callGeminiImage` calls `response.json()` BEFORE the post-decode 5MB cap runs. The full JSON body + base64 string is already allocated in memory. The cap only prevents `Buffer.from(...)` + sharp decode work — NOT the upstream response-body materialization.
- **Impact:** A drifted or hostile Gemini response can still consume serverless memory beyond the advertised 5MB cap. The cap is **incomplete** for the stated heap-amplification threat (per security review SEC-M1).
- **Recommendation (Codex):** Add a response-body cap in `callGeminiImage` BEFORE `response.json()`, using `Content-Length` header when present and an incremental reader cap when absent. Keep the decoded-size guard as defense-in-depth.
- **Auto-fix complexity:** Moderate — requires either streaming the response body with a byte counter (then rejecting before `.json()`) OR a Content-Length pre-check on the response (lighter, but only works when upstream sends it). Both patterns mirror existing fetch-cap idioms elsewhere in the codebase.
- **Specific concern from briefing answered:** "does pre-decode estimate via base64.length*0.75 preempt allocation? Or does the buffer get materialized regardless via fetch().arrayBuffer()?" → **The buffer is materialized regardless.** The estimate fires AFTER `response.json()` has already done the damage. The post-decode check is "redundant or genuinely defensive" — it's defensive against sharp/Buffer.from cost ONLY, not against response-body memory.

### C3 — Env-loader fix does not clean the documented embedded CRLF artifact
- **File:** `tests/_utils/env-loader.ts:41-58`
- **Item / cluster:** Item 1 (E2E env-loader fix) / Cluster A
- **Root issue:** `split(/\r?\n/)` runs BEFORE `value.replace(/\r\n?$|\n$/, '')`. For the documented artifact `KEY="secret<CR><LF>"`, the split consumes the embedded CRLF and breaks the quoted value across two lines. The replace never sees the artifact. The unit-test suite even acknowledges this by asserting `KEY="secret\n"` parses to `"secret` (not `secret`).
- **Impact:** The exact `.env.local` artifact shape described in `e2e-results.md` (`vercel env pull` output with embedded `\r\n` inside quoted values) is **still not handled**. Playwright E2E will continue to fail with `Invalid API key`. The DRY refactor + PROD-ref guard do not solve the original blocker.
- **Recommendation (Codex):** Parse quoted values BEFORE line splitting (multi-line quoted env value support) OR handle the documented artifact some other way. Add a regression assertion that `KEY="secret\r\n"` resolves to `secret`.
- **Auto-fix complexity:** Moderate — requires either a quoted-value pre-pass (find `KEY="..."` spanning multiple lines and rejoin) OR rewriting the loader as a state-machine parser. Sub-agent already flagged this exact limitation in `state.md` lines 42-53.
- **Specific concern from briefing answered:** "does the regex catch the dominant artifact? Is the DRY refactor + PROD-ref guard sufficient even if regex is theatrical?" → **No, the DRY refactor + guard is not sufficient.** Codex agrees with the sub-agent's self-flagged limitation but treats it as a Critical (not Minor) finding because the original E2E blocker remains unresolved.

---

## Improvement findings (0)

None emitted.

---

## Minor findings (0)

None emitted.

---

## Affected files (deduplicated)

- `lib/library/sketch-pipeline.ts` (C1)
- `lib/ai/image-client.ts` (C2)
- `tests/_utils/env-loader.ts` (C3)
- `tests/unit/lib/test-infra/env-loader.test.ts` (C3 — test coverage gap)
- `tests/unit/lib/library/sketch-pipeline.test.ts` (C1 — needs malformed-but-not-truncated regression)

---

## Verdict

**`critical_present`** — Phase 5 (round 2 auto-fix) IS REQUIRED.

All three findings are auto-fixable via sub-agent in a single batch:
1. **C1 fix:** Remove `failOn: 'truncated'` override (revert to sharp default `'warning'`); add malformed-non-truncated regression spec.
2. **C2 fix:** Add response-body cap in `callGeminiImage` (Content-Length check + optional streaming cap).
3. **C3 fix:** Either extend the env-loader to handle multi-line quoted values OR accept the limitation and remove the relevant artifact from the documented blocker by rewriting via `dotenv` parser. (Implementation choice during Phase 5.)

Two-round cap per `codex-review.md`: this is round 1 of 2.

---

## Briefing-specific concerns NOT flagged by Codex

The following concerns from the invocation framing did NOT surface in Codex findings (treated as non-issues by Codex review):

- **Item 3 prod-gate bypass via NODE_ENV unset / case mismatch** — Codex did not flag. (NODE_ENV is set to `production` by Next.js/Vercel build pipeline; case-mismatch and unset risk minimal in deploy targets.)
- **Item 4 rehydrate shape issues** — Codex did not flag the Zustand `onRehydrateStorage` coercion logic.
- **Item 4 keyboard navigation regression** — Codex did not flag the pill repositioning at index 0.
- **Item 5 unused-vars indirect-path use** — Codex did not flag any of the three removed vars.
