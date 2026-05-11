# Task B.3 — Acceptance Evidence (US-STAB-B3)

**Tier:** Lean (UI Small per gating matrix; bundled E2E covers screenshot evidence)
**Story:** Sidebar "Navigation" header is non-interactive `<h2>` (no `href`, no `onClick`, not in tab order)
**Folder:** Planning/features/2026-05-01-mvp-stabilization/
**Test commands:** see per-AC blocks below.
**Codex round:** Per-phase only (B.CODEX batch-reviews at Phase B close).

## Per-AC Evidence Table

| AC | Observable | Assertion | Test file::name | Result |
|---|---|---|---|---|
| AC1 | "Navigation" header is `<h2>` with no `href`, no `onClick`, no `tabindex=0` | `expect(heading.tagName).toBe('H2'); expect(heading).not.toHaveAttribute('href'); expect(heading).not.toHaveAttribute('tabindex'); expect(heading.onclick).toBeFalsy()` | `tests/unit/sidebar/nav-header-non-interactive.test.tsx::no-interactive-attrs` | PASS |
| AC2 | Tab traversal skips the header (NOT in tab order) | RED-1 trace via deliberate `tabIndex={0}` injection confirms the AC2 assertion catches the regression; on real component, `userEvent.tab()` lands on the next interactive element | `tests/unit/sidebar/nav-header-non-interactive.test.tsx::not-in-tab-order` | PASS |
| AC3 | Axe sweep on the sidebar `<nav>` block reports zero violations (proper heading semantics) | `expect(axeResults.violations).toEqual([])` with `page-has-heading-one` rule disabled (component-isolation harness) | `tests/unit/sidebar/nav-header-non-interactive.test.tsx::axe-clean-on-sidebar-nav` | PASS |

## AC1 — Non-interactive heading semantics

### Test command

```bash
npx vitest run tests/unit/sidebar/nav-header-non-interactive.test.tsx
```

### Result

```
✓ tests/unit/sidebar/nav-header-non-interactive.test.tsx (3 tests)
  ✓ no-interactive-attrs
  ✓ not-in-tab-order
  ✓ axe-clean-on-sidebar-nav

Test Files  1 passed (1)
     Tests  3 passed (3)
```

### Key change

`components/nav/sidebar.tsx`: single tag flip `<span>` → `<h2>` for the nav-section heading + 2 inline-style additions (`fontWeight: 400`, `margin: 0`) to neutralize browser User-Agent default `font-weight: bold` + `margin-block: 0.83em` on `<h2>` so the rendered visual is byte-identical to the previous `<span>`.

### Screenshots

- `tests/screenshots/user-stories/US-STAB-B-bundled/B3-ac1-01-sidebar-initial.png` — Given (sidebar rendered).
- `tests/screenshots/user-stories/US-STAB-B-bundled/B3-ac1-02-heading-non-interactive.png` — Then (heading is `<h2>`, no interactive attrs).

## AC2 — Skipped from tab order

### Test command

```bash
npx vitest run tests/unit/sidebar/nav-header-non-interactive.test.tsx -t "not-in-tab-order"
```

### Key assertion

```ts
const heading = screen.getByRole('heading', { level: 2, name: /navigation/i });
const firstNavLink = screen.getAllByRole('link')[0];
const user = userEvent.setup();
await user.tab();
expect(document.activeElement).toBe(firstNavLink);
expect(document.activeElement).not.toBe(heading);
```

### Brownfield RED-1 trace

The test was authored with a deliberate `tabIndex={0}` injection at RED stage to confirm the AC2 assertion catches the regression (proves the assertion is non-vacuous). With `tabIndex` removed in GREEN, traversal lands correctly on the first nav link.

### Screenshots

- `tests/screenshots/user-stories/US-STAB-B-bundled/B3-ac2-01-initial.png` — Given (focus before tab).
- `tests/screenshots/user-stories/US-STAB-B-bundled/B3-ac2-02-tab-traversal-result.png` — Then (focus on first link, heading skipped).

## AC3 — Axe-clean

`vitest-axe` sweep on the sidebar component with `page-has-heading-one` rule disabled (the component is rendered in isolation; the sole h1 lives at the page level). Zero violations.

## R1 firewall

Zero edits to `lib/auth/refresh-interceptor.ts`, `lib/auth/cross-tab-signout.ts`, `lib/auth/authFetch.ts`, `app/(app)/log/_components/ConfirmationScreen.tsx`. Navigation header is a presentational concern.

## Codex round summary

Per-phase only — B.CODEX batch-reviews at Phase B close.

## Post-impl commit

`4a43f82` — task B.3: sidebar Navigation header is semantic h2 (US-STAB-B3).
Backfill: `25306a8` — docs: task B.3 progress + changelog + continuation.

---

Verified during B.SWEEP on 2026-05-08 — all ACs covered by US-STAB-B-bundled.spec.ts (PASS) and per-story specs.
