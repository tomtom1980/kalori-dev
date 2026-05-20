# Codex Round 1 Audit Batch — Auto-Fix Summary

**Batch:** `2026-05-16-library-overhaul`
**Scope:** 2 batch-internal audit-style regression test failures surfaced (but not fixed) by the Phase 4 Critical batch.
**Result:** BOTH RESOLVED. Full project regression sweep: **2407 passed | 99 skipped | 0 failures** across 353 test files.

---

## Failure #1 — `tests/integration/focus-ring-token.test.ts`

### Verbatim test + assertion

> Task 5.1.6 AC2 — focus ring standardization > **no .css file anywhere in the repo overrides :focus-visible outline with a non-ivory token**

```
AssertionError: :focus-visible outlines outside the canonical 2px ivory token (AC2 violation):
  app\globals.css :focus-visible -> 2px solid var(--color-oxblood-soft)
  app\globals.css :focus-visible -> 2px solid var(--color-oxblood-soft)
expected [ "app\\globals.css :focus-visible -> 2px solid var(--color-oxblood-soft)", "app\\globals.css :focus-visible -> 2px solid var(--color-oxblood-soft)" ] to deeply equal []
```

### Root cause

Two `.kalori-library-*:focus-visible` blocks introduced by Wave 3 (Bug 3 — quick-action menu) and Wave 5 (Bug 6 — Add Item dialog) painted the focus ring with `var(--color-oxblood-soft)` (#a13a2c). Per the lesson at `lessons-relevant.md:7`, oxblood-soft is **accent-only** on dark surfaces (2.96:1 vs `--color-bg-1`, fails WCAG 1.4.11). The canonical focus-ring at `app/globals.css:298–301` is `2px solid var(--color-ivory)` (16.67:1 — AAA).

### Fix

**`app/globals.css:3071–3077`** — `.kalori-library-card-menu-trigger:focus-visible` outline color changed from `var(--color-oxblood-soft)` to `var(--color-ivory)`. `outline-offset: -2px` preserved (inner offset keeps the ring inside the 32×32 menu-trigger so it doesn't bleed past the thumb's clipping rect). Inline comment added documenting the WCAG rationale + lesson reference.

**`app/globals.css:4888–4895`** — `.kalori-library-add-input:focus-visible` outline color changed from `var(--color-oxblood-soft)` to `var(--color-ivory)`. `outline-offset: 2px` preserved (matches the global `:focus-visible` rule). Inline comment added.

### Tests RED → GREEN

- `tests/integration/focus-ring-token.test.ts` — 3/3 GREEN (was 1 failing, 2 passing).
- `tests/components/library/LibraryCard.test.tsx` — 25/25 GREEN (Wave 3 CSS-rule existence assertions unaffected — they assert hover/focus colors on the card body, not the menu-trigger outline).
- `tests/components/library/LibraryAddDialog.test.tsx` — 11/11 GREEN (no focus-ring assertions in the dialog test file).

---

## Failure #2 — `tests/integration/nav-audit.test.ts`

### Verbatim test + assertion

> Task B.5 — nav audit (AC1) > **reports zero broken links, zero invalid hrefs, zero unexpected orphan routes, zero unverifiable runtime hrefs against HEAD**

```
AssertionError: Unverifiable runtime hrefs (missing // @nav-audit pragma):
[
  {
    "surface": "app/(app)/library/_components/LibraryAddDialog.tsx",
    "href": "<runtime: `/library/${duplicate.id}`>",
    "label": "runtime[`/library/${duplicate.id}`]",
    "kind": "runtime"
  }
]
```

### Root cause

Wave 5 (Bug 6) added a 409-duplicate-name banner with a link to the existing library item:

```tsx
<a className="kalori-library-add-existing-link" href={`/library/${duplicate.id}`}> existing </a>
```

The href is a runtime template literal (the `${duplicate.id}` is server-supplied state, not statically known). `scripts/nav-audit.mjs` flags ALL runtime hrefs without a `// @nav-audit ...` pragma as "unverifiable" (F-1 contract, line 38–48 of nav-audit.mjs). The precedent at `app/(app)/progress/_components/ProgressRangeToolbar.tsx:137` shows the canonical fix: a comment on the line immediately above the `href=` attribute declaring the resolved route.

### Fix

**`app/(app)/library/_components/LibraryAddDialog.tsx:311–321`** — added `// @nav-audit href: /library/[id]` pragma comment on the line above the `href={` attribute, plus a continuation comment explaining the runtime context (the href resolves at runtime to the live `/library/[id]` dynamic route). The pragma format matches the test-validated example at `ProgressRangeToolbar.tsx:137` (`// @nav-audit href: /progress`).

### Tests RED → GREEN

- `tests/integration/nav-audit.test.ts` — 22/22 GREEN (was 1 failing AC1 + 21 passing).
- `tests/components/library/LibraryAddDialog.test.tsx` — 11/11 GREEN (unchanged — pragma is a JSX-internal comment, no runtime behavior change).

---

## Files changed (2)

| File | Change |
|---|---|
| `app/globals.css` | 2 `:focus-visible` outline color swaps (oxblood-soft → ivory) + inline rationale comments |
| `app/(app)/library/_components/LibraryAddDialog.tsx` | 1 `// @nav-audit href: /library/[id]` pragma comment on the duplicate-banner `<a>` |

**Lines changed:** ~10 (comments + 2 color tokens). No semantic / runtime / API surface changes; pure design-system compliance + audit-pragma annotation.

---

## Regression sweep

| Surface | Status |
|---|---|
| `tests/integration/focus-ring-token.test.ts` | 3/3 GREEN |
| `tests/integration/nav-audit.test.ts` | 22/22 GREEN |
| `tests/components/library/LibraryCard.test.tsx` (+ LibraryClient.quick-actions) | 25/25 GREEN |
| `tests/components/library/LibraryAddDialog.test.tsx` | 11/11 GREEN |
| **Full project sweep (`pnpm test`)** | **2407 passed \| 99 skipped \| 0 failures** across 353 test files |

The full-project sweep includes the 1662 + 38 + 6 baseline from the Critical-batch report PLUS every other component / integration / unit / RLS / lighthouse file in the project. **Zero regressions introduced.** The 99 skipped specs are pre-existing env-gated skips (Supabase RLS smoke tests, Lighthouse runner gated on `CI`, etc.).

---

## Visual snapshot regeneration

**Not required.**

- The focus-ring color change (`#a13a2c` oxblood-soft → `#F4EBDC` ivory) IS visible in a `:focus-visible` paint, but visual baselines are captured in idle state — Playwright's screenshot pipeline doesn't focus the trigger / input before snapshot. Wave 3's hand-off note (`outputs/wave-3-librarycard.md:82–86`) listed 4 anticipated visual diffs from the LibraryCard hover/focus block; the menu-trigger focus-ring color was NOT among them (idle state captures don't expose `:focus-visible` paint).
- The `// @nav-audit` pragma is a JSX comment — it does not render to the DOM and has zero visual impact.
- LibraryCard component tests (`tests/components/library/LibraryCard.test.tsx`) assert CSS-rule existence via `globals.css` regex reads — they read the file directly and check that the bg/opacity/transition rules exist, not that focus colors hit a specific RGB. Wave 3's CSS-rule assertions all pass post-fix.

