# Enrichment — UX Auditor (Accessibility / WCAG AA)

**Persona:** ux-auditor (Pass 2)
**Lens:** `web-design-guidelines` + `ui-design/web-ui-guide.md`
**Scope:** All 6 Pass 1 fragments for Kalori + design-doc §15 accessibility
**WCAG target:** 2.1 AA, with AAA references where fragments claim AAA

Ratios below were recomputed from scratch against `bg-0 (#0E0A08)`, `bg-1 (#15100D)`, and `bg-2 (#1E1815)` using the relative-luminance formula from WCAG 2.1 §1.4.3. They disagree with Agent 1 §2.1 and §7.1 in several places — those are **auditor re-runs** flagged as corrections.

---

## 1. WCAG AA Contrast Audit

### 1.1 Corrected contrast table (auditor re-run)

| Foreground | `bg-0` | `bg-1` | `bg-2` | `bg-quote` | Normal-text AA (4.5:1) |
|---|---|---|---|---|---|
| `ivory` #F4EBDC | **16.67** | 15.98 | 14.84 | 15.52 | All AAA |
| `sand` #C9BDA8 | 10.63 | 10.19 | 9.47 | 9.90 | All AAA |
| `dust` #8A8173 | **5.13** | 4.92 | **4.57** | 4.78 | All AA (borderline on bg-2) |
| `dust-2` #6B6156 | 3.26 | 3.12 | **2.90** | 3.03 | ⚠ Large/UI only; **fails on bg-2** |
| `oxblood` #8A2A1F | 2.28 | 2.19 | 2.03 | 2.12 | ❌ **Text-use fail everywhere** |
| `oxblood-soft` #A13A2C | **2.96** | 2.84 | 2.64 | 2.76 | ❌ **Fails UI 3:1 on bg-0 (2.96)** |
| `ember` #C8693B | 5.20 | 4.98 | 4.63 | 4.84 | AA small |
| `ochre` #B8894A | 6.30 | 6.04 | 5.61 | 5.87 | AA small |
| `moss` #5C6B3D | 3.40 | 3.26 | 3.03 | 3.17 | Large text only; text-fill needs adjacent label |
| `slate` #4A5764 | 2.66 | 2.55 | 2.37 | 2.48 | ❌ Non-text only |
| `plum` #5D3A44 | 2.02 | 1.94 | 1.80 | 1.88 | ❌ Non-text only |
| `rule` #2A2320 | 1.28 | 1.22 | 1.14 | 1.19 | ❌ **Never 3:1 — decorative only** |
| `rule-strong` #3A3029 | 1.53 | 1.47 | 1.37 | 1.43 | ❌ **Never 3:1 — decorative only** |

### 1.2 Violations found in Agent 1 §2.1 and §7.1 (corrections required)

**V1. `ivory` on `bg-0` = 16.67:1, not 15.86:1.** Cosmetic; still AAA. (Agent 1 §2.1, line 32.)

**V2. `sand` on `bg-0` = 10.63:1, not 10.18:1.** Cosmetic; still AAA. (Agent 1 §2.1, line 33.)

**V3. `dust` on `bg-0` = 5.13:1, not 4.68:1.** Cosmetic; passes AA small-text. (Agent 1 §2.1, line 34.)

**V4. `dust` on `bg-1` = 4.92:1, not 3.91:1.** This correction is load-bearing: Agent 1 §3.5 and §7.1 explicitly ban `dust` on `bg-1` as "AA fail below 18px"; auditor re-run shows **`dust` on `bg-1` passes AA small-text (4.92:1 ≥ 4.5:1)**. The lint rule forbidding `.label` on `bg-1` unless it's `sand` is over-strict. Recommendation: keep the rule (aesthetic consistency) but note the contrast floor is actually safe, so the occasional exception is survivable.

**V5. `dust` on `bg-2` = 4.57:1, borderline.** Agent 1 doesn't flag this explicitly. At 4.57:1 it squeaks past AA (4.5:1) but with a 0.07 margin — any font-rendering variance (stroke hinting, sub-pixel shift) can push it under. **Action:** on `bg-2` surfaces, escalate all `dust` text to `sand` (9.47:1). Affects meta chips inside `.chart-card` (Agent 6 §1, §3, §4), the Water Tracker card header (Agent 3), and the Micronutrient Panel eyebrow (Agent 3).

**V6. `oxblood` as text = 2.28:1, not 2.86:1.** Agent 1 §2.1 line 36 reports 2.86:1 — auditor re-run is 2.28:1 (materially worse). Impact: **oxblood text on `bg-0` is not "borderline AA large" — it fails even the 3:1 large-text threshold.** Every place oxblood appears as text is a hard violation (WCAG 1.4.3).

**V7. `oxblood-soft` on `bg-0` = 2.96:1, not 3.70:1.** Agent 1 §2.1 line 37 reports 3.70:1 — auditor re-run is 2.96:1. Impact: **`oxblood-soft` at 18pt/14pt-bold is at the 3:1 floor but below it.** Every kicker rendered in `oxblood-soft` at 10.5px UPPERCASE **fails large-text AA.**

**V8. `moss` on `bg-0` = 3.40:1, not 3.48:1.** Minor; still just above the 3:1 UI floor.

### 1.3 New violations never flagged by Agent 1

**V9. Focus ring `oxblood` on `bg-0` = 2.28:1** — **fails WCAG 1.4.11 Non-text Contrast (3:1 for UI components).** Agent 1 §7.2 specifies the focus ring as 2px `oxblood` `#8A2A1F`. At 2.28:1 vs the bg-0 page void, the focus ring is not reliably visible. This is the system-wide focus ring. Required fix: **swap focus ring to `ivory`** (16.67:1 vs bg-0, meets 3:1 easily) or to a brighter oxblood (e.g., `#C83A2F`, ~3.5:1). Note: design-doc §15 line 773 already specifies "2px `ivory` outline" — the disagreement is inside Agent 1. Design-doc is correct; Agent 1 is wrong.

