# Codex Round 2 — Categorized Findings

**Batch:** `2026-05-17-mobile-bottom-nav`
**Verdict:** `needs-attention`
**Round 2 of 2-round cap.**

---

## Critical (0)

_None._

---

## Improvement (1)

### I1 — Focus-visible color flip defeated by inline `color: var(--color-dust)` (regression of R1 finding)

- **File:** `components/nav/bottom-tab-bar.tsx:67-78`
- **Severity (Codex internal):** medium → **Improvement** in standard severity rule
- **Verbatim summary:** "Inactive tabs still set `color: var(--color-dust)` through React inline styles. The new `.kalori-bottom-tab:focus-visible { color: var(--color-ivory); }` rule in `app/globals.css` cannot override an inline `style.color` in the CSS cascade, so keyboard focus on an inactive tab keeps the icon and label dust despite the syntactically plausible CSS contract test. This regresses the exact Round 1 finding and leaves the section 6.4 Focus state unmet for keyboard users."
- **Why this is Improvement, not Critical:**
  - Does not break a passing feature in production (tab nav still works for mouse + active tabs)
  - Does not introduce a security/data-loss/RLS surface
  - DOES leave the documented `ui-design.md §6.4` keyboard-focus contract unmet
  - DOES regress the exact same item Round 1 flagged — the R1 fix added the CSS rule but failed to address the inline-style cascade-priority issue
- **Why this is NOT Minor:**
  - It is a direct regression of the R1 finding (the fix did not deliver)
  - Codex correctly notes the CSS-contract test (`fs.readFileSync` regex match) provides false confidence — the rule is present but cannot win the cascade against inline `style.color`
  - Keyboard users on inactive tabs still see dust where spec mandates ivory
- **Codex recommendation (advisory only):** "Move the tab color state out of inline styles into CSS selectors/classes/data attributes that can express `:focus-visible`, or otherwise ensure the focus-visible rule has authority over the inactive inline color; then verify with a real browser/computed-style focus test rather than only an fs regex."
- **File scope for one more file-scoped auto-fix:** `components/nav/bottom-tab-bar.tsx`, `app/globals.css`, `tests/components/nav/bottom-tab-bar.test.tsx`

---

## Minor (0)

_None._

---

## Round 2 totals

| Severity     | Count |
|--------------|-------|
| Critical     | 0     |
| Improvement  | 1     |
| Minor        | 0     |

## Auto-retry signals

NO signals found in Codex stdout. Review is complete and authoritative.

## 2-round cap status

This is the second Codex round. Per the 2-round cap (codex-review.md §"Two-round cap"):

- We may dispatch **ONE more file-scoped auto-fix** to address I1 (cascade-priority fix)
- After that auto-fix, ANY residual Improvement goes to `pending_minor_findings` — we do NOT loop to a round 3
- If the file-scoped auto-fix introduces new Critical or fails to resolve I1, escalate to user

## Recommendation for main agent

Dispatch one more file-scoped auto-fix sub-agent for I1 with these constraints:
1. **Files:** `components/nav/bottom-tab-bar.tsx`, `app/globals.css`, `tests/components/nav/bottom-tab-bar.test.tsx`
2. **Approach:** lift inactive-tab `color: var(--color-dust)` out of React inline `style={}` into CSS (likely a `.kalori-bottom-tab` rule paired with the existing `:focus-visible` override). Keep active-tab ivory + 2px oxblood top bar inline (or also CSS — implementer's choice) but ensure the cascade lets `:focus-visible` win.
3. **TDD upgrade:** replace the `fs.readFileSync` CSS-contract test with a real DOM/jsdom `:focus-visible` test using `window.getComputedStyle` after focusing an inactive tab, OR add it alongside the existing test. The fs regex stays as a defensive smoke check.
4. **Verify:** all 14/14 bottom-tab-bar tests GREEN + regression sweep GREEN + touched-file lint/typecheck clean
5. **Do NOT loop to round 3** — residual Improvement after this fix → `pending_minor_findings`
