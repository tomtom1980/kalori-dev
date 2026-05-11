# Task B.6 — Acceptance Evidence (US-STAB-B6)

**Tier:** Lean (UI Small per gating matrix; no screenshots dir required)
**Story:** Settings stub copy removed (patch-shaped per DT-1)
**Folder:** Planning/features/2026-05-01-mvp-stabilization/
**Test commands:** see per-AC blocks below.
**Codex round:** Per-phase only (B.CODEX batch-reviews at Phase B close).

## Per-AC Evidence Table

| AC | Observable | Assertion | Test file::name | Result |
|---|---|---|---|---|
| AC1 | Stub copy "Settings arrive with Task 2.2" absent from `/settings` DOM | `expect(textContent).not.toContain('Settings arrive with Task 2.2')` | `tests/unit/settings/page.test.tsx::no-stub-body-copy` | PASS |
| AC2 | Exactly one `<h1>` with text equal to `t.settings.heading` ("Settings"); `lib/i18n/en.ts::settings.stubHeading` + `settings.stubBody` deleted | `expect(querySelectorAll('h1').length).toBe(1); expect(h1.textContent).toBe(t.settings.heading); expect(t.settings).not.toHaveProperty('stubHeading'); expect(t.settings).not.toHaveProperty('stubBody')` | `tests/unit/settings/page.test.tsx::single-h1-from-i18n-and-stub-deleted` | PASS |
| AC3 | `ReduceMotionToggle`, `DataSubsection`, `AccountSubsection` all mount and render without regression | `expect(screen.getByTestId('reduce-motion-toggle')).toBeInTheDocument(); expect(screen.getByTestId('data-subsection')).toBeInTheDocument(); expect(screen.getByTestId('account-subsection')).toBeInTheDocument()` | `tests/unit/settings/page.test.tsx::renders-real-settings-components` | PASS |

## AC1 — Stub copy absent from DOM

### Test command

```bash
npx vitest run tests/unit/settings/page.test.tsx
```

### Result

```
✓ tests/unit/settings/page.test.tsx (3 tests)
  ✓ no-stub-body-copy
  ✓ single-h1-from-i18n-and-stub-deleted
  ✓ renders-real-settings-components

Test Files  1 passed (1)
     Tests  3 passed (3)
```

### Key change

`app/(app)/settings/page.tsx` lines 76-78 (the `<p>{t.settings.stubBody}</p>` block) deleted; `lib/i18n/en.ts::settings.stubHeading` + `stubBody` deleted at lines 768-770.

## AC2 — Exactly one h1 sourced from i18n

### Test command

```bash
npx vitest run tests/unit/settings/page.test.tsx -t "single-h1-from-i18n-and-stub-deleted"
```

### Key assertion

```ts
const h1s = container.querySelectorAll('h1');
expect(h1s.length).toBe(1);
expect(h1s[0].textContent).toBe(t.settings.heading);
expect(t.settings).not.toHaveProperty('stubHeading');
expect(t.settings).not.toHaveProperty('stubBody');
```

### Implementation note

`app/(app)/settings/page.tsx` line 74 changed `{t.settings.stubHeading}` → `{t.settings.heading}`. New key `heading: 'Settings'` added at top of `settings: { ... }` block in `lib/i18n/en.ts` (line 770), matching the `t.shortcutsOverlay.heading` precedent.

### Phase 1 design verification

- Subsection h1-uniqueness audit (Phase 1 ux-specialist spec at `Planning/.tmp/task-B.6-ui-ux-specialist.md`) confirmed `AccountSubsection.tsx`, `DataSubsection.tsx`, `ReduceMotionToggle.tsx` use `<h2>` or no heading. Sole `<h1>` lives in `page.tsx`. No `F-B6-SUBSECTION-H1-DOWNGRADE` followup needed.

## AC3 — Real settings components remain mounted

### Test command

```bash
npx vitest run tests/unit/settings/page.test.tsx -t "renders-real-settings-components"
```

### Key assertion

```ts
expect(screen.getByTestId('reduce-motion-toggle')).toBeInTheDocument();
expect(screen.getByTestId('data-subsection')).toBeInTheDocument();
expect(screen.getByTestId('account-subsection')).toBeInTheDocument();
```

### Regression sweep (adjacency)

| Suite | Files | Tests | Result |
|---|---|---|---|
| Settings + i18n + components + app units | 26 files | 187 tests | PASS (3.25s) |
| i18n trio (shape, dashboard-3.5, eslint-no-inline-strings) | 3 files | 23 tests | PASS |
| Settings-adjacent integration (axe-coverage, reduce-motion-effective, reduce-motion-toggle-mirror) | 3 files | 18 tests | PASS |

Zero new failures. Zero orphan production references to `settings.stubHeading` / `settings.stubBody` (grep confirmed — only Planning docs + `i18n-shape.test.ts` carve-out comment remain).

## i18n-shape carve-out

`tests/unit/i18n-shape.test.ts` lines 184-201: `'settings'` removed from the namespaces tuple (5 entries remain: dashboard / log / library / progress / onboarding) — those namespaces still own `stubHeading` + `stubBody` per their planning sequence. 3-line carve-out comment explains the B.6 deletion.

## R1 firewall

Zero edits to `lib/auth/refresh-interceptor.ts`, `lib/auth/cross-tab-signout.ts`, `lib/auth/authFetch.ts`, `app/(app)/log/_components/ConfirmationScreen.tsx`. Patch-shape preserved.
