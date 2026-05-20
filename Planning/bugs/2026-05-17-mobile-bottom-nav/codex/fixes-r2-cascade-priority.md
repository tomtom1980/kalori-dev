# Codex R2 Auto-fix — Cascade Priority Correction

## Finding addressed

**R2 I1** — `components/nav/bottom-tab-bar.tsx:67-78`. Inline `style.color`
on every tab (`active ? var(--color-ivory) : var(--color-dust)`) carried
CSS specificity 1000, which always beats the `.kalori-bottom-tab:focus-visible
{ color: var(--color-ivory) }` rule added in R1 (specificity 010). The R1
rule was syntactically present but never won the cascade — keyboard focus
on an inactive tab kept icon/label dust, regressing §6.4 Focus row. The
R1 `fs.readFileSync` contract test gave false confidence (presence ≠ effect).

## False-positive check

Not a false positive. CSS specificity is deterministic: inline (1000) ALWAYS
beats class (010) or attribute selectors (020) when both declare the same
property. The R1 rule could be deleted from globals.css and the rendered
output would not change — confirms the rule was inert.

## Audit findings from Step 0

| Surface | Pre-fix state | Action |
|---|---|---|
| `app/globals.css` `.kalori-bottom-tab:focus-visible` | MISSING (Grep returned zero matches — swept by concurrent stash before R2 audit) | RESTORED + extended with `.kalori-bottom-tab` (default) + `[data-active="true"]` (active) rules |
| `components/nav/bottom-tab-bar.tsx` `className="kalori-bottom-tab"` | Present (line 66) | Kept; `data-active` attribute added; inline `color:` REMOVED from `style={{}}` |
| `tests/components/nav/bottom-tab-bar.test.tsx` count | 14 (6 original + 6 Phase 3 + 2 R1) | Updated 1 stale test (currentColor → data-active); ADDED 3 new R2 tests; final count 17 |
| `tests/integration/focus-ring-token.test.ts` and `tests/integration/nav-audit.test.ts` | Unmodified | Verified untouched; both pass |
| `stash@{0}` "concurrent-session WIP isolation for E.CODEX R2 push 2026-05-17" | Preserved | Not dropped |
| Git HEAD | `b51cad1` (concurrent session pushed `wip: bugfix batch library-micros — bugs 2+3 implemented (bug 1 pending re-impl)` during the interruption) | Not modified |

## Changes made

### 1. `app/globals.css` (+22 lines after L316)

Added a single grouped block declaring all three §6.4 state-table color
rows under the `.kalori-bottom-tab` scoped class:

```css
.kalori-bottom-tab {
  color: var(--color-dust);                       /* default inactive */
}
.kalori-bottom-tab[data-active='true'] {
  color: var(--color-ivory);                      /* active route flip */
}
.kalori-bottom-tab:focus-visible {
  color: var(--color-ivory);                      /* keyboard focus flip */
}
```

Comment block above the rules documents the R1→R2 history and the
specificity-tier reasoning. Placed immediately after the `label:has(input.sr-only:focus-visible)`
block at L313-316, grouped with the other component-local focus-state
rules — matches the canonical placement pattern for `.kalori-*` scoped
classes elsewhere in the file (20+ instances).

### 2. `components/nav/bottom-tab-bar.tsx`

- **REMOVED:** `color: active ? 'var(--color-ivory)' : 'var(--color-dust)'`
  from the inline `style={{ ... }}` object on every tab Link (was line 78).
- **ADDED:** `data-active={active ? 'true' : 'false'}` attribute on every
  tab Link. The CSS attribute selector `[data-active='true']` matches
  this at specificity 020 (class + attribute), competing on the same tier
  as `:focus-visible` rather than getting steamrolled by inline 1000.
- Kept all other inline styles (layout, top-border-color, font tokens,
  text-transform). Active-state visual unchanged: 2px oxblood top border
  + ivory text. Inactive: transparent top border + dust text. Focus:
  ivory text (now winnable).
- Comment block above the Link element documents the cascade-priority
  reasoning so the next maintainer sees WHY color is not inline.

