# Codex Adversarial Review — Round 1 (verbatim)

**Batch:** `2026-05-16-mini-batch-A-cleanup`
**Base SHA:** `1d0d04f76f769109f482620d67b153a3dee7adc9`
**Codex thread:** `019e2f31-e81c-7ac0-8bed-dc62291a1c9c`
**Turn:** `019e2f31-e9f6-7182-864b-37e24fcafb7f`
**Invoked:** 2026-05-16
**Auto-retry signals:** none detected (no `Input exceeded 1MB`, `Retrying with tighter scope`, `production files only`, `spec context trimmed`)

---

## Verbatim Codex output

Target: branch diff against 1d0d04f76f769109f482620d67b153a3dee7adc9
Verdict: needs-attention

No ship: the batch leaves the E2E env-loader blocker materially unresolved and the PNG hardening has two security-relevant gaps, including a likely sharp validation regression.

Findings:
- [critical] [Critical] sharp failOn setting weakens the default validation posture (lib/library/sketch-pipeline.ts:302-312)
  The new constructors set `failOn: 'truncated'` while the installed sharp 0.34.5 docs/defaults indicate `failOn` defaults to the more sensitive `'warning'`, with the order `none < truncated < error < warning`. That means this change is not just documenting the default: it can allow invalid pixel-data warnings/errors that the default would have aborted. The added truncated-header test only proves an invalid 8-byte input still fails, likely via invalid metadata, not that non-truncation malformed PNGs are rejected. Impact: a malformed Gemini PNG can reach decode/re-encode paths under a weaker policy than before, undercutting SEC-M1.
  Recommendation: Do not lower sharp's failure sensitivity; use the default or explicitly set `failOn: 'warning'`/`'error'`, and add a malformed-but-not-truncated PNG regression case.
- [high] [Critical] Oversize guard runs after unbounded Gemini JSON materialization (lib/ai/image-client.ts:122-126)
  The SEC-M1 size check is in `runSketchPipeline` after `callGeminiImage` returns, but `callGeminiImage` has already executed `response.json()` and materialized the full JSON body and base64 string. This only avoids the decoded `Buffer.from(...)` and sharp work; it does not bound the response body allocation that an oversized inlineData payload creates first. Impact: a drifted or hostile upstream response can still consume serverless memory before the advertised 5MB cap has any chance to fire, making the cap incomplete for the stated heap-amplification threat.
  Recommendation: Enforce a response-body cap in `callGeminiImage` before JSON parsing, using `Content-Length` when present and an incremental reader cap when absent, then keep the decoded-size guard as defense-in-depth.
- [high] [Critical] Env-loader fix does not clean the documented embedded CRLF artifact (tests/_utils/env-loader.ts:41-58)
  The loader splits on `/\r?\n/` before it tries `value.replace(/\r\n?$|\n$/, '')`. For the documented artifact `KEY="secret<CR><LF>"`, the split consumes the CRLF and breaks the quoted value across lines, so the regex never sees the trailing CRLF. The new unit test suite explicitly documents this limitation and expects `KEY="secret\n"` to parse as `"secret`, not `secret`. Impact: `.env.local` files with the exact embedded CRLF shape described in `e2e-results.md` can still load malformed Supabase keys and keep Playwright blocked with `Invalid API key`; the DRY refactor and prod-ref guard do not solve that failure mode.
  Recommendation: Parse quoted values before line splitting or otherwise handle multiline quoted env values, and add a regression asserting the documented `KEY="secret\r\n"` artifact resolves to `secret`.

Next steps:
- Block shipment until the PNG validation/capping behavior and the env-loader artifact case are corrected and covered by targeted tests.

---

## Codex JSON payload (verbatim)

```json
{
  "verdict": "needs-attention",
  "summary": "No ship: the batch leaves the E2E env-loader blocker materially unresolved and the PNG hardening has two security-relevant gaps, including a likely sharp validation regression.",
  "findings": [
    {
      "severity": "critical",
      "category": "Critical",
      "title": "sharp failOn setting weakens the default validation posture",
      "location": "lib/library/sketch-pipeline.ts:302-312"
    },
    {
      "severity": "high",
      "category": "Critical",
      "title": "Oversize guard runs after unbounded Gemini JSON materialization",
      "location": "lib/ai/image-client.ts:122-126"
    },
    {
      "severity": "high",
      "category": "Critical",
      "title": "Env-loader fix does not clean the documented embedded CRLF artifact",
      "location": "tests/_utils/env-loader.ts:41-58"
    }
  ]
}
```
