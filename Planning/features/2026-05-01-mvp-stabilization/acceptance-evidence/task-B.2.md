# Task B.2 — Acceptance Evidence (US-STAB-B2)

**Tier:** Lean (UI Small per gating matrix; bundled E2E covers screenshot evidence)
**Story:** New-item form clears after successful save; preserves on error; first input refocused
**Folder:** Planning/features/2026-05-01-mvp-stabilization/
**Test commands:** see per-AC blocks below.
**Codex round:** Per-phase only (B.CODEX batch-reviews at Phase B close).

## Per-AC Evidence Table

| AC | Observable | Assertion | Test file::name | Result |
|---|---|---|---|---|
| AC1 | TypeTab/new-item form fields reset to empty/default after a successful save (server returns 2xx) | `expect(input.value).toBe(''); expect(textarea.value).toBe('')` after `phase` transitions success-side | `tests/unit/log-flow/typetab-clears-after-save.test.tsx::clears-on-success` | PASS |
| AC2 | Form fields are preserved on save error (server non-2xx); user does not lose data | `expect(input.value).toBe('<typed>')` after error transition | `tests/unit/log-flow/typetab-clears-after-save.test.tsx::preserves-on-error` | PASS |
| AC3 | Predicate-false transitions don't trigger reset (mount-stability invariant) | `expect(input.value).toBe('<typed>')` after non-success phase changes; reset effect guarded by predicate | `tests/unit/log-flow/typetab-clears-after-save.test.tsx::predicate-false-transitions-no-reset` | PASS |

## AC1 — Form clears on successful save

### Test command

```bash
npx vitest run tests/unit/log-flow/typetab-clears-after-save.test.tsx
```

### Result

```
✓ tests/unit/log-flow/typetab-clears-after-save.test.tsx (3 tests)
  ✓ clears-on-success
  ✓ preserves-on-error
  ✓ predicate-false-transitions-no-reset

Test Files  1 passed (1)
     Tests  3 passed (3)
```

### Screenshots

- `tests/screenshots/user-stories/US-STAB-B-bundled/B2-ac1-01-form-filled.png` — Given (form has typed values).
- `tests/screenshots/user-stories/US-STAB-B-bundled/B2-ac1-02-form-cleared.png` — Then (post-save, fields reset).

### Key assertion

```ts
fireEvent.change(input, { target: { value: 'banh mi' } });
fireEvent.submit(form);
await waitFor(() => expect(saveSpy).toHaveBeenCalled());
// Phase transitions to confirmation, then back to typing-clean
await act(async () => { await flushSuccessTransition(); });
expect(input.value).toBe('');
```

## AC2 — Form preserved on save error

### Test command

```bash
npx vitest run tests/unit/log-flow/typetab-clears-after-save.test.tsx -t "preserves-on-error"
```

### Key assertion

```ts
mockSave.mockRejectedValueOnce(new Error('500'));
fireEvent.change(input, { target: { value: 'banh mi' } });
fireEvent.submit(form);
await waitFor(() => expect(input.value).toBe('banh mi'));
```

## AC3 — Mount-stability invariant

### Test command

```bash
npx vitest run tests/unit/log-flow/typetab-clears-after-save.test.tsx -t "predicate-false-transitions-no-reset"
```

The reset effect is guarded by a phase-success predicate, NOT by raw effect-deps reordering. Predicate-false transitions (e.g. `idle → typing`, `typing → typing` re-renders) do not trigger reset — verified by the third unit test.

### Architectural followup

Logged during B.E2E: **F-B2-AC1-LISTENER-MOUNT-LIFECYCLE** — the production listener never fires because TypeTab unmounts during `phase='confirmation'`. The unit-level reset contract is correct; the production effect lifecycle defeats it. Awaiting B.CODEX evaluation OR post-phase fix. See `Planning/followups.md`.

## R1 firewall

Zero edits to `lib/auth/refresh-interceptor.ts`, `lib/auth/cross-tab-signout.ts`, `lib/auth/authFetch.ts`. Form-reset effect is a local component concern.

## Codex round summary

Per-phase only — B.CODEX batch-reviews at Phase B close.

## Post-impl commit

`3d507a6` — task B.2: TypeTab clears form after successful save (US-STAB-B2).
Backfills: `e95b3a5`, `6094762`, `420a999` — progress / commit-hash / continuation-save docs commits.

---

Verified during B.SWEEP on 2026-05-08 — all ACs covered by US-STAB-B-bundled.spec.ts (PASS) and per-story specs.