**V10. `slate` (#4A5764) as "water bar" fill on `bg-1` = 2.55:1.** Slate is used as the dashboard water bullet fill (Agent 3 §Water Tracker line 356). As a non-text data-viz element its required ratio is 3:1 (WCAG 1.4.11). **Fails.** Bullet is only distinguishable by shape (circle vs stroke) + count label; color-not-sole-signal saves it, but the color is still visually muddy. Recommendation: preserve `slate` bullets but pair with a visible stroke (already 1.5px rule-strong on empty — extend to filled so the outline persists).

**V11. `plum` (#5D3A44) as "5th data series" on `bg-0` = 2.02:1.** Declared "data-viz only" in Agent 1 §2.1, but at 2.02:1 it **fails WCAG 1.4.11 Non-text Contrast for adjacent data**; screen readers can't see the series line against the dark page. Agent 1 §2.2 and §2.1 table reports 2.62:1 — auditor re-run is 2.02:1. If `plum` is a chart series, the series line stroke needs to be thicker (≥1.5px) AND paired with a legend marker that reaches 3:1 elsewhere on the chart.

**V12. Hairlines (`rule`, `rule-strong`) 1.28:1 / 1.53:1 on bg-0 — intentional.** These are *decorative* and WCAG 1.4.11 excludes decorative hairlines that do not convey information. **However,** Agent 3 §Meals Bulletin describes "1px `rule` hairline separates data columns" — that's load-bearing (meaning the hairline divides semantically different meals). **Structural dividers must reach 3:1** or must be rendered with additional semantic demarcation. Current 1.28:1 fails. Recommendation: either (a) escalate load-bearing dividers to `rule-strong` + a 1.5px stroke width (still fails 3:1; tokenize a new `rule-structural` at ≥ #8A8173 level for meaningful separators) OR (b) ensure every semantic section has a heading above it so dividers become decorative.

**V13. Disabled controls (`dust` at 50% opacity).** Computed effective color = `#4C453D`, contrast vs bg-0 = **2.09:1.** Fails AA (small 4.5:1) and fails UI (3:1). WCAG 2.1 §1.4.3 exempts "inactive UI components" from contrast — so technically compliant — but WCAG 2.2 §2.4.13 (Focus Appearance) and WCAG 1.4.11 still expect disabled controls to be distinguishable. Recommendation: use `dust-2` (3.26:1) as the disabled token — still above the 2:1 "perceivable" floor and more accessible to low-vision users who need to see disabled states.

### 1.4 Fragment-specific contrast concerns

**Agent 2 §Mobile Bottom Tab Bar (lines 165–173):**
"Default: `dust` (#8A8173) icon + label." `dust` on `bg-1` = 4.92:1 — AA passes. But the icon + label are 24px + 10.5px. The 10.5px UPPERCASE label is *small text* and passes AA (4.92 ≥ 4.5). Good. **Consider `sand` instead** — at 10.19:1 it's an AAA signal that most users will read without effort, especially on mobile in variable outdoor lighting.

**Agent 3 §Micronutrient Panel (line 435):** `micro-pct` color per status — `low` is `oxblood-soft`. On `bg-1` the `oxblood-soft` numeric is **2.84:1 — fails AA small-text.** At 11px mono, this is non-negotiable. **Fix:** use `ember` (#C8693B, 4.98:1) for "low"-state numerals. Or use `ivory` numeral + an adjacent `oxblood-soft` status dot (color + shape).

**Agent 3 §Weekly Insight Card (line 509):** "VIEW FULL REVIEW →" link in `oxblood` at 10.5px UPPERCASE on `bg-2`. Contrast = 2.03:1. **Fails UI 3:1.** Fix: render the link in `ivory` with a 1px `oxblood-soft` bottom border underline.

**Agent 4 §TYPE tab line 90:** "Parsing…" label becomes `"dust` color overlay at 60% opacity." At 60%, effective color ≈ #5A5244 on bg-1 = **2.54:1 — fails UI.** Fix: "parsing" message should keep full `dust` opacity and use opacity on the *surface* (bg-1 → bg-2 tonal step) to signal lock.

**Agent 5 §5.3 Food name line 251:** "No italics here (divergence from mockup's italicization)" — but beyond italicization, the library-card name is at 16px Newsreader on `bg-0`. `ivory`/`bg-0` = 16.67:1. **Passes AAA.** Good.

**Agent 6 §Progress Range Toolbar (line 39):** Active chip = `ivory` background + `bg-0` text. That's **16.67:1 — passes AAA** but the *chip itself* (ivory background on bg-0 page) is an "inverted" tonal block. Adjacent chips (transparent bg, `sand` text) sit at 10.63:1. The visual weight difference is load-bearing for active/inactive differentiation, not solely color — good per WCAG 1.4.1. However, at `:focus-visible` the spec says "2px oxblood outline at 2px offset." Against a `ivory` chip background, oxblood vs ivory = 4.07:1 — passes. Against the `bg-0` adjacent surface for the offset-2 exterior: 2.28:1 — **fails UI 3:1.** The offset creates a multi-surface focus ring. Fix: use `ivory` focus ring on dark surfaces and `bg-0` focus ring on ivory chips; or adopt `oxblood`+`ivory` two-color outline (2px `ivory` + 1px `oxblood` — composite).

**Agent 6 §Heatmap ramp:**
- `c0` (#1F1613) at 0–10% DV: contrast vs bg-0 = **1.11:1** — essentially invisible. By design (signaling "total miss"), but adjacent cells need differentiation.
- `c0`/`c1` differentiation: 1.17:1. **Well below any discrimination threshold.** A user can't tell the difference between a 5% DV cell and a 20% DV cell. Fix: retune ramp so adjacent step contrast is ≥1.8:1 (minimum perceptible).
- Today-cell outline (1px `ivory`) vs heatmap cell is fine since ivory on even c9 is 2.6:1 at minimum, and on c0 is 15:1.

**Agent 6 §Weekly Review Island (line 406):** Drop cap `oxblood` (#8A2A1F) 82px on `bg-1`. At 82px, WCAG classifies this as "large text" (≥24pt/≥18pt-bold). Contrast = 2.19:1 — **fails even 3:1 large-text floor.** Fix: render drop cap in `oxblood-soft` (2.84:1, still fails) → must be `ember` (4.98:1) or `ivory` (15.98:1). If drop cap must be red-family per aesthetic, use `ember` at 82px — still decorative-leaning and editorial.

---

## 2. Focus Management Audit

### 2.1 Focus ring compliance

**Finding F1.** Agent 1 §7.2 specifies `outline: 2px solid var(--color-oxblood); outline-offset: 2px`. Design-doc §15 line 773 specifies `2px ivory outline, 2px offset`. These disagree. **Recommendation:** adopt design-doc's `ivory` ring as the system-wide default (contrast is sufficient on every surface including oxblood fills where text is ivory). Keep `oxblood` reserved for contextual indicators (active nav, input underline) where it is paired with text/weight changes.

**Finding F2 (Agent 4 §Confirmation Screen, line 311):** "TYPE textarea focus: 2px `ivory` outline at 2px offset." Uses ivory — **correct**. But Agent 1 §7.2 says oxblood. Inconsistency between fragments. **Main agent must resolve on one ring color** — pick ivory.

**Finding F3 (Agent 2 FAB, line 195):** "Focus ring: 2px `oxblood` outline 2px offset around the square (doubled-up effect against the oxblood fill)." This is a user-described anti-pattern: the oxblood ring disappears against the oxblood fill. The "2px offset gap" relies on the fill ending 2px before the ring begins — and the gap exposes the bg-1 tab-bar underneath. Contrast of oxblood on bg-1 = 2.19:1 — **invisible.** **Fix:** use 2px `ivory` ring (contrast vs oxblood fill = 7.31:1 AND vs bg-1 surround = 15.98:1).

### 2.2 Keyboard-focusable element inventory

Cross-referencing fragments against the promise "every interactive element is keyboard-focusable":

| Element | Where | Focusable? | Ring specified? | Notes |
|---|---|---|---|---|
| Masthead wordmark | Agent 3 | No (not interactive) | n/a | ✓ correct |
| Chronometer empty-state CTA | Agent 3 §Chronometer line 82 | Yes `<button>` | ✓ "visible focus ring" implied | ✓ |
| Meals bulletin entry row | Agent 3 §Meals Bulletin line 302 | Yes | ✓ `.focus-editorial` | ✓ |
| Meals bulletin `⋯` context-menu button | Agent 3 line 282 | Yes | ✗ **not explicit** | **Flag:** "hover `⋯` button" is desktop-only. On keyboard, how does the user reach the menu? Spec says "Long-press OR right-click OR hover `⋯`" — no keyboard equivalent. **Required:** add `Shift+F10` or `Menu` key to open context menu on focused entry row (standard pattern). |
| Water quick-add chips | Agent 3 line 362 | Yes | ✓ "2px `color-text-ivory` outline offset-2" | ✓ |
| Water bullet | Agent 3 line 356 | n/a `aria-hidden="true"` | n/a | ✓ |
| Micronutrient "+ N MORE" | Agent 3 line 439 | Yes | ✓ implied | ✓ |
| Weekly insight "GENERATE" button | Agent 3 line 491 | Yes | ✓ `focus-ring` token | ✓ |
| Log FAB | Agent 2 line 195 | Yes | ⚠ oxblood on oxblood (F3 above) | **Fix ring color** |
| Log modal close / backdrop | Agent 4 | ⚠ backdrop click is focusable? | no | **Flag:** modal backdrop is typically non-focusable; confirm that Escape is the only keyboard-close (which is fine). |
| Portion Picker `−`/`+` buttons | Agent 4 line 257 | Yes | ✗ not explicit | Flag: confirm 2px ivory ring on each 44×44 button |
| Confirmation Why-panel disclosure | Agent 4 line 336 | Yes (role=button via double-rule) | ✗ not explicit | Flag: add `focus-editorial` and `aria-expanded` |
| Confirmation meal chips | Agent 4 line 355 | Yes | ⚠ no ring spec | Flag: add 2px ivory ring |
| Confirmation time field | Agent 4 line 369 | Yes native | ✓ inherits | ✓ |
| Save-to-library toggle | Agent 4 line 378 | Yes | ✗ not explicit | Flag: must be `role="switch"` (per Agent 6 settings §line 724 pattern) with ring |
| Undo toast UNDO link | Agent 4 line 482 | Yes | ✓ "focusable; `Enter` activates" | ✓ |
| Library grid cards | Agent 5 line 275 | Yes | ✓ 2px `oxblood` inset | **⚠ Re-check: oxblood on bg-0 = 2.28:1, fails UI 3:1. Swap to ivory.** |
| Library search `/` hotkey chip | Agent 5 line 74 | n/a (decorative) | n/a | ✓ |
| Library select checkbox chip | Agent 5 line 285 | Yes (whole card) | ✓ via card | ✓ |
| Merge dialog radio buttons | Agent 5 §8.4 | Yes | ✗ not explicit | Flag: explicit ring spec on each radio |
| Merge dialog CUSTOM input | Agent 5 line 566 | Yes native | ✓ | ✓ |
| Delete confirm CANCEL / DELETE | Agent 5 §9.3 | Yes | ✓ implied | ✓ |
| Progress range chips | Agent 6 line 39 | Yes tablist | ✓ 2px oxblood | **⚠ Fix: ivory ring or 3:1-safe color** |
| Heatmap cell buttons | Agent 6 line 321 | Yes | ⚠ outline-offset: -2px inset (clips adjacent) | Flag: confirm visual clarity — use a thicker 3px ivory inset and a 1px oxblood-soft inner line for pattern |
| Onboarding step chips | Agent 6 §Steps 4+7 | Yes | ✓ "2px oxblood" | **⚠ Fix ring color** |
| Settings subsection rail links | Agent 6 line 651 | Yes | ✗ not explicit | Flag: explicit ring + `aria-current="page"` |
| Settings toggle switches | Agent 6 line 727 | Yes | ✓ `role="switch"` | ✓ |
| Account delete checkbox | Agent 6 line 776 | Yes native | ✓ | ✓ |
| Login email/password inputs | Agent 6 line 884+ | Yes native | ✓ inherits | ✓ |
| Login reveal-password button | Agent 6 line 891 | Yes | ✓ 44×44 | Flag: needs explicit ring |
| Login OAuth Google button | Agent 6 line 901 | Yes | ✗ not explicit | Flag: add ring |
| PWA install modal buttons | Agent 6 line 1017 | Yes | ✓ inherits | ✓ |

### 2.3 ESLint `no-outline-none` rule audit

Agent 1 §7.2 and §9.3 specify `no-outline-none` ESLint rule. **Audit confirms the rule as specified is too narrow.** Current AST selector matches only literal `outline: none` — it misses:
- `outline: 0`
- `outlineStyle: "none"` and `outlineStyle: 'none'`
- `outline-width: 0` (equivalent suppression)
- CSS-in-JS: `css\`outline: none\``

**Required update:**
```js
"no-restricted-syntax": [
  "error",
  {
    selector: "Property[key.name='outline'][value.value=/^(none|0|0px)$/i]",
    message: "Use focus-visible:outline-ivory instead of outline: none."
  },
  {
    selector: "Property[key.name='outlineStyle'][value.value='none']",
    message: "Use focus-visible:outline-ivory; outlineStyle: 'none' is banned."
  },
  {
    selector: "Property[key.name='outlineWidth'][value.value=/^0(px)?$/i]",
    message: "Zero outline width suppresses focus ring. Use focus-visible replacement."
  }
]
```

Additionally add a lint rule for raw Tailwind class usage: `outline-none` / `outline-0` / `focus:outline-0` — these are equivalent suppressions that bypass the AST rule.

### 2.4 Focus trap implementation

Agent 4 §Modal shell line 28 specifies `inert` attribute on background routes. Good — this is the modern replacement for manual focus-trap logic. However:
- **Agent 5 merge dialog §8.10:** `focus: trap` specified but no mention of `inert`. Confirm via `@radix-ui/react-dialog` which implements trapping natively.
- **Agent 5 bulk-delete dialog §9.6:** "focus lands on CANCEL (not DELETE) — destructive-action convention." ✓ Correct per standard.
- **Agent 4 §Undo Toast:** toast is inside `aria-live="polite"` but has a focusable UNDO link. When a toast appears, focus should *not* auto-shift to it (would interrupt user's current keyboard context). Confirm that `tabindex` is managed — include UNDO link in tab order while toast visible, but don't steal focus on appearance. Spec says "focusable; `Tab` includes it in natural tab order" — correct.
- **Agent 6 §Account Delete Step 3 line 783:** countdown enables DELETE NOW. When countdown reaches 0, focus should remain where user left it (on CANCEL) — don't auto-shift to the now-enabled DELETE. Spec doesn't address this; flag as required. Violating this is a classic "mis-click because focus moved" hazard.
- **Agent 6 §Onboarding:** Step-by-step modal-like flow; each step replaces content; focus order specified (input → BACK → NEXT). Confirm that on step advance, focus lands on the first interactive element of the new step, not on NEXT (preserving keyboard context). Spec line 632 says "focus order: input(s) → BACK → NEXT" which describes order, not *initial* focus. **Required:** on step entry, focus first input; on validation error, focus the failing input.

### 2.5 Skip-to-content link

Agent 1 §7.6 + Agent 2 §Skip link — specified. `<main id="main-content" tabindex="-1">` wraps content. ✓ Correct. Verify:
- Link appears as first focusable element (before masthead and sidebar).
- Link is visible on focus — spec shows `focus:top-2` which positions it correctly.
- Skip-link target must have `tabindex="-1"` and `focus({preventScroll:false})` called programmatically on click, otherwise Chromium-based browsers scroll but don't move focus. **Agent 2 §Skip link doesn't specify this explicit focus management.** Required.

---

## 3. Keyboard Navigation Completeness

### 3.1 Global shortcut registry audit (Agent 1 §7.4 + Agent 2 Keyboard Shortcuts)

| Key | Action | Registered | Toggleable? (WCAG 2.1.4) |
|---|---|---|---|
| `/` | Focus search | ✓ Agent 2 | ✓ Settings → "disable shortcuts" |
| `n` | Open log modal | ✓ Agent 2 (desktop/tablet only) | ✓ |
| `g d` | Nav to Dashboard | ✓ Agent 2 (2-key sequence, 1200ms window) | ✓ (leader-based, not single-char) |
| `g l` | Nav to Library | ✓ | ✓ |
| `g p` | Nav to Progress | ✓ | ✓ |
| `g s` | Nav to Settings | ✓ | ✓ |
| `?` | Shortcuts help overlay | ✓ | ✓ |
| `Escape` | Close modal, cancel edit | ✓ universal | (not single-char, always enabled) |
| `Tab` / `Shift+Tab` | Focus cycling | Native | Always enabled |

**WCAG 2.1.4 Character Key Shortcuts (A):** When a single-character key shortcut exists, it must be deactivatable, remappable, OR only active when component has focus. Kalori ships `/`, `n`, and `?` as single-char shortcuts. Agent 1 §7.4 mentions "Settings → a11y → disable keyboard shortcuts toggle" — **required fix:** this must be **implemented and tested**, not just mentioned. Include in Agent 6 §Settings → Display: `DISABLE KEYBOARD SHORTCUTS` toggle under the Display subsection.

### 3.2 Component-local keyboard nav

**Agent 4 §Log modal tabs (line 38):** "Keyboard navigation: `ArrowLeft` / `ArrowRight` moves between tabs when the tablist has focus; `Home` / `End` jumps to first/last." ✓ Per WAI-ARIA tablist pattern.

**Agent 4 §Library tab (line 240):** "ArrowDown/Up/Left/Right navigates cells; Enter selects." ✓ Per WAI-ARIA listbox pattern. Good.

**Agent 4 §Confirmation meal slot picker (line 366):** "`1` / `2` / `3` / `4` jumps to each slot." This is a single-digit shortcut — **violates WCAG 2.1.4** unless toggleable. Either (a) require focus to be inside the picker (correct), or (b) use ArrowLeft/Right within a radiogroup pattern instead. Spec says "when confirmation focus is inside the slot picker" — that's a focus-scope guard, which satisfies the WCAG exception. ✓

**Agent 5 §Library card keyboard (line 305):** `Enter` opens drill-in (non-select); `Space` toggles selection (select mode) AND opens drill-in (non-select). `Space` doing two different things based on mode is common but confusing. **Standard pattern:** Enter = primary action, Space = toggle checkbox (when in select mode). In select mode, Enter should also toggle (not conflict). Non-select mode, Enter/Space both open drill-in. ✓ (matches spec)

**Agent 5 §Tools rail:** "`/` focus search" — already in global. "`m` merge" only when exactly 2 selected — single char; needs focus guard. Spec says "while select mode is on and bar is visible" — that's a focus guard. ✓

**Agent 5 §Merge dialog §8.10 line 663:** "Tab order: field-by-field, A → B → (C if present) per row." ✓

**Agent 6 §Heatmap (line 325):** "arrow keys navigate 2D grid" with `aria-activedescendant` on `role="grid"`. ✓ Per WAI-ARIA grid pattern. Confirm: Tab enters the grid at first cell (as opposed to every cell being in tab order). Spec doesn't explicitly say — required per grid pattern.

**Agent 6 §Tablist (line 72):** "Left/Right arrows navigate chips" per WAI-ARIA tablist. ✓

**Agent 2 Desktop Sidebar (line 96):** "Arrow Up/Down cycle through nav items." ✓ Per WAI-ARIA menu pattern.

### 3.3 Missing keyboard paths

**M1.** Context menu on entry row (Agent 3 §Meals Bulletin) — no `Shift+F10` or `Menu` key. **Required:** add keyboard handler on the focused entry row.

**M2.** Food library card hover `⋯` — desktop-only. **Required:** `Menu` key on focused card opens context menu.

**M3.** Long-press on mobile for context menu — pairs with `aria-haspopup="menu"`. Spec doesn't mention `aria-haspopup` on cards. Required.

**M4.** Drawer/sheet dismissal — "swipe-down" (Agent 5 §7.1 line 377) is mobile-only. **Required:** keyboard Escape AND `Shift+F10` alternate for dismissal via keyboard.

**M5.** Portion Picker stepper (Agent 4 §Portion Picker line 254) — `−`/`+` buttons are keyboard-operable via Enter/Space on each. **Required additional:** ArrowUp/ArrowDown on the focused value display increments/decrements (more efficient keyboard path).

**M6.** Onboarding Step 8 slider (Agent 6 line 598) — native `<input type="range">` already supports ArrowLeft/Right and Home/End. ✓ Confirm implementation uses native range, not CSS-only widget.

**M7.** Water Tracker `+Glass` / `+Bottle` buttons (Agent 3 §Water Tracker line 362) — keyboard Enter on focused button. ✓. **Required:** numeric hotkey (e.g., `G` for glass) would be a power-user boost but optional.

**M8.** Progress range chips (Agent 6 §Toolbar) — tablist arrows. ✓

---

## 4. ARIA Attribute Audit

### 4.1 Global ARIA inventory

| Attribute | Expected | Fragment spec | Gap |
|---|---|---|---|
| `aria-current="page"` | Active nav link | ✓ Agent 2 §line 358 | — |
| `aria-expanded` | Collapsible (sidebar rail, Why-panel, disclosures) | ✓ Agent 2 §line 141, Agent 3 Why-panel (implicit), Agent 3 overflow (§Micronutrient) | **Gap M4.1** |
| `aria-live` on Undo toast | `polite` | ✓ Agent 4 §line 563 | — |
| `aria-live` on errors | `assertive` | ✓ Agent 1 §line 536, Agent 4 §Save failure | — |
| `aria-live` on save confirm | `polite` | ✓ Agent 4 §line 171 | — |
| `aria-label` on icon-only buttons | every one | ✓ Agent 1 §7.9 convention | **Audit: multiple gaps below** |
| `aria-describedby` linking help text | inputs | ⚠ Agent 6 Settings inputs no explicit | **Gap A4.5** |
| `role="dialog"` + `aria-modal="true"` | modals | ✓ Agent 5 §8.10, Agent 6 §Account Delete | — |
| `role="alert"` vs `role="status"` | ✓ Agent 1 §7.5 | — |

### 4.2 Fragment-by-fragment ARIA gaps

**A1. Agent 2 §Tablet Rail (line 141):** `aria-expanded="true|false"` on the `<nav>` container is correct. ✓ However, since rail expands on hover/focus-within automatically, `aria-expanded` should reflect the *computed* state — on pure hover (no keyboard focus), the rail is visually expanded but keyboard users haven't triggered it. Consider whether the `aria-expanded` attribute should track just focus-within state (for keyboard users) or both. **Required:** document this — aria-expanded should reflect whether the keyboard-focused user sees the expanded rail, not the visually-expanded state on pointer hover.

**A2. Agent 2 §Mobile FAB (line 193):** `aria-label="New log entry"` ✓ and `aria-haspopup="dialog"` ✓. Good.

**A3. Agent 3 §Chronometer Ring (line 130):** `role="img"` with `aria-label` summary. ✓ Complete.

**A4. Agent 3 §Macro Bars (line 196):** `role="meter"` + full `aria-label`. ✓ But WAI-ARIA 1.2 deprecates `role="meter"` in favor of `<meter>` element. Keep `role="meter"` for compatibility (widely supported) and also add `aria-valuenow`, `aria-valuemin`, `aria-valuemax`. ✓

**A5. Agent 3 §Meals Bulletin entry row:** spec says "each entry is an `<article>` with `aria-label=...`" (line 298). ✓ But note: the entry row is also interactive (tap opens sheet, long-press opens menu). `<article>` is a landmark; double-duty as an interactive element needs `role="button"` OR the actual `<button>` wrapping. **Required:** wrap interactive entry rows with an inner `<button>` rather than relying on `<article>` + click handler. Spec is ambiguous; confirm.

**A6. Agent 3 §Water Tracker (line 376):** `role="group"` + `aria-label="Water intake, {consumedMl} milliliters of {targetMl}"`. ✓

**A7. Agent 3 §Weekly Insight Card (line 524):** `<article aria-labelledby="weekly-insight-header">` ✓. `aria-busy="true"` during generating ✓.

**A8. Agent 4 §Log modal shell — no explicit role="dialog" aria-modal="true".** **Required:** modal shell must be `role="dialog" aria-modal="true" aria-labelledby={tab title}` (tab title changes per active tab).

**A9. Agent 4 §Type tab parsing (line 109):** `aria-live="polite"` for "Parsing…", "Parsed 3 items", "Parse failed". ✓

**A10. Agent 4 §Confirmation screen:** no explicit `aria-labelledby`. **Required:** `<form role="dialog" aria-modal="true" aria-labelledby="confirmation-title">` where title is the "KALORI'S LEDGER READS" text.

**A11. Agent 4 §Why-panel disclosure (line 336):** should be `<button aria-expanded={boolean} aria-controls="why-body-id">`. Spec shows as a row with caret but no explicit ARIA. **Required.**

**A12. Agent 4 §Save-to-library toggle (line 378):** `role="switch" aria-checked={boolean}`. Spec doesn't specify. **Required.**

**A13. Agent 4 §Undo toast (line 563):** `role="status"` ✓ + `aria-live="polite"` ✓. UNDO link is `<button>` ✓. Countdown bar: decorative, `aria-hidden="true"` required to prevent screen readers from trying to read a depleting bar.

**A14. Agent 5 §Library grid (line 878 table):** "grid role, row-major tab order" — needs `role="grid"` with `role="row"` and `role="gridcell"`. Spec doesn't spell this out. **Required.**

**A15. Agent 5 §5.5 selection chip:** decorative, so `aria-hidden="true"` on the chip. The card itself bears `aria-checked="true|false"` when in select mode. **Required.**

**A16. Agent 5 §Merge dialog radios (§8.4):** `<input type="radio" name="field-kcal" aria-describedby="field-kcal-label">`. Spec shows decorative radios; confirm native `<input>`-backed.

**A17. Agent 5 §Merge dialog live preview (§8.5):** `aria-live="polite"` on off-screen summary. ✓

**A18. Agent 5 §Bulk delete (§9.3):** confirm dialog title "DELETE {N} ITEMS?" should be `aria-labelledby="delete-title"` and body `aria-describedby="delete-body"`. **Required.**

**A19. Agent 6 §Progress toolbar (line 72):** `role="tablist"` / `role="tab"` / `aria-selected` / `aria-controls`. ✓

**A20. Agent 6 §Heatmap (line 322):** cells as `<button>` with `aria-label` and `aria-describedby` linking to legend. ✓. **Required addition:** `role="grid"` on the table, `role="gridcell"` on each data cell, `role="rowheader"` on nutrient-name cells, `role="columnheader"` on day cells. The `<table>` element + `<thead>` / `<tbody>` / `<tr>` / `<th>` / `<td>` gives you most of this *implicitly* — ✓ using semantic HTML is correct. But the cells being buttons inside `<td>` is the right pattern.

**A21. Agent 6 §Weekly Review failure state:** spec doesn't include `role="alert"` for the error banner. **Required** when AI fails.

**A22. Agent 6 §Onboarding progress (line 488):** `role="progressbar" aria-valuenow aria-valuemin aria-valuemax aria-label`. ✓ Complete.

**A23. Agent 6 §Settings toggles (line 727):** `<button role="switch" aria-checked>`. ✓

**A24. Agent 6 §Account delete countdown:** `aria-live="polite"` on the 10 → 0 counter. Spec line 824 confirms. ✓. Also required: `aria-atomic="true"` so full countdown string re-announces.

**A25. Agent 6 §PWA install modal:** `role="dialog" aria-modal="true"` ✓. Install button `aria-label="Install Kalori as a home screen app"` ✓.

### 4.3 Cross-cutting ARIA pattern consolidation

All fragments reference Agent 1's ARIA live-region rules (§7.5). **Required:** create a shared `<LiveRegion>` component in `lib/a11y/LiveRegion.tsx` that takes `politeness: 'polite' | 'assertive'` and ensures every live region DOM node is created at app start (empty), not on-demand. Screen readers only announce updates to **pre-existing** `aria-live` nodes; a dynamically-mounted `aria-live` region may silently fail to announce.

---

## 5. Screen Reader UX

### 5.1 Landmarks audit

| Landmark | Required | Fragments |
|---|---|---|
| `<header>` | Masthead / top bar | ✓ Agent 2 mobile top strip, Agent 3 Dashboard masthead (implicit — should be `<header>` wrapping `<h1>`) |
| `<nav aria-label="Primary">` | Sidebar, rail, bottom tab | ✓ Agent 2 §line 346 |
| `<main id="main-content">` | Primary content | ✓ Agent 1 §7.6 |
| `<aside>` | Right panel (dashboard) | **Gap** — Agent 3 §Dashboard Page Composition describes 3-column layout; right-panel should be `<aside aria-label="Daily audit">` wrapping water + micros + insight. |
| `<footer>` | Page footer | **Gap** — no footer in any fragment. If app has no footer that's fine, but skip-link target should be confirmed. |

### 5.2 Heading hierarchy per page

**Dashboard:** `<h1>` = Kalori wordmark. Section kickers (`§ 01 · TODAY'S INTAKE`) should be `<h2>`. Card titles within sections (`THE CHRONOMETER`, `THE MACROS`, etc.) should be `<h3>`. **Gap:** Agent 3 fragments use `.c-title` and kicker div with no semantic heading — required to use `<h2>` / `<h3>` under the masthead `<h1>`.

**Library:** `<h1>` = masthead wordmark OR "THE LIBRARY" (decide). Section kicker `§ 03` = `<h2>`. Drill-in sheet: `<h2>` for food name (when sheet opens, inject heading level).

**Progress:** `<h1>` = "THE ALMANAC" (Agent 6 §line 16). Section kickers `§ 05`–`§ 10` = `<h2>`. Chart titles = `<h3>`. Weekly Review = `<h2>` inside its own Suspense section.

**Onboarding:** Each step has a step title (`"What should we call you?"`) — use `<h1>` at step level since onboarding is a single-purpose route. **Gap:** Agent 6 onboarding doesn't specify heading level.

**Settings:** `<h1>` = "Settings". Subsection titles = `<h2>`.

### 5.3 Icon-only button labels

Cross-reference every icon-only button to confirm `aria-label`:

| Button | Icon | `aria-label` | Status |
|---|---|---|---|
| FAB | + | "New log entry" | ✓ Agent 2 §195 |
| Sidebar hamburger (rail-pinned toggle) | — | "Pin sidebar" | **Gap** — Agent 2 §306 mentions hamburger but no label |
| Modal close X | × | "Close" | **Gap** — Agent 4 shell, Agent 5 drill-in, Agent 6 modals — no explicit label |
| Back chevron | « | "Back" (desktop nav) or "Back to Library" | ✓ Agent 5 §7.3 |
| Meals bulletin ⋯ | ⋯ | "More actions for {food name}" | **Gap** — Agent 3 §282 doesn't specify |
| Water correction button | — | "Correct water entry" | ⚠ Agent 3 water tracker doesn't specify |
| Library selection checkbox | ✓ | via containing card `aria-checked` | ✓ |
| Library context menu trash | 🗑 | "Delete this item" | **Gap** — Agent 5 §484 icon-only trash |
| Password reveal | 👁 | "Show password" / "Hide password" | ✓ Agent 6 §line 891 |
| Heatmap cell button | — | full `aria-label` with nutrient/date/value/pct | ✓ |

### 5.4 Visual-only distinctions paired with text/ARIA

| Visual-only | Second channel | Status |
|---|---|---|
| Active nav oxblood border | Ivory text weight + `aria-current="page"` | ✓ |
| On-target macro color | "On target" label | ✓ Agent 1 §7.7 |
| Approaching macro | "Approaching" label | ✓ |
| Over-target macro | "!" glyph + "over" text | ✓ |
| Error red | `!` glyph + text | ✓ |
| Success moss | `✓` glyph | ✓ |
| Heatmap cell color | Tooltip with numeric value + % | ✓ |
| Today-in-progress indicator (today cell in heatmap) | 1px ivory outline + suffix "· today, in progress" in aria-label | ✓ |
| Low-micronutrient oxblood-soft numeral | `!` glyph prefix on name | ✓ |
| Calendar dots (section-kicker) | Decoration; no status | n/a |

### 5.5 Chart data alternatives

Every chart in Agent 3 + Agent 6 requires `<details><summary>Data table</summary>` with raw data. Auditor confirms Agent 1 §7.9 declares this as a system-wide rule. Fragments with charts:

| Chart | Fragment | Data-table drawer specified? |
|---|---|---|
| Chronometer ring | Agent 3 | Implicit via `aria-label` summary; **add explicit `<details>` drawer** for completeness |
| Macro bars | Agent 3 | Implicit via `role="meter" aria-label`; add drawer |
| Water bullets | Agent 3 | Implicit via `role="group" aria-label`; add drawer |
| Calorie adherence chart | Agent 6 §line 122 | ✓ explicit `<details><summary>View as table</summary>` |
| Macro distribution chart | Agent 6 | **Gap — not explicit** |
| Weight trajectory | Agent 6 | **Gap — not explicit** |
| Water adherence | Agent 6 | **Gap — not explicit** |
| Micronutrient heatmap | Agent 6 §line 326 | ✓ explicit `<details>` drawer |
| Weekly Review mini charts | Agent 6 | **Gap — not explicit** |

**Required:** every chart has the same `<details>` pattern. Add to Agent 6 fragment spec for all 4 missing charts.

---

## 6. Motion Safety

### 6.1 `prefers-reduced-motion` fallbacks per animation

| Animation | Fragment | Reduced-motion spec | WCAG 2.3.3 AAA compliance |
|---|---|---|---|
| Chronometer ring `chrono-draw` 600ms | Agent 3 §127 | Instant final state ✓ | ✓ |
| Macro bar fill transition | Agent 3 §190 | "width transition is instant; color swap is instant" ✓ | ✓ |
| Sidebar active-bar slide | Agent 2 §321 | Opacity crossfade 1ms ✓ | ✓ |
| Rail width expand | Agent 2 §325 | Instant ✓ | ✓ |
| Undo toast slide-up | Agent 4 §557 | Opacity-only crossfade ✓ | ✓ |
| Page `page-settle` | Agent 1 §393 | Hard cut ✓ | ✓ |
| FAB press scale | Agent 2 §201 | Disabled; opacity flash ✓ | ✓ |
| FAB ember ripple | Agent 2 §202 | Disabled ✓ | ✓ |
| Heatmap row stagger | Agent 6 §356 | Instant ✓ | ✓ |
| Bulk action bar slide | Agent 5 §358 | Crossfade only ✓ | ✓ |
| Log modal slide-up (mobile) | Agent 4 §22 | Opacity-only crossfade ✓ | ✓ |
| Confirmation phase "ink-fade" 600ms | Agent 4 §303 | 180ms crossfade ✓ | ✓ |
| Weekly review drop cap stagger | Agent 3 §519 | No drop-cap sequence ✓ | ✓ |
| Merge dialog content scale | Agent 5 §651 | 1ms ✓ | ✓ |
| Library card hover bg swap | Agent 5 §273 | 1ms ✓ | ✓ |
| Library card press scale | Agent 5 §274 | 1ms ✓ | ✓ |
| Onboarding progress dash rule-draw | Agent 6 §486 | Instant color swap ✓ | ✓ |
| Export modal spinner | Agent 6 §841 | Text state "..." ✓ | ✓ |
| Account delete spinner | Agent 6 §799 | Text state ✓ | ✓ |
| PWA modal fade | Agent 6 | Not explicit | **Gap** |

**Gap M6.1:** PWA install modal needs explicit reduced-motion fallback. Add to Agent 6.

### 6.2 Reduced-motion semantics

Agent 1 §6.4 collapses all motion to **1ms** (effectively instant) for transforms, scale, translate. Crossfades (opacity-only) remain. The spec is consistent: *reduced motion = crossfades only, 1ms for all else.*

**Clarification needed:** WCAG 2.3.3 (AAA) says "motion animation triggered by interaction can be disabled, unless essential." Kalori's chronometer ring animation is *not* triggered by interaction (renders on mount); so it doesn't trigger 2.3.3 directly. But the animation should still be user-cancellable via prefers-reduced-motion. ✓ already handled.

**Clarification needed:** WCAG 2.3.1 (Level A, Three Flashes or Below Threshold) — no fragment shows flashing content. `ember-pulse` on FAB release is 180ms and not repeated. ✓

**Clarification:** `ember-pulse` on Undo Toast appears (Agent 3 §393) at 180ms + cross-fade. Agent 4 §Undo Toast countdown uses `motion-ember-pulse` (Agent 4 §371 on Water Tracker) — is this a flash? No, it's a single-shot pulse (scale 1→1.02→1 over 180ms). ✓ Not flashing per WCAG 2.3.1.

**Clarification:** Agent 4 §493 "countdown bar … uses 5 opacity steps (100% → 80% → 60% → 40% → 20% → 0%) at 1000ms intervals — same semantic information, zero motion." ✓ Discrete steps, no flashing.

**Clarification:** Agent 3 §Weekly Insight "generating" state line 518 "`DRAFTING...` chip pulses opacity 0.4→1.0 on 1.2s loop." Under reduced motion: "opacity fixed at 0.85, no pulse loop." ✓ But pulse itself (no reduced-motion) is **below** WCAG 2.3.1 threshold (more than 3 flashes per second would violate). 1.2s per cycle = 0.83 Hz, well below 3 Hz. ✓

### 6.3 Motion opt-out in settings

Agent 6 §Settings line 695: "**Reduce motion:** toggle (mirrors `prefers-reduced-motion`; overrides OS preference if explicitly set — Agent 1 §7.9)." ✓ Required. Confirm it also *reduces* when OS says reduce (additive, never canceling user preference).

---

## 7. Form Accessibility

### 7.1 Label association audit

| Input | Fragment | `<label for>` or wrap? | Status |
|---|---|---|---|
| TYPE textarea | Agent 4 §70 | Placeholder only | **Gap — required to label above** |
| Library search input | Agent 5 §68 | Placeholder only | **Gap — required to label above** |
| Log search (Agent 4 Library tab) | Agent 4 §181 | Placeholder only | **Gap — sr-only label** |
| Portion Picker value | Agent 4 §257 | Implicit via stepper buttons | ⚠ Required `<label>` wrapping or `aria-label` |
| Meal slot chips | Agent 4 §355 | Implicit via kicker | ⚠ Required `role="radiogroup" aria-labelledby` |
| Time editor field | Agent 4 §369 | `"LOGGED AT"` kicker | ✓ needs `<label for>` |
| Save-to-library toggle | Agent 4 §378 | Row label | ✓ needs `aria-labelledby` |
| Merge dialog radio buttons | Agent 5 §564 | Field label | ✓ implicit; confirm `<label for>` per radio |
| Merge dialog CUSTOM input | Agent 5 §566 | "CUSTOM" label | ✓ confirm `<label for>` |
| Bulk delete confirm | Agent 5 §711 | — | n/a (no input in dialog) |
| Onboarding name input | Agent 6 §521 | "NAME" kicker | **Gap — required `<label for>`** |
| Onboarding DOB input | Agent 6 §533 | Title | **Gap** |
| Onboarding height/weight | Agent 6 §555, §564 | Title | **Gap** |
| Onboarding activity chips | Agent 6 §575 | "How active" title | ✓ needs `role="radiogroup" aria-labelledby` |
| Onboarding goal + slider | Agent 6 §597 | Goal chips label | ✓ confirm `radiogroup` |
| Settings profile name | Agent 6 §666 | "Name" field | ✓ inherits from pattern |
| Settings date of birth | Agent 6 §666 | "Date of birth" | ✓ |
| Settings timezone select | Agent 6 §693 | "Timezone" | ✓ |
| Settings recalc threshold dropdown | Agent 6 §684 | Label | ✓ |
| Login email | Agent 6 §884 | "EMAIL" label | ✓ |
| Login password | Agent 6 §888 | "PASSWORD" label | ✓ |
| Account delete email field | Agent 6 §767 | Title | **Gap — required `<label>`** |
| Account delete understand checkbox | Agent 6 §776 | `<label>` | ✓ |

**Rule:** every `<input>`, `<textarea>`, `<select>` — including radio/checkbox groups — must have an associated label. Placeholder-only is a WCAG 3.3.2 Labels or Instructions failure (even though labels exist in the visual kicker, screen readers need programmatic association via `for` / `aria-labelledby`).

### 7.2 Error message announcement

| Input | Error state | `aria-describedby`? | `aria-invalid`? |
|---|---|---|---|
| TYPE parse failure | Agent 4 §96 | Banner above textarea | **Gap** — need `aria-describedby` linking textarea to banner |
| Library search "no results" | Agent 5 §83 | Below search | **Gap** — announce via `aria-live` |
| Onboarding name empty | Agent 6 §524 | Caption `! Please enter a name` | **Gap** — `aria-describedby` |
| Onboarding DOB validation | Agent 6 §535 | Caption `! Enter a valid date` | **Gap** |
| Onboarding height range | Agent 6 §560 | Caption `! Enter a height...` | **Gap** |
| Onboarding weight range | Agent 6 §569 | Same pattern | **Gap** |
| Login invalid credentials | Agent 6 §908 | Banner above form | **Gap** — `aria-live="assertive"` + `aria-describedby` on form |
| Login field errors | Agent 6 §907 | Caption below field | **Gap** — `aria-describedby` linking field to caption |
| Account delete email mismatch | Agent 6 §769 | "moss check-glyph" appears | ✓ but no error for *mismatch* — which is the spec's intent (don't brute-guide user). OK. |

**Required:** pattern `<input id="name" aria-describedby="name-error" aria-invalid={isError}>` + `<span id="name-error" role="alert" aria-live="assertive">`.

### 7.3 Required field marking

Kalori's onboarding requires multiple fields (DOB, sex, height, weight, activity). No fragment specifies `aria-required`. **Required:** add `aria-required="true"` on all onboarding inputs *except* name (which is optional — skippable). Login requires email and password; add `aria-required="true"`.

### 7.4 Autofill attributes

| Input | Expected `autocomplete` | Specified? |
|---|---|---|
| Login email | `username email` | ✓ Agent 6 §886 |
| Login password (sign-in) | `current-password` | ✓ Agent 6 §890 |
| Login password (signup) | `new-password` | ✓ Agent 6 §890 |
| Onboarding name | `given-name` | **Gap** |
| Onboarding DOB | `bday` | **Gap** |
| Settings email | n/a (read-only) | — |
| Settings name | `given-name` | **Gap** |
| Settings DOB | `bday` | **Gap** |
| Delete email confirm | `off` or `username email` | **Gap** (spec shows placeholder hidden — probably best `autocomplete="off"` per UX intent) |

### 7.5 Input types

| Input | Expected type | Specified? |
|---|---|---|
| Login email | `type="email"` | ✓ implicit |
| Login password | `type="password"` | ✓ |
| Onboarding DOB | `type="date"` | ✓ Agent 6 §531 |
| Onboarding height/weight | `type="number" inputmode="decimal"` | ✓ Agent 6 §555 |
| Settings recalc threshold | `<select>` | ✓ |
| Time editor (Agent 4) | "native date + time input" | ✓ |
| Search input | `type="search"` | **Gap** — spec doesn't specify; required for iOS keyboard optimization |
| TYPE textarea | `<textarea>` | ✓ |
| Export filter (N/A) | — | — |

### 7.6 Password reveal button ARIA

Agent 6 §line 891: `aria-label='Show password' | 'Hide password'`. ✓. Also required:
- `aria-pressed={revealed}` toggle state (since it's a toggle button).
- OR use `role="switch" aria-checked={revealed}`.

### 7.7 Email case sensitivity (Agent 6 §767)

Account delete Step 2 requires case-sensitive email match. This is unusual — most auth providers normalize email to lowercase. Verify Supabase's email field is case-sensitive on match (it's not, by default). **Recommendation:** case-insensitive match is fine for the "type your email" affordance since the goal is intent confirmation, not security. If strict case-match is required for the delete flow specifically, add a visible note about case.

---

## 8. Touch Target Size

### 8.1 44×44 minimum audit

Agent 1 §7.3 declares `.tap-44` utility. Required on every interactive element.

| Target | Size | Status |
|---|---|---|
| Sidebar nav item | 56×56 | ✓ |
| Tablet rail item | 56×56 | ✓ |
| Mobile tab slot | 56×75 min | ✓ |
| Mobile FAB | 56×56 | ✓ |
| User strip avatar | 32×32 (inside 72px cell) | ⚠ Avatar is decorative; the hover-visible "SIGN OUT" link is the actual target — needs 44×44. **Gap** |
| Skip link | `px-3 py-2` | ⚠ Calculate: padding 3×3 = 12 horiz, 2×2 = 8 vert. Not explicit but "focus:px-3 focus:py-2" gives at minimum maybe 28×24px — **fails 44×44.** Required: pad to 44×44. |
| Meals bulletin add-entry `+add to X` | 44×32 | **Fail — 32px height < 44px.** Agent 3 §277. Required: min-height 44px. |
| Meals bulletin `⋯` button | 44×44 | ✓ Agent 3 §282 |
| Water chip buttons | 44×32 min | **Fail — 32px.** Agent 3 §358. Required 44px. |
| Water bullet | 16×16 | n/a (decorative) |
| Micronutrient "+ N MORE" | Full width button | ⚠ Required: 44px tall |
| Log modal tab | "Extra padding rather than visual weight" (Agent 4 §37) | ✓ 44×44 implied |
| Log modal PARSE button | 44 tall | ✓ |
| Library tab search | 44 tall | ✓ |
| Library tab grid card | ≥160×120 | ✓ |
| Portion Picker `−`/`+` | 44×44 | ✓ |
| Portion Picker preset chips | 44×44 min | ✓ |
| Portion Picker LOG THIS | 56 tall | ✓ |
| Confirmation meal chip | 96×44 min | ✓ |
| Confirmation time field | inline edit | ⚠ confirm 44 min |
| Save-to-library toggle | 48×24 | **Fail — 24px height.** Agent 4 §380. Required: 44×44 hit area (can visually be 48×24 but hit area pads to 44). |
| Weekly insight "VIEW FULL REVIEW →" link | 10.5px text | **Fail — must pad to 44×44 hit area** |
| Weekly insight "GENERATE WEEKLY REVIEW" | 44 tall | ✓ |
| Library card | ≥160×160 | ✓ |
| Library card context menu items | 40 tall | **Fail — 40px < 44px.** Agent 5 §317. Required: 44px. |
| Library select checkbox chip | 16×16 on card | ✓ via card |
| Tools rail SELECT button | `padding 10px 0` + text | ⚠ 44 required; calculate |
| Bulk action bar MERGE button | 44 tall | ✓ |
| Food detail sheet BACK link | 44×44 | ✓ |
| Food detail sheet inline edit input | 44 tall | ✓ |
| Food detail LOG NOW / EDIT / trash | 56 tall / 56 / 44×44 | ✓ |
| Merge dialog radio | 16×16 | ⚠ With row click-target ≥44, OK. Confirm row is the target not just the 16px dot. |
| Merge dialog MERGE button | 44 tall | ✓ |
| Bulk delete CANCEL/DELETE | 44 / 48 mobile | ✓ |
| Progress range chip | 10.5px + padding 10×22 = ~42px height? | **Borderline.** Required: 44px min. |
| Weight chart quick-add link | 10.5px | **Fail — must pad to 44×44** |
| Heatmap cell | 24×28 (desktop), 12×20 (mobile) | **Fail — cells are < 44px even on desktop.** Per WCAG 2.5.5 AAA; 2.5.5 AA requires 24×24. Desktop fails 24×28 on width only (OK per 24×24 rule). Mobile 12×20 **fails 24×24 UI requirement.** Fix: minimum cell 24×24 on mobile; reduce row count or transpose more aggressively. |
| Onboarding step chips (sex, activity) | `padding 24px` inside `max-width 200` | ✓ ~72×72 |
| Onboarding input field | 56 tall | ✓ |
| Onboarding range slider thumb | 16×16 | **Fail.** Agent 6 §603. Required: 44×44 hit area (can visually be 16×16, pad via `<input type="range">` native hit area which is typically 44 when properly styled; confirm). |
| Onboarding NEXT button | 14×32 padding = variable | Confirm 44 min |
| Settings subsection rail link | Row + 14px padding-left | Confirm 44 min |
| Settings chip toggles (kg/lb etc.) | 32 tall | **Fail — 32px.** Agent 6 §557. Required: 44px. |
| Settings MANAGE WEIGHT link | 10.5px text | **Fail — pad to 44×44** |
| Account delete checkbox | 16×16 | With row label as target, ✓ |
| Account delete CANCEL/DELETE | 44 tall | ✓ |
| Export CSV/JSON | 44 tall | ✓ |
| Login submit | 56 tall | ✓ |
| Login password reveal | 44×44 | ✓ |
| Login OAuth button | 56 tall | ✓ |
| PWA NOT NOW / INSTALL | 44 tall | ✓ |

**Summary of touch-target gaps (required fixes):**

1. User strip "SIGN OUT" hover link → 44×44 hit area
2. Skip link → pad to 44×44
3. Meals bulletin `+add to X` → 44×44 (currently 44×32)
4. Water chip buttons → 44×44 (currently 44×32)
5. Save-to-library toggle → 44×44 hit area (currently 48×24 visual)
6. Weekly insight "VIEW FULL REVIEW →" and similar inline links → 44×44 hit area via padding
7. Library card context menu items → 44×40 (currently 40×40)
8. Progress range chips → confirm ≥44 tall
9. Weight chart quick-add link → 44×44
10. Heatmap cells — mobile 12×20 is below WCAG 2.5.5 AA (24×24). Fix: adopt mobile transpose earlier OR enlarge.
11. Onboarding range slider thumb → 44×44 hit area
12. Settings chip toggles → 44×44

---

## 9. Color Not as Sole Signal

### 9.1 Status signals audit

| Status | Color | Second channel | Third channel | Status |
|---|---|---|---|---|
| On-target macro | moss | Label "on target" | `✓` glyph | ✓ |
| Approaching | ember | Label "approaching" | — | ✓ |
| Over-target | oxblood | `!` glyph | "over" text | ✓ |
| Active nav | oxblood border | Ivory text | weight change | ✓ + `aria-current="page"` |
| Error inline | oxblood text | `!` glyph | 1px oxblood top rule | ✓ |
| Form-field error | oxblood underline | oxblood caption | `aria-invalid="true"` | ✓ |
| AI confidence low | — | Italic serif "estimate" footnote | — | ✓ per Agent 1 §7.7 |
| Macro bar color (P/C/F) | ivory/ochre/ember | Position (top/middle/bottom) | Label | ✓ |
| Heatmap cell | c0–c9 gradient | Hover tooltip with numeric value + % | aria-label with status | ✓ |
| Calorie adherence bar color | moss/oxblood/ochre/ember | Label on bar (or legend) + `aria-label` | — | ✓ Agent 6 §88 |
| Water adherence bar | oxblood/moss at overfull | Target line + `aria-label` with ml + pct | — | ✓ |
| Today-in-progress cell | dashed ember stroke | Label "today" + 1px ivory outline (heatmap) | — | ✓ |
| Onboarding progress dash | oxblood filled | Count "step N of 8" | `aria-valuenow` | ✓ |
| Selected library card | oxblood inset border | Checkbox glyph | Scale 0.95 | ✓ |
| Disabled button | dust + low opacity | `aria-disabled="true"` | — | ⚠ dust@50% is 2.09:1 — insufficient. Required: `dust-2` instead. |
| Over-budget chip | oxblood | — | ⚠ confirm label | Confirm "OVER TARGET" text |
| Success toast | moss check glyph | "Saved." text | — | ✓ |

### 9.2 Colorblind consideration

**Deuteranopia/protanopia (most common red-green):** oxblood/moss distinction may flatten. But:
- Oxblood ≠ moss — oxblood is warm-red; moss is olive. In red-green color blindness, oxblood reads as brown/orange; moss reads as yellow-brown. Distinct.
- Fiber arc `ochre` vs fat bar `ember` — both orange-family. Could confuse. However, they're in different chart contexts (fiber is inner ring; fat is horizontal bar) so context saves them. ✓

**Tritanopia (blue-yellow):** moss (olive-green) vs oxblood (warm-red) — both desaturated but remain distinct. ✓

**Monochromacy (full):** heatmap ramp c0-c9 collapses. Cells still have hover tooltip with numeric pct. Data table drawer is the strongest fallback. ✓

---

## 10. Dark-Mode Specific Concerns

### 10.1 Pure-black / pure-white avoidance

`bg-0` = `#0E0A08` — warm near-black (not pure black). ✓
`ivory` = `#F4EBDC` — warm cream (not pure white). ✓
Both choices reduce OLED "pixel flicker" and minimize eye strain. ✓

### 10.2 Glow / bloom effects

Agent 1 §1 bans glassmorphism, shadows, and `backdrop-filter: blur()`. ✓ However, the mockup has "single radial glow at top of body" (§1 line 14). This is a decorative gradient, not a glow. Radial gradients at the masthead top are not bloom — they're static fill. ✓

### 10.3 Large saturated oxblood on dark

Oxblood is `#8A2A1F` — saturated warm red at 5.13:1 (vs bg-0). Large areas would vibrate and cause afterimages. **Usage audit:**

- **FAB fill:** 56×56 oxblood on bg-1 — large enough to notice. At 2.19:1 to bg-1, the FAB is the brightest spot in the layout. Acceptable because it's a single focal point. ✓
- **Oxblood button fills** (PARSE, SAVE TO LEDGER, LOG THIS, etc.): 56px tall × full-width on mobile, or 360px on desktop. This is a large area. Long-duration viewing could cause vibration. **Recommendation:** include periodic "rest" (tonal break) between oxblood fills; avoid stacking two oxblood buttons side by side. Fragments generally pair with dust secondary button (outline) — ✓ correct.
- **Letter-mark backgrounds** (Agent 5 §10.2): entire thumbnail zone fills with oxblood. Multiple cards in a grid × multiple oxblood fills = large saturated field. At 1:1 aspect on 4-column grid, that's ~4× 200px oxblood squares visible simultaneously. **Concern:** high potential for color fatigue. **Recommendation:** consider `#7a2418` (slightly darker) for letter-mark fills to reduce saturation, still maintaining ivory-on-oxblood 7:1+. Or break up with tonal variation (each card gets `bg-2 → oxblood@80%` gradient, or rotate between oxblood and a sibling brown).
- **Drop cap in Weekly Insight card:** Single large `oxblood` character, 82px, floating on `bg-1`. At 2.19:1, the drop cap reads as "reddish haze" against the background rather than a distinct letterform. **Required fix:** drop cap color must be at least 3:1 vs bg-1. Options: `ember` (4.98:1) or `ivory` (15.98:1). The brief may insist on oxblood for editorial voice; if so, render drop cap 90px Newsreader 400 (thicker stroke) + 1px `ivory` outline — still editorial but readable.

### 10.4 OLED black-pixel considerations

Pure black OLED = fully off pixel, zero power, zero light. `#0E0A08` ≈ 5% brightness — OLED pixel is ~on. Cost: minor battery. ✓ Acceptable trade for warmth.

---

## 11. Fragment-Specific WCAG Findings

### 11.1 Agent 1 (Foundations)

1. **V6 / V7 / V9:** Recompute contrast ratios in §2.1 table. Several values are incorrect by 0.3–0.9, some crossing AA boundaries. Fix published ratios to match auditor re-run; adjust `oxblood` usage rule to "fill and border only, never text." Agent 1 already says this for oxblood — ✓ but published ratio (2.86) is wrong; real is 2.28.
2. **Focus ring:** specify `ivory` not `oxblood`. Agent 1 §7.2 and §9.3 both need updates.
3. **`dust-2` on bg-2:** contrast 2.90 — fails any threshold. Document that `dust-2` is only permitted on `bg-0` or `bg-quote`, never on `bg-1` or `bg-2`.
4. **`no-outline-none` ESLint rule:** expand to catch `outline: 0`, `outline-width: 0`, `outline-style: none`, Tailwind `outline-none`/`outline-0`.
5. **Disabled state:** replace `dust` at 50% opacity with `dust-2` (3.26:1 on bg-0 vs 2.09:1 for the alpha blend).

### 11.2 Agent 2 (Navigation)

1. **Mobile FAB focus ring:** swap from oxblood to ivory (oxblood on oxblood fill = invisible).
2. **User strip "SIGN OUT" hover-only affordance:** required to be keyboard-reachable without hover (screen readers + keyboard users). Make it persistently visible with `dust` default + `ivory` hover; or collapse behind an explicit menu button (`Menu`/`⋮`) that's always visible.
3. **Add `Menu` key / `Shift+F10`:** handler on focused nav item to trigger a (potential) sidebar context menu (e.g., collapse/pin rail).
4. **Top bar aria-hidden consideration:** the mobile 40px top strip is purely informational (date + edition). Use `role="banner"` or wrap in `<header>`; `aria-labelledby` to both date and edition spans.
5. **Shortcut overlay `?`:** confirm `role="dialog" aria-modal="true" aria-labelledby="shortcuts-title"`.

### 11.3 Agent 3 (Dashboard)

1. **Meals bulletin add-entry button:** min-height 44px (currently 44×32).
2. **Water chip buttons:** min-height 44px.
3. **Meals bulletin entry row:** wrap in `<button>` or add `role="button"` with `tabindex="0"` — not just `<article>` with click handler.
4. **Chronometer empty-state CTA:** confirm as `<button>` with `aria-label` and `focus-editorial` ring.
5. **Weekly insight "VIEW FULL REVIEW →" link:** 44×44 hit area; consider rendering as `<a>` vs `<button>` (it navigates to a route, so `<a href>`).

### 11.4 Agent 4 (Log Flow)

1. **Modal shell:** explicitly declare `role="dialog" aria-modal="true" aria-labelledby={tab_title_id}`.
2. **Why-panel disclosure:** make it a `<button aria-expanded={boolean} aria-controls="why-body">`.
3. **Save-to-library toggle:** `<button role="switch" aria-checked>` with `aria-labelledby` to the row label.
4. **Meal slot picker:** `role="radiogroup" aria-labelledby="meal-category-label"` wrapping 4 `<input type="radio">` with labels.
5. **Confirmation title "KALORI'S LEDGER READS":** use as `aria-labelledby` on confirmation panel.

### 11.5 Agent 5 (Library)

1. **Library grid:** add `role="grid"` on container; `role="row"` on each grid row; `role="gridcell"` on cells.
2. **Library card focus ring:** swap from 2px oxblood (2.28:1 vs bg-0, fails) to 2px ivory (16.67:1, passes) or 3px oxblood (still fails 3:1). Best: 2px ivory.
3. **Library search input:** `type="search"` for iOS Search-key on keyboard.
4. **Context menu items:** min-height 44px (currently 40px).
5. **Merge dialog radio buttons:** explicit `<input type="radio" name="{field}" id="{field}-{option}" aria-labelledby="{field}-label"> + <label for>`.

### 11.6 Agent 6 (Progress & Remainder)

1. **Heatmap cells:** mobile cell size `12×20` fails WCAG 2.5.5 (24×24 AA). Required: retune mobile layout so cells are minimum 24×24 — achieve via transpose at 375px AND/or cap days-visible.
2. **Heatmap color ramp:** retune so adjacent steps have ≥1.8:1 contrast. Currently c0/c1 = 1.17:1, c5/c6 = 1.19:1 — users can't distinguish. Consider widening the color range (e.g., c0 starts at #2E1F1A not #1F1613 — slightly less dark).
3. **Weekly review drop cap:** render in `ember` (4.98:1) or `ivory` (15.98:1), not `oxblood` (2.19:1).
4. **Onboarding name input:** add `<label for="name">`, `aria-required="true"`, `autocomplete="given-name"`.
5. **Account delete countdown `aria-live`:** add `aria-atomic="true"` so entire string re-announces each update.
6. **Settings unit toggles (kg/lb etc.):** increase size to 44×44 hit area (currently 32 tall).
7. **Onboarding slider thumb:** confirm native `<input type="range">` with `aria-valuenow/min/max`; thumb hit area padded to 44×44.
8. **Onboarding activity chips:** `role="radiogroup"` with `aria-labelledby`; each chip a `<input type="radio">` with `<label for>`.
9. **Progress range chips:** swap focus ring color from oxblood to ivory.
10. **Chart `<details>` data-table drawers:** add explicit `<details><summary>View as table</summary><table>...</table>` for every chart (currently only specified for calorie adherence and heatmap).
11. **Weekly Review failure banner:** add `role="alert"` (assertive) when AI fails.
12. **Onboarding step advance:** explicit focus management — on step entry, focus first input, not NEXT button.

---

## 12. Testing Scaffolding for Accessibility

### 12.1 `@axe-core/playwright` — required in every E2E

Agent 1 §7.8 mentions "Test added to Playwright visual suite." Needs to be expanded: every page-level E2E test must include an axe pass.

**Required pattern** (for every Playwright test in `tests/e2e/`):

```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Dashboard', () => {
  test('has no detectable a11y violations', async ({ page }) => {
    await page.goto('/dashboard');
    const results = await new AxeBuilder({ page })
      .include('#main-content')
      .exclude('#decorative-radial-glow')  // known-safe decoration
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('chronometer ring is announced', async ({ page }) => {
    await page.goto('/dashboard');
    const ring = page.getByRole('img', { name: /logged today/ });
    await expect(ring).toBeVisible();
  });
});
```

### 12.2 Required axe assertions per fragment

| Fragment | Test file | Required assertions |
|---|---|---|
| Agent 1 Foundations | `tests/unit/tokens.test.ts` | Compute every color pair contrast via `color-contrast-checker`; assert AA for declared text uses |
| Agent 2 Navigation | `tests/e2e/navigation-a11y.spec.ts` | Axe pass on sidebar/rail/tab-bar; skip link focus; FAB ring visibility |
| Agent 3 Dashboard | `tests/e2e/dashboard-a11y.spec.ts` | Axe pass; chronometer `role="img"` accessible name; all macro bars have `role="meter"` |
| Agent 4 Log Flow | `tests/e2e/log-modal-a11y.spec.ts` | Axe pass on TYPE, SNAP, LIBRARY tabs; confirmation phase; undo toast announced |
| Agent 5 Library | `tests/e2e/library-a11y.spec.ts` | Axe pass on grid, drill-in sheet, merge dialog, bulk delete; keyboard nav through grid |
| Agent 6 Progress | `tests/e2e/progress-a11y.spec.ts` | Axe pass on all 6 chart sections; data-table drawers exist; heatmap cell buttons navigable via arrows |
| Agent 6 Onboarding | `tests/e2e/onboarding-a11y.spec.ts` | Axe pass on each step; labels associated; validation errors announced |
| Agent 6 Settings | `tests/e2e/settings-a11y.spec.ts` | Axe pass; toggles are `role="switch"`; error toasts `assertive` |
| Agent 6 Delete flow | `tests/e2e/account-delete-a11y.spec.ts` | Focus trap; countdown announced; cancel default-focused |
| Agent 6 Login | `tests/e2e/login-a11y.spec.ts` | Axe pass; field labels; autocomplete attrs |

### 12.3 Keyboard-only flow tests

Mandatory keyboard-only test flows (no mouse events allowed):

1. **Log flow keyboard:** open modal with `n` → Tab to PARSE → Enter to parse → Tab to confirmation items → Tab to meal chips → `1`/`2`/`3`/`4` select → Tab to SAVE TO LEDGER → Enter → Escape on undo toast.
2. **Library merge keyboard:** navigate to /library → Tab to SELECT → Enter → Arrow-select 2 cards → Space to toggle each → Tab to MERGE → Enter → `m` hotkey (alt path) → Tab through radio picks → Enter on MERGE » → Tab to UNDO toast → Enter → verify reverted.
3. **Account delete keyboard:** navigate to /settings → g s → Tab to account section → Tab to DELETE ACCOUNT → Enter → Tab to CONTINUE → Enter → Tab to email field → type email → Tab to DELETE MY ACCOUNT → Enter → Tab to checkbox → Space → wait 10s countdown → Tab to DELETE NOW → Enter.
4. **Heatmap cell keyboard:** navigate to /progress → Tab into heatmap → Arrow Right/Down to navigate cells → Enter to open tooltip → Escape to close → Tab out.
5. **Dashboard keyboard:** Tab through masthead → skip link → Tab to chronometer (empty CTA if no entries) → Tab to macro bars (focusable containers) → Tab to meals bulletin → Tab to first entry → Enter to open drill-in → Escape → Tab to `+add to breakfast` → Enter.

### 12.4 Screen-reader smoke tests

Manual reviews (not automatable) per release:

- NVDA + Chrome: read dashboard, verify all sections announced without duplication
- VoiceOver + Safari: read log flow modal, verify tab changes announced; confirmation + "Why these numbers?" expand announced
- TalkBack + Chrome Mobile: read mobile tab bar, verify FAB announces, confirm `aria-haspopup="dialog"` triggers screen-reader modal announcement
- JAWS + Edge: read onboarding, verify validation errors assertively announced

### 12.5 200% zoom test

Agent 1 §7.8 mentions `tests/e2e/zoom-200.spec.ts`. Must assert:
- `document.documentElement.scrollWidth <= window.innerWidth`
- No horizontal scrollbar
- Masthead text doesn't clip
- Chronometer center value doesn't clip
- Navigation items don't overlap

Run at breakpoints 375, 768, 1280 at 200% zoom.

### 12.6 `prefers-reduced-motion` test

Run every E2E with Playwright context `{ reducedMotion: 'reduce' }` and assert:
- No CSS transitions fire animations > 1ms
- Chronometer renders instantly (no `chrono-draw` 600ms)
- Heatmap rows render together (no stagger)
- Toast appears as crossfade, not slide

### 12.7 CI accessibility gate

Add to CI pipeline:
1. Lighthouse a11y score ≥ 95 on dashboard, library, progress (blocking)
2. Every `@axe-core/playwright` assertion must pass (no violations in `result.violations`)
3. Color-contrast-checker unit test on `lib/tokens.ts` asserts declared ratios
4. `eslint-plugin-jsx-a11y` installed and strict rules enabled

---

## 13. Cross-cutting concerns for main-agent synthesis

### 13.1 Canonical focus-ring color

Design-doc §15 line 773 says `2px ivory`. Agent 1 §7.2 says `2px oxblood`. Fragments variously adopt both. **Auditor verdict: `ivory`** (passes UI 3:1 on every surface). Update Agent 1 and all downstream references.

### 13.2 Canonical disabled-control color

Agent 1 §2.2 says "dust-2 fill, dust text." Auditor verdict: `dust-2` on bg-0 (3.26:1) is the safer choice; avoid `dust` at alpha (2.09:1).

### 13.3 Corrected contrast ratios

Agent 1 §2.1 published ratios have systematic errors of 0.3–0.9. Full recomputation required (see §1.1 above). In particular:
- `oxblood` text is 2.28:1, not 2.86:1 (published)
- `oxblood-soft` is 2.96:1, not 3.70:1
- `dust` on bg-1 is 4.92:1, not 3.91:1

### 13.4 Data-table fallback for every chart

Agent 1 §7.9 declares this but only Agent 6's calorie adherence and heatmap ship it explicitly. Extend to all 7 chart surfaces.

### 13.5 Heatmap WCAG 2.5.5

Mobile cell size 12×20 is a hard WCAG fail. Required pre-ship change: enlarge via transpose OR cap range OR cap nutrients visible.

### 13.6 Keyboard shortcuts WCAG 2.1.4

The `DISABLE KEYBOARD SHORTCUTS` Settings toggle is promised in Agent 1 but not specified in Agent 6 Settings. Add to Agent 6 Settings §Display subsection.

### 13.7 Load-bearing ARIA attributes systematically missing

- `role="dialog"`+`aria-modal="true"` across all modals (log modal, merge, bulk delete, account delete, export, PWA install, shortcuts overlay, coachmark) — formally declare for each.
- `<label for>` on every input — formally declare for each.
- `aria-describedby` linking inputs to errors — formally declare for each.
- `role="grid"` on library grid and heatmap — formally declare.
- `role="switch"` on all toggles.

A shared `components/a11y/` folder (FocusTrap, LiveRegion, VisuallyHidden, FieldWithError, TapTarget) reduces repetition and raises consistency.

---

## 14. Citation index (WCAG clauses cited)

- WCAG 2.1 §1.4.1 Use of Color — Agent 1 §7.7 rule, V1 in §9.1 audit
- WCAG 2.1 §1.4.3 Contrast (Minimum) — §1.1 audit
- WCAG 2.1 §1.4.10 Reflow — Agent 1 §7.8 zoom test
- WCAG 2.1 §1.4.11 Non-text Contrast — focus ring V9, heatmap cell V10/V11
- WCAG 2.1 §1.4.12 Text Spacing — implicitly met by fragments (no fixed-font-size caps)
- WCAG 2.1 §2.1.1 Keyboard — §3.2 audit
- WCAG 2.1 §2.1.4 Character Key Shortcuts — §3.1 `/`, `n`, `?` rule
- WCAG 2.1 §2.3.1 Three Flashes or Below Threshold — §6.2 (no flashing)
- WCAG 2.1 §2.3.3 (AAA) Animation from Interactions — §6.1 reduced-motion
- WCAG 2.1 §2.4.1 Bypass Blocks — Agent 1 §7.6 skip link
- WCAG 2.1 §2.4.3 Focus Order — §3 keyboard nav
- WCAG 2.1 §2.4.7 Focus Visible — Agent 1 §7.2 focus ring
- WCAG 2.2 §2.4.11 Focus Not Obscured (Minimum) — applies to modals (focus must not be hidden behind scrims)
- WCAG 2.2 §2.4.13 Focus Appearance — §10.3 disabled contrast
- WCAG 2.1 §2.5.3 Label in Name — icon-only buttons audit §5.3
- WCAG 2.1 §2.5.5 Target Size (AAA) + 2.2 §2.5.8 Target Size (Minimum) — §8 audit
- WCAG 2.1 §3.2.2 On Input — onboarding / log flow input behavior
- WCAG 2.1 §3.3.1 Error Identification — §7.2 error messaging
- WCAG 2.1 §3.3.2 Labels or Instructions — §7.1 labels
- WCAG 2.1 §3.3.3 Error Suggestion — applied in Agent 6 onboarding step validations
- WCAG 2.1 §4.1.2 Name, Role, Value — §4 ARIA audit
- WCAG 2.1 §4.1.3 Status Messages — §4 `aria-live` audit

---

*Fragment end — enrichment-ux-auditor.md*