If a Phase 7 visual regression sweep is run later for the Library route, the menu-trigger focus state (only visible when keyboard-tabbed) would show the new ivory ring — this is an intentional design-system convergence, not a regression.

---

## Deviations from briefed approach

**None.** The briefing's diagnosis was exactly correct:
1. Wave 3's hover CSS introduced an outline using oxblood-soft (two rules — one in Wave 3 menu-trigger block, one in Wave 5 add-input block).
2. The nav-audit failure was the missing pragma on the LibraryAddDialog duplicate-link href.

Both fixes followed the briefing's recommended approach verbatim. No audit-test changes — the audits ARE the contract.

---

## Stop-the-world / false positives

**None.**

- Neither test was a false alarm — both failed on initial run; both pass post-fix.
- No "banned token exception" — oxblood-soft as a focus-ring color on dark surfaces fails WCAG and is explicitly forbidden by the lesson; the swap is unambiguously correct.
- The pragma fix does NOT change the dedup-error UX in any way — the `<a>` still renders the same text, the same href resolves to the same route, the click behavior is identical. The pragma is comment-only.
- No conflict with Bug 6 proposal — the proposal didn't specify pragma annotation (audits are repo-wide infrastructure, not feature-level concerns).

---

## Handoff to Phase 5 (Codex round 2)

The 2 audit failures are now resolved. Phase 5's re-review can proceed against the full Round 1 fix set:

- 3 Critical fixes (sketch URL expiry / atomicity / photo-thumbnail-kind contract) — from `fixes-r1-critical-batch.md`.
- 1 Improvement fix (LibraryAddDialog sessionStorage client_id) — from `fixes-r1-improvement-libraryadddialog.md`.
- 2 audit fixes (focus-ring-token compliance + nav-audit pragma) — from this file.

State file updated with `batch_internal_audit_fixes: { focus_ring_token: resolved, nav_audit: resolved }` and `last_completed_action` reflecting both Critical + Improvement + Audit batches complete.
