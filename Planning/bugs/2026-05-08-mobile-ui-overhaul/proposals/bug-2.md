# Bug 2: Bottom navigation labels drift from spec (abbreviated DASH/LIB/PROG/SET instead of full words)

## Classification
known_fix

## Root Cause
`components/nav/bottom-tab-bar.tsx` line 76 renders `{destination.shortLabel}` for each tab. `shortLabel` is supplied by `components/nav/primary-destinations.ts` lines 28/34/40/46, which read from `t.nav.shortLabel.{dashboard|library|progress|settings}` in `lib/i18n/en.ts` lines 53–59. Those entries are abbreviated:

```
shortLabel: { dashboard: 'DASH', library: 'LIB', progress: 'PROG', settings: 'SET' }
```

This produces `DASH / LIB / PROG / SET` at every mobile viewport, which is the "first letter or half of the word" symptom the user reported.

The spec is unambiguous on the correct labels:
- `Planning/ui-design.md` §6.4 line 751: "4 destinations: Dashboard, Library, Progress, Settings."
- `Planning/ui-design-fragments/agent-2-navigation.md` line 153: "Destinations (4): Dashboard, Library, Progress, Settings."
- §6.4 line 751 + agent-2 line 159 confirm slot width `(100vw - 72px) / 4 ≈ 75.75px` at 375px — wide enough for "DASHBOARD" (~62px at Inter 500 10.5px 0.18em UPPERCASE) and trivially wide enough for "LIBRARY" / "PROGRESS" / "SETTINGS".
- Inter T10/10.5 0.18em UPPERCASE is the typography contract — the **font + casing** match spec; only the **text content** drifts.

There is no truncation, `max-w-`, `overflow-hidden`, conditional `md:hidden` rendering, or icon-only branch in the implementation. The strings themselves are simply abbreviations. The `shortLabel` field name and the i18n key path were introduced specifically to allow abbreviations, with no spec mandate for abbreviation — the design fragment §Tab layout calls for full labels with 0.18em UPPERCASE styling at 75.75px slot width.

