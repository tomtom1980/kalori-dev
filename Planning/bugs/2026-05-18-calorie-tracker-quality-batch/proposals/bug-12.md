# Bug 12: Heatmap/table cell interactions need hover value plus persistent accessible detail popup
## Classification
needs_debug_shallow

## Root Cause
`HeatmapInteractive` currently uses one transient `ChartTooltip` state for click, Space, and Enter. It does not open on hover, it has no visible close X, and `ChartTooltip` only implements Escape despite its prop comment saying outside click should dismiss. The agreed interaction needs two states: hover/focus can show a quick value preview, while click/keyboard activation opens a persistent accessible detail popup that closes via outside click, Escape, or a small X.

## Proposed Change (Diff Outline)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\HeatmapInteractive.tsx`
  - Split transient hover preview state from persistent detail state.
  - Add pointer enter/leave handlers to heatmap cell buttons for the quick value preview using the existing lightweight chart tooltip styling.
  - Change click, Enter, and Space to open a persistent detail popup instead of the transient tooltip.
  - Keep the existing roving-tabindex grid keyboard navigation unchanged.
  - Ensure the live region announces the persistent selection without duplicating hover-only announcements.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\ChartTooltip.tsx`
  - Either keep this as hover-only quick preview, or add a `mode`/`persistent` prop if reusing it for the click popup.
  - If reused persistently, implement outside-click dismissal and an optional small X button styled like `kalori-log-close`.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\primitives\PopoverInline.tsx` or a new small chart-local Radix Popover wrapper
  - Prefer existing Radix Popover patterns for the persistent popup rather than adding a new library.
  - Use Radix outside-click and Escape handling, and include an icon-only X close button.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\globals.css`
  - Add only minimal chart-popup styling if the current `.chart-tooltip` cannot cover the persistent surface.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\MicronutrientHeatmap.test.tsx`
  - Add interaction tests for hover preview, click persistent popup, Escape close, outside click close, and small X close.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\HeatmapInteractive.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\ChartTooltip.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\primitives\PopoverInline.tsx` or `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\<new small chart popover component>.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\globals.css`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\MicronutrientHeatmap.test.tsx`

## TDD Required
yes - this changes interaction behavior, keyboard behavior, and accessibility semantics on an existing tested grid.

## Test Approach
Add failing RTL tests first: pointer hover over a heatmap cell shows a quick value tooltip and pointer leave removes it; click opens a persistent detail popup with accessible dialog/popover semantics and a small X close button; clicking outside closes it; Escape closes it; Enter/Space open it from keyboard focus while arrow-key navigation still clamps as existing tests expect. Keep the axe tests for D/W/M ranges green.

## Risk Assessment
medium - the heatmap already has a dense WAI-ARIA grid contract, so popup focus/dismiss behavior must not break roving tabindex, keyboard navigation, or axe checks.

## Regression Sweep Needed
- Heatmap keyboard navigation tests, including corner clamp and PageUp/PageDown.
- Heatmap D/W/M axe tests.
- Progress visual spec.
- Responsive overflow spec because popups must clamp within viewport and not widen the page.

## UI Touching
true - heatmap cell hover/click popup interactions.

## Open Questions
None for Phase 2 approval. Recommended implementation choice is Radix Popover for the persistent popup and existing `.chart-tooltip` styling for the hover preview, staying in the current Radix/Tailwind/chart stack and avoiding any new heavy dependency.
