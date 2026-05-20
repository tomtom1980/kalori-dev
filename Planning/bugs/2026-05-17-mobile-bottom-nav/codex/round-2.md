# Codex Adversarial Review — ROUND 2 (verbatim)

**Batch:** `2026-05-17-mobile-bottom-nav`
**Round:** 2 (of 2-round cap)
**Thread ID:** `019e3279-0717-74a0-ad81-46d52f8a423f`
**Turn ID:** `019e3279-08c8-71f1-92f5-accfdee3a104`
**Captured:** 2026-05-17 (current session)
**Diff scope:** uncommitted working tree vs HEAD (4 files, ~16 KB)
**Diff size full-tree check:** 16,154 bytes — well under 500 KB budget
**Pre-flight files restored from stash@{0}:** `components/nav/bottom-tab-bar.tsx`, `components/nav/primary-destinations.ts`, `tests/components/nav/bottom-tab-bar.test.tsx`; **`app/globals.css` re-derived locally to apply ONLY the focus-visible hunk** (stash@{0}'s globals.css also contained an unrelated `.kalori-fd-micro-dv` hunk from the abandoned `bugfix-2026-05-17-library-micros` sibling batch — excluded per batch rollback policy)

---

## Verbatim Codex output (stdout)

```
# Codex Adversarial Review

Target: branch diff against HEAD
Verdict: needs-attention

No-ship: the Round 1 focus-visible fix does not actually satisfy section 6.4 for inactive tabs.

Findings:
- [medium] Focus-visible color flip is defeated by inline color (components/nav/bottom-tab-bar.tsx:67-78)
  Inactive tabs still set `color: var(--color-dust)` through React inline styles. The new `.kalori-bottom-tab:focus-visible { color: var(--color-ivory); }` rule in `app/globals.css` cannot override an inline `style.color` in the CSS cascade, so keyboard focus on an inactive tab keeps the icon and label dust despite the syntactically plausible CSS contract test. This regresses the exact Round 1 finding and leaves the section 6.4 Focus state unmet for keyboard users.
  Recommendation: Move the tab color state out of inline styles into CSS selectors/classes/data attributes that can express `:focus-visible`, or otherwise ensure the focus-visible rule has authority over the inactive inline color; then verify with a real browser/computed-style focus test rather than only an fs regex.
```

---

## Auto-retry signal scan

Searched verbatim Codex stdout for:
- `Input exceeded 1MB` — NOT FOUND
- `Retrying with tighter scope` — NOT FOUND
- `production files only` — NOT FOUND
- `spec context trimmed` — NOT FOUND

**Auto-retry triggered:** NO. Review is complete and authoritative.

---

## Severity translation note

Codex returned `[medium]` per its own internal scale. Per the standard bugfix-tomi categorization in `~/.claude/rules/codex-review.md`:

- Codex `medium` severity → **Improvement** in the standard severity rule (Critical / Improvement / Minor)
- The finding is NOT a Critical (no security/data-loss/regression-of-passing-feature) — it's an unmet design-spec contract
- The finding is NOT a Minor (it regresses the exact Round 1 finding and leaves a documented §6.4 spec row unmet for keyboard users)

Therefore categorized: **Improvement (1)**.