Note: spec also calls for an icon above the label (Phosphor `ChartBar`/`BookOpen`/`ChartLine`/`Gear`, agent-2 lines 75–79 + 417–421); the current impl renders text-only with no icon. **Out of scope for this bug** (the user's complaint is label legibility, not missing icons), but flagged in Open Questions for the user to decide.

## Proposed Change (Diff Outline)

- `lib/i18n/en.ts` lines 54–59 — replace the `shortLabel` block values: `'DASH' → 'Dashboard'`, `'LIB' → 'Library'`, `'PROG' → 'Progress'`, `'SET' → 'Settings'`. Keep the key name `shortLabel` (renaming would ripple unnecessarily) and update the comment on line 53 from "Bottom-tab-bar short labels" to "Bottom-tab-bar labels (full words per ui-design.md §6.4)".
- `components/nav/bottom-tab-bar.tsx` line 76 — no code change needed; `{destination.shortLabel}` already renders the i18n value. Verify mixed-case input still gets uppercased by the existing `textTransform: 'uppercase'` style (line 72) — yes, it does.
- `components/nav/primary-destinations.ts` — no change; `shortLabel: t.nav.shortLabel.x` continues to work.
- `tests/components/nav/bottom-tab-bar.test.tsx` — extend with a new render-text assertion (see Test Approach).

No other files affected; sidebar (`components/nav/sidebar.tsx`) uses the separate `destination.label` field (`t.nav.dashboard` = "Dashboard"), so it is unaffected.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\nav\bottom-tab-bar.test.tsx`

(The component itself is **not** modified — the fix is purely a string change in the i18n module.)

## TDD Required
yes — add a render-text assertion that the four full labels appear (text-transform CSS will display them uppercase, but the DOM text content must be the full word).

## Test Approach
- Extend `tests/components/nav/bottom-tab-bar.test.tsx` with a new `it()` block:
  - Render `<BottomTabBar pathname="/dashboard" />`
  - Assert `screen.getByText('Dashboard')`, `screen.getByText('Library')`, `screen.getByText('Progress')`, `screen.getByText('Settings')` all return one element each (case-sensitive — DOM text content, not the visually-rendered uppercase form).
  - Assert that none of the abbreviated forms appear: `expect(screen.queryByText('DASH')).toBeNull()` × 4.
  - Optionally assert the inline `textTransform: 'uppercase'` style is still applied so users see the uppercase form.
- Visual regression: re-baseline mobile screenshots that contain the bottom tab bar at 375px (Playwright). The existing `tests/screenshots/` set already covers reduced-motion landing/offline; any baseline that includes the bottom nav strip will need a `--update-snapshots` pass. Specifically, regenerate any 375px / 768px snapshot under `tests/screenshots/user-stories/` and `tests/screenshots/reduced-motion/` that captures the nav strip — current git status shows several already modified, those re-snapshots will absorb this change cleanly.
- No new Playwright spec needed; the existing visual regression suite is sufficient once baselines refresh.

## Risk Assessment
low — single string-table change, no logic touched, fully covered by existing nav tests + new text-content test. Slot width math (`(375 - 72) / 4 ≈ 75.75px`) easily accommodates all four full-word labels at Inter 10.5px 0.18em (longest is "DASHBOARD" rendered uppercase, ~62px advance + tracking — fits with margin to spare). No risk of horizontal overflow.

## Regression Sweep Needed
- Existing 4 unit tests in `tests/components/nav/bottom-tab-bar.test.tsx` (testIds, aria-current, 44×44 minimum, primary landmark) — must remain green.
- Sidebar rendering — sidebar uses `t.nav.dashboard` etc., not `t.nav.shortLabel.*`, so unaffected. Verify by re-running any sidebar unit test.
- All existing visual-regression baselines that capture the mobile bottom nav at 375px must be updated in the same PR.
- E2E mobile-viewport flows that select tabs by accessible name — switch from `getByText('DASH')` → `getByText('Dashboard')` if any spec uses literal short forms (grep for `'DASH'`/`'LIB'`/`'PROG'` across `tests/`).
- i18n string-coverage / lint test (if `kalori/no-inline-user-strings` has a manifest list) — ensure the renamed values are present in any allow-list snapshot.

## UI Touching
true

## Quick-Pick Citation
`web-ui-guide.md` line 17: "Dynamic lists, accordions, **tabs** | AutoAnimate | 3.3 KB | Zero config, any framework". The bug-fix itself does not introduce new animation; the existing 120ms color "ink-fade" between dust→ivory on active swap (ui-design.md line 751 + agent-2 line 175) is CSS-only and unaffected. AutoAnimate is the canonical Quick-Pick choice for tab-strip animation if any future motion is added — but the current design explicitly uses CSS transitions, not AutoAnimate, which is consistent with the table's "zero config" intent. No deviation from Quick-Pick required.

## Design-Doc Edits Required
none — the bug fix aligns the implementation **to** the existing spec. ui-design.md §6.4 already says "4 destinations: Dashboard, Library, Progress, Settings" (full names). No spec edit needed.

## Open Questions
1. **Icons** — agent-2-navigation.md lines 75–79 + 417–421 specify an icon above each label (Phosphor regular: `ChartBar`/`BookOpen`/`ChartLine`/`Gear`, 24×24, 8px top padding, 4px gap before label). Current impl renders text only. The user's complaint focuses on label legibility, not the missing icons — should the icon-above-label pattern be added in scope, or left as a separate (much larger) follow-up? My recommendation: separate follow-up; isolating the string-only change keeps regression risk minimal and the user's literal request was "clearly readable what each one is for, not just showing the first letter or half of the word" — which is fully resolved by the string change alone. Confirm with user.
2. **i18n key naming** — should `t.nav.shortLabel.*` be renamed to `t.nav.tabBarLabel.*` now that it's no longer "short"? My recommendation: defer; the rename would touch unrelated call sites and adds churn. Comment update on line 53 is sufficient.
