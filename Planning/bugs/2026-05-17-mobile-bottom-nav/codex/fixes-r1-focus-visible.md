# Codex R1 Auto-fix — Focus-visible color flip (RETRY, post-recovery)

## Finding addressed
I-1: §6.4 Focus state icon/label color contract gap

## False-positive check
No — valid finding. §6.4 mandates ivory icon/label on focus; the original implementation kept them dust. The global `:focus-visible` rule satisfies the outline half of the contract but not the color flip.

## Recovery context
Two concurrent-session stash incidents on this batch:

1. **First incident (original brief)** — concurrent Claude Code session stashed our working tree mid-Phase-4 and committed unrelated work, moving HEAD from `d1118c9` → `783fcc1`. Main agent restored bug-1 nav files from `stash@{0}` (concurrent-session WIP isolation stash) before dispatching the retry.

2. **Second incident (this retry)** — while I (auto-fix sub-agent) was reading context, another concurrent Claude Code session created a new "E.CODEX R3 verification stash" at `stash@{0}` and ALSO pushed `a0879b1` (IDRIFT test fix). The R3 stash then evaporated mid-session (popped by yet another session), shuffling the stash stack so the original bug-1 stash returned to `stash@{0}`. Working tree was clean of nav-file changes when I started Step 0. I self-recovered by re-running `git checkout 'stash@{0}' -- <3 nav files>` from the (now-current) `stash@{0}` which DOES contain the Phase-3 bug-1 implementation (verified via `git show stash@{0}:<file>` line counts: 93 / 80 / 177 matching the +18 / +23 / +120 deltas from the original Phase-3 diff-stat). HEAD remained at `a0879b1` throughout.

Baseline verification AFTER second recovery: 12/12 bottom-tab-bar tests PASS, 104/104 regression sweep PASS, touched-file typecheck/lint clean. Pre-existing typecheck error in `tests/components/library/FoodDetailMacros.test.tsx` (sibling-batch file) confirmed unchanged.

## Files modified
- `app/globals.css` (added scoped rule + comment block; +20 lines)
- `components/nav/bottom-tab-bar.tsx` (added `kalori-bottom-tab` className on each tab Link wrapper; +4 lines)
- `tests/components/nav/bottom-tab-bar.test.tsx` (added 2 new tests + comment block; +48 lines)

## Changes summary

**`app/globals.css`** — new rule placed immediately after the radio-chip `label:has(input.sr-only:focus-visible)` block (L313-316), grouped with the other component-local focus-ring rules. Mirrors the established `.kalori-confirmation-*` scoped-class pattern used 20+ times elsewhere in the file:

```css
.kalori-bottom-tab:focus-visible {
  color: var(--color-ivory);
}
```

**`components/nav/bottom-tab-bar.tsx`** — added `className="kalori-bottom-tab"` to each tab Link (one prop addition inside the existing `<Link>` element; preserves all existing classes, inline styles, and attributes). Inline comment documents the §6.4 Focus state contract and why CSS is needed (inline styles can't express `:focus-visible`).

**`tests/components/nav/bottom-tab-bar.test.tsx`** — two new tests:

1. `"inactive tab flips icon and label to ivory on keyboard focus-visible (§6.4 Focus state)"` — CSS-contract assertion (jsdom can't synthesize `:focus-visible`). Reads `app/globals.css` via `readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8')` (pattern from `tests/integration/focus-ring-token.test.ts`) and matches the rule with a permissive regex: `/\.kalori-bottom-tab:focus-visible\s*\{[^}]*color\s*:\s*var\(--color-ivory\)/`.

2. `"each tab Link has the kalori-bottom-tab scoped class for §6.4 Focus targeting"` — DOM-side assertion that wires the CSS to the runtime DOM. Iterates the 4 destination tabs and asserts `tab.classList.contains('kalori-bottom-tab')`.

## Test results
- **Baseline verification** (after second recovery): 12/12 bottom-tab-bar PASS, 104/104 regression sweep PASS
- **TDD RED** (before applying fix): 12 originals PASS, 2 new tests FAIL for the right reasons:
  - CSS regex failed to match `.kalori-bottom-tab:focus-visible` (rule not yet added)
  - `tab.classList.contains('kalori-bottom-tab')` returned `false` for all 4 tabs (className not yet wired)
- **TDD GREEN** (after fix): 14/14 bottom-tab-bar PASS (6 original + 6 Phase-3 added + 2 R1-auto-fix added)
- **Regression sweep**: 106/106 PASS across 10 files
  - `tests/components/nav/bottom-tab-bar.test.tsx` (14)
  - `tests/components/nav/sidebar.test.tsx`
  - `tests/components/nav/nav-shell.test.tsx`
  - `tests/components/nav/log-fab.test.tsx`
  - `tests/components/nav/profile-menu.test.tsx`
  - `tests/components/nav/shortcuts-overlay.test.tsx`
  - `tests/components/nav/top-app-bar.test.tsx`
  - `tests/components/nav/sign-out-button.test.tsx`
  - `tests/integration/focus-ring-token.test.ts`
  - `tests/integration/nav-audit.test.ts`

## Typecheck / lint
- **Typecheck**: clean for the 3 touched files. The one error (`tests/components/library/FoodDetailMacros.test.tsx(584,54)` — `sugar_g` literal) is in a sibling-batch file and is pre-existing per the brief.
- **Lint**: clean for the 3 touched files. Repo-wide warnings exist in `tests/unit/lib/library/sign-on-read.test.ts` and `tests/unit/lib/storage/sign-thumbnail.test.ts` (unused-vars), unrelated to this batch.

## Notes
- jsdom `:focus-visible` synthesis limitation handled via `fs.readFileSync` CSS contract test — pattern copied from `tests/integration/focus-ring-token.test.ts` (which uses `process.cwd()` not `__dirname`, so my test mirrors that).
- DOM-side test asserts `classList.contains('kalori-bottom-tab')` — jsdom-safe, fast, and the necessary runtime wiring to make the CSS rule apply.
- Pixel-perfect focus-visible verification (actual paint of ivory color when keyboard-focused) deferred to Phase 7 Playwright suite where real browsers handle `:focus-visible` natively.
- Pre-flight Grep for `kalori-bottom-tab` returned zero matches — no class-name collision with existing CSS.
- Sidebar (`components/nav/sidebar.tsx`) has the identical focus-state drift pattern per Codex review notes — explicitly out of scope for this batch and will become a `pending_minor_findings` entry per round-1 reviewer's recommendation.