### 3. `tests/components/nav/bottom-tab-bar.test.tsx`

- **UPDATED** the `"inherits tab color into the icon via currentColor"`
  test (was line 142). Renamed to `"routes the active-state color flip
  through data-active (CSS-cascade-allowable contract)"`. Replaced
  `expect(tab.style.color).toBe(...)` with `expect(tab.getAttribute('data-active')).toBe(...)`.
  The SVG-stroke=`currentColor` assertion (which is the actual
  inherited-color contract) is retained verbatim.
- **ADDED** 3 new R2 tests:
  1. `"inactive tab does not set color via inline style (cascade-allowable for §6.4 focus override)"` —
     structural assertion that `inactiveTab.style.color === ''` AND the
     raw `style` attribute string contains no `color:` declaration.
     This is the test specified in the brief Step 3.
  2. `"active tab also does not set color via inline style (cascade-allowable)"` —
     same constraint for the active tab.
  3. `"globals.css declares the default + active + focus-visible color
     rules under .kalori-bottom-tab"` — CSS contract test verifying all
     three §6.4 state-table rows are routed through CSS classes (not
     inline). Uses `fs.readFileSync` with permissive regex per the
     focus-ring-token.test.ts pattern.

Final test count: 17 (was 14 before R2).

## Test results

### TDD RED state (before applying the fix, simulated by reverting the .tsx change)

- `style.color === ''` test FAILED for the right reason: `style.color`
  was `var(--color-dust)` (inactive) / `var(--color-ivory)` (active).
- `style` attribute regex match FAILED: contained `color: var(--color-dust);`.
- `data-active` attribute test FAILED: attribute returned `null` (not set).
- CSS contract test FAILED for the default + active rules (only the
  R1 focus-visible rule was present at audit start).

### TDD GREEN state (after the fix)

- **Bottom-tab-bar file:** 17/17 PASS (`pnpm vitest run tests/components/nav/bottom-tab-bar.test.tsx`).
- **Regression sweep:** 109/109 PASS across 10 files
  (`pnpm vitest run tests/components/nav/ tests/integration/focus-ring-token.test.ts tests/integration/nav-audit.test.ts`):
  - `tests/components/nav/bottom-tab-bar.test.tsx` (17)
  - `tests/components/nav/sidebar.test.tsx`
  - `tests/components/nav/nav-shell.test.tsx`
  - `tests/components/nav/log-fab.test.tsx`
  - `tests/components/nav/profile-menu.test.tsx`
  - `tests/components/nav/shortcuts-overlay.test.tsx`
  - `tests/components/nav/top-app-bar.test.tsx`
  - `tests/components/nav/sign-out-button.test.tsx`
  - `tests/integration/focus-ring-token.test.ts`
  - `tests/integration/nav-audit.test.ts`

### Typecheck

- Clean for the 3 touched files. The single error
  `tests/components/library/FoodDetailMacros.test.tsx(584,54)` — `sugar_g`
  literal — is in a sibling-batch file, pre-existing per the R1 fix log
  and the brief. Unchanged by this fix.

### Lint

- Clean for the 3 touched files (`pnpm eslint` returned zero output).

## Residual concerns

- **Sidebar (`components/nav/sidebar.tsx`) and Tablet Rail** were
  explicitly out of scope per the R1 fix log's closing note. Codex R1
  flagged the same focus-state drift pattern there. Recommend tracking
  as `pending_minor_findings` — NOT addressed in this auto-fix.
- **Pixel-perfect focus paint verification** — jsdom does not synthesize
  `:focus-visible` state, so the structural tests verify the cascade
  CAN resolve correctly. Actual paint (icon + label = ivory on keyboard
  focus of an inactive tab) MUST be verified in Phase 7 Playwright on
  real browsers.

## Cap status

2-round Codex cap closes here. Per `~/.claude/rules/codex-review.md`:
"One initial review + up to one re-review after auto-fix. Beyond that →
user decides whether to escalate or accept." Any residual minor findings
from Phase 5/6/7 → `pending_minor_findings`, NOT another auto-fix round.
