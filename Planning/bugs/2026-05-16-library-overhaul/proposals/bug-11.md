# Bug 11 Proposal — Library item separators not visually clear

## Bug ID
bug-11 (batch `2026-05-16-library-overhaul`)

## Description (verbatim)
> "As for the library display, all items need to have a clear line next to them so we separate each item in a library view."

## Classification
**known_fix** — straightforward CSS adjustment to existing hairline tokens. No new infra, no schema, no logic change.

## Root cause
Existing CSS at `app/globals.css:2823-2851` already implements the design-spec hairlines per `Planning/ui-design.md` §7.3.3:

- `.kalori-library-grid` → `border-top` + `border-left` `1px solid var(--color-rule)`
- `.kalori-library-cell` → `border-right` + `border-bottom` `1px solid var(--color-rule)`

`--color-rule` resolves to `#3f3731` (defined `app/globals.css:37`), nominally 3:1 contrast on `--color-bg-1` (`#0E0A08`). On the warm near-black field with the dense Card thumbnails dominating each cell, the 1px `#3f3731` hairline reads as a soft seam rather than a "clear line" — the user's perception is correct. The wider token `--color-rule-strong` (`#504742`, 4:1 on bg-0, line 38) exists precisely for "card frames, section boundaries" — the library grid IS a card-frame/section-boundary surface.

## Fix (CSS-only, surgical)
Swap `var(--color-rule)` → `var(--color-rule-strong)` on the 4 border declarations at `app/globals.css:2831, 2832, 2847, 2848`. No other file touched.

```css
.kalori-library-grid {
  /* ... */
  border-top: 1px solid var(--color-rule-strong);   /* was --color-rule */
  border-left: 1px solid var(--color-rule-strong);  /* was --color-rule */
}

.kalori-library-cell {
  /* ... */
  border-right: 1px solid var(--color-rule-strong); /* was --color-rule */
  border-bottom: 1px solid var(--color-rule-strong);/* was --color-rule */
}
```

Rationale for `rule-strong` over thicker / oxblood:
- `rule-strong` is the canonical token for card frames per `globals.css:38` comment + `ui-design.md` §2.4 §2.3 spec ("`rule-strong` for card frames").
- Skipping the last item is automatic — the grid wraps the outer top/left, each cell paints its own right/bottom — there is no "last child" gotcha (no `divide-y` needed). The drawn-hairline pattern is `ui-design.md` §7.3.3 tiebreaker #5 canonical.
- Inset vs full-width is N/A — cells share hairlines (`gap: 0`), so the separators are continuous full-bleed rules, exactly per spec.
- Width stays 1px — design language is "hairlines only," not "thicker borders." Only the TOKEN changes, not the weight.

## Files affected (1)
- `app/globals.css` — 4 line changes (lines 2831, 2832, 2847, 2848).

## TDD required
**No** — pure visual / token swap, no logic, no behavioural change. Falls under user's CLAUDE.md / global testing-policy "Pure UI/styling with no logic" TDD exception. Phase 7 Codex review still applies (UI Touching = yes).

If the reviewer disagrees, a `.kalori-library-cell` getComputedStyle assertion against `rgb(80, 71, 66)` (= `#504742`) suffices — single line in `tests/library/library-grid.test.tsx` if it exists. Otherwise visual regression on the existing library Playwright suite is the right gate (Phase 7 mandatory anyway).

## UI Touching
**Yes.** Cites:
- `Planning/ui-design.md` §7.3.3 + §2.4 (hairline + rule-strong tokens).
- `Planning/ui-design.md` lines 23, 152, 1444, 1487-1503 (hairline-rule design language — "Hairlines only", "Standard divider 1px `rule` solid", "Ruled grid CSS").
- The Ledger design tokens at `app/globals.css:37-38` (`--color-rule` vs `--color-rule-strong`).

## Risk
**Low.** Token swap to a sibling token already in the design system. No new accessibility surface (both tokens are non-text borders — WCAG 3:1 graphical-object minimum is met by both; `rule-strong` actually improves to 4:1). Visual regression baselines on `/library` will need regeneration — call out in implementation handoff.

## Open questions
1. Is the user asking for stronger lines on the **grid card layout** as it currently ships, OR is Bug 11 part of a planned **list-view refactor** (other bugs in batch may convert grid → list)? If grid stays, this proposal applies as-is. If grid → list, the same `rule-strong` swap applies but via `divide-y` Tailwind utility on a `<ul>`/`<ol>` and the cell borders go away.
2. Do FoodDetail history rows (`FoodDetailHistory.tsx`) and recent-entries list (`RecentEntriesSection.tsx`) want the same upgrade? Out of scope for Bug 11 (user said "library display" = grid surface), but flagging — sibling cluster (per lessons line 11 "wall-behind-wall axe pattern" analog for visual hairlines).

## Stop-the-world flags
None.

## One-liner
Swap `--color-rule` → `--color-rule-strong` on 4 lines of `.kalori-library-grid` + `.kalori-library-cell` borders in `app/globals.css` so library cells use the 4:1 card-frame token instead of the 3:1 ambient-divider token, making cell boundaries clearly visible per The Ledger's "hairlines only" mandate.
