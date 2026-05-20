# Bug 3 — LM-SEC-1: EDIT_ITEM_MICRO has no upper bound on input

## Classification

`known_fix` — the fix is prescribed by the followups entry (`Planning/followups.md` POST-MVP-BUGFIX-2026-05-17-LM-SEC-1). The skill prescription is three layers (HTML `max`, JS handler cap, Zod `.max(...)`); my recommendation below confirms the layer count and the cap value, plus the precise insertion points after grepping the current source.

## Root Cause

The library-only micros editing surface inside `ConfirmationScreen` accepts arbitrarily large positive finite numbers across three checkpoints, none of which clamp the upper bound:

1. **Input element** (`app/(app)/log/_components/ConfirmationScreen.tsx:1652–1673`)
   ```tsx
   <input
     id={inputId}
     data-testid={`confirmation-item-${index}-micro-${micro.code}-input`}
     type="number"
     min="0"
     step="any"
     inputMode="decimal"
     value={display}
     onChange={(e) => { ... }}
     aria-label={`${micro.name} (${micro.unit})`}
     className="kalori-fd-input kalori-fd-input-num"
   />
   ```
   `type="number"` permits scientific notation (`1e300`) when typed/pasted. No `max` attribute → no native browser validation ceiling.

2. **onChange handler** (`app/(app)/log/_components/ConfirmationScreen.tsx:1660–1670`)
   ```tsx
   onChange={(e) => {
     const next = e.target.value;
     if (next === '') { actions.editMicro(rowId, micro.code, 0); return; }
     const parsed = Number(next);
     if (Number.isFinite(parsed) && parsed >= 0) {
       actions.editMicro(rowId, micro.code, parsed);
     }
   }}
   ```
   `Number('1e300')` is finite and `>= 0`, so the dispatch fires with the absurd value verbatim.

3. **Reducer `EDIT_ITEM_MICRO`** (`app/(app)/log/_components/ConfirmationScreen.tsx:430–443`) calls `roundNutrition(action.value)`. `roundNutrition` (L355–358):
   ```ts
   function roundNutrition(value: number): number {
     if (!Number.isFinite(value) || value <= 0) return 0;
     return Math.round(value * 10) / 10;
   }
   ```
   Floors NaN / ≤0 to 0, but no upper cap. `roundNutrition(1e300)` = `1e300`.

4. **Zod `CreateLibraryNutritionSchema.micros`** (`lib/library/create-schema.ts:58`)
   ```ts
   micros: z.record(z.string(), z.number().nonnegative().finite()).optional(),
   ```
   `.finite()` rejects `Infinity` / `NaN` but accepts any finite positive number. No `.max(...)`.

Result: a user can persist `1e300 mg sodium`, which renders as `1e+300 mg` in the FoodDetail meter (self-sabotage only — RLS-gated). The followups entry classes this as **Informational** (no privilege boundary, no DoS), so the fix is defense-in-depth, not a hot security patch.

## Defense-in-depth layers proposed

**1+2+3 — all three layers.** Rationale:

- **Layer 1 (HTML `max="999999"`)** — free; native browser validation surfaces a tooltip and rejects the value on form-submit without round-tripping through React. Mirrors the existing `min="0"` precedent on the same input, so it costs nothing in code-style and is the documented `web-ui-guide.md` Quick-Pick pattern for numeric inputs with explicit bounds. **Keep.**

- **Layer 2 (`Math.min(999999, parsed)` in onChange)** — load-bearing because `type="number" max="999999"` is **not** browser-enforced for programmatic value mutation or paste of scientific notation in all browsers; Chrome/Safari accept `1e300` typed into the field and only show validity via `:invalid` pseudo-class. We need the runtime clamp to ensure the reducer never sees an out-of-range value, even if a user pastes `1e300` or types-and-tab-out. **Keep.**

- **Layer 3 (Zod `.max(1_000_000)` on `CreateLibraryNutritionSchema.micros` values)** — keep, with two justifications:
  1. **Drift parity** — `CreateLibraryBodySchema` is the contract shared client + server (`lib/library/create-schema.ts:1–10`). Any future caller (an importer, a CLI script, a fuzz harness, a different UI surface) that bypasses the `ConfirmationItemMicros` onChange will hit the server. Without layer 3 the server accepts `1e300` for those callers.
  2. **Cost is near-zero** — single Zod chain addition; existing schema tests cover the boundary in one new case.
  3. **`Math.min` + Zod max gap** — set Zod max **above** the input cap (1_000_000 vs 999_999) so the rounding contract at the input edge (`roundNutrition` rounds to 1-decimal, so `roundNutrition(999_999) = 999999` exactly, no overflow) can never produce a value that the Zod schema would itself reject. Defense in depth without false-positive rejection.

Per CLAUDE.md Simplicity First: I considered dropping layer 3 since "user can only sabotage their own row" — but the schema is **already** the single source of truth shared client+server, and a single line `(z.number().nonnegative().finite().max(1_000_000))` doesn't change the file's shape, only its bounds. The cost is genuinely near-zero and the parity benefit is permanent (future callers protected). **Skipping layer 3 would be a localist fix that re-opens the gap when the surface widens.**

## Cap value

**999999 on the input + handler; 1_000_000 on Zod** — confirmed per the followups entry's prescription. Rationale:

- Realistic max micros per row:
  - Vitamin A (RAE): ~3000 µg upper limit (tolerable UL ~10000 µg/day)
  - Sodium: ~5000 mg in an extreme single-meal entry
  - Potassium: ~5000 mg
  - Vitamin C: ~2000 mg UL
  - Iron: ~45 mg UL
- 999,999 is ~200× the highest realistic single-meal value. A genuine user-entry mistake (e.g., typing 50000 instead of 5000) is still permitted and serves as a UX feedback loop ("did I really mean that?"); only pathological / pasted scientific-notation values are blocked.
- 999,999 also produces clean 6-digit string rendering in the UI (max width predictable for layout).
- Zod cap at 1_000_000 (one higher) leaves a 1-unit headroom for `roundNutrition`'s ×10 / Math.round / ÷10 path: e.g. `roundNutrition(999999.04)` = `999999`, well inside cap; `roundNutrition(999999.06)` = `999999.1`, also inside Zod's 1_000_000 cap (would be exactly 999_999.1, well under). The headroom avoids a "input said max 999999 but Zod rejected because value rounded to 999999.1" false-positive class.

## Coordination with bug 4

Bug 4 (parallel sub-agent currently running) also touches `ConfirmationScreen.tsx`. My read of the file inventory:

- **Bug 3 touches lines L1652–L1673 only** — the `<input>` element inside `ConfirmationItemMicros` (specifically the `max` attribute on the input + the body of the inline `onChange`).
- I do NOT modify the reducer L430–L443, the `roundNutrition` function L355–L358, or any other portion of `ConfirmationScreen.tsx`. The reducer + `roundNutrition` already handle their layer correctly (clamp NaN/≤0); I'm adding a new clamp at the input boundary, not modifying the existing one.
- Bug 3 ALSO touches `lib/library/create-schema.ts:58` (single-line Zod change) — entirely outside `ConfirmationScreen.tsx`.

Per the orchestrator's serial directive `(Bug 3 → Bug 4)`, Bug 3 lands first. If Bug 4 modifies the same input element or onChange handler, the rebase strategy is: Bug 4's diff applies on top of my changes. If Bug 4 modifies a different `ConfirmationItemMicros` concern (e.g., `Collapsible.Root` defaults, label content, micro ordering), zero conflict. **Recommendation**: when Bug 4's proposal lands, re-verify the line-number stability assumption before Phase 3 implementation begins.

**No conflict with `bug-2.md`** (already in proposals folder, sibling agent). My grep shows bug-2 touches a different file/concern (per the followups list — bug-2 is LM-I1 sodium key-drop in `FoodDetailMacros.tsx`, not `ConfirmationScreen.tsx`).

## Proposed Change (Diff Outline)

**File 1:** `app/(app)/log/_components/ConfirmationScreen.tsx`

L1652–L1673 — replace the existing `<input>` element + `onChange` body with:

```tsx
<input
  id={inputId}
  data-testid={`confirmation-item-${index}-micro-${micro.code}-input`}
  type="number"
  min="0"
  max="999999"
  step="any"
  inputMode="decimal"
  value={display}
  onChange={(e) => {
    const next = e.target.value;
    if (next === '') {
      actions.editMicro(rowId, micro.code, 0);
      return;
    }
    const parsed = Number(next);
    if (Number.isFinite(parsed) && parsed >= 0) {
      // LM-SEC-1 (defense-in-depth): cap absurd inputs at 999999 to prevent
      // scientific-notation paste from persisting `1e300 mg sodium`. RLS
      // already constrains writes to the user's own row, so this is
      // soft-guidance rather than a security boundary, but parity with the
      // Zod schema (CreateLibraryNutritionSchema.micros.max(1_000_000)) keeps
      // any future programmatic caller bounded too.
      const capped = Math.min(parsed, 999999);
      actions.editMicro(rowId, micro.code, capped);
    }
  }}
  aria-label={`${micro.name} (${micro.unit})`}
  className="kalori-fd-input kalori-fd-input-num"
/>
```

Changes are exactly two: add `max="999999"` attribute, wrap the dispatched value in `Math.min(parsed, 999999)` with a code-comment pointer to LM-SEC-1.

**File 2:** `lib/library/create-schema.ts`

L58 — change:
```ts
micros: z.record(z.string(), z.number().nonnegative().finite()).optional(),
```
to:
```ts
// LM-SEC-1 (defense-in-depth): mirror the input-side cap at 999_999 with a
// schema-side ceiling at 1_000_000. The 1-unit headroom absorbs
// `roundNutrition`'s 1-decimal rounding so the cap-at-edge case can't
// produce a value the schema itself rejects. RLS already bounds this to
// the user's own row; the schema cap protects programmatic callers
// (importers, future surfaces) that bypass the React onChange.
micros: z
  .record(z.string(), z.number().nonnegative().finite().max(1_000_000))
  .optional(),
```

## Files Affected

1. `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\ConfirmationScreen.tsx` — L1652–L1673 (12 lines touched in the `<input>` block of `ConfirmationItemMicros`)
2. `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\library\create-schema.ts` — L58 (single Zod chain change)
3. `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\log-flow\ConfirmationItemMicros.test.tsx` — append new test cases (component / handler tests)
4. `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\library\create-schema.test.ts` — append new test case (Zod schema test)

**Files NOT touched** (verified):
- Reducer at L430–443 (already correctly handles its layer with `roundNutrition`)
- `roundNutrition` at L355–358 (unchanged — the new clamp lives at the input boundary)
- `FoodDetailMacros.tsx` edit surface (out of scope — Bug 3 is library-only ConfirmationScreen creation path; the detail-edit path already enforces its own per-micro bounds via the FoodDetail reducer)

## TDD Test Plan (failing-first)

**Test count: 4 new tests** (3 component/handler, 1 Zod schema).

### Component / Handler tests
Append to `tests/unit/components/log-flow/ConfirmationItemMicros.test.tsx`:

**Test 1: input has `max="999999"` attribute**
```ts
it('renders each micro input with max="999999" (LM-SEC-1 defense in depth)', async () => {
  const user = userEvent.setup();
  render(<ConfirmationScreen
    source="text" tab="type" items={[libraryItem]}
    reasoning={null} dedupMatch={null} mode="library-only" onClose={vi.fn()}
  />);
  await user.click(screen.getByTestId('confirmation-item-0-micros-trigger'));
  const ironInput = screen.getByTestId('confirmation-item-0-micro-iron-input');
  expect(ironInput).toHaveAttribute('max', '999999');
});
```

**Test 2: typing a value above 999999 is capped to 999999 in saved payload**
```ts
it('caps an absurd micro value (1e10) at 999999 in the persisted body (LM-SEC-1)', async () => {
  useLogFlowStore.getState().ensureClientId('type');
  const bodies: Record<string, unknown>[] = [];
  authFetch.mockImplementation((url, init) => {
    if (url.includes('/api/library/create')) {
      bodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
      return Promise.resolve(jsonResponse({ item: { id: 'srv-1' } }, { status: 201 }));
    }
    if (url.includes('/api/library/dedup-check')) {
      return Promise.resolve(jsonResponse({ match: null }));
    }
    return Promise.resolve(jsonResponse({}));
  });
  const user = userEvent.setup();
  render(<ConfirmationScreen
    source="text" tab="type" items={[libraryItem]}
    reasoning={null} dedupMatch={null} mode="library-only" onClose={vi.fn()}
  />);
  await user.click(screen.getByTestId('confirmation-item-0-micros-trigger'));
  const ironInput = screen.getByTestId('confirmation-item-0-micro-iron-input') as HTMLInputElement;
  await user.clear(ironInput);
  await user.type(ironInput, '99999999999'); // 11 digits, well above 999999
  await user.click(screen.getByTestId('confirmation-save'));
  await waitFor(() => expect(bodies.length).toBe(1));
  const body = bodies[0] as { nutrition: { micros?: Record<string, number> } };
  expect(body.nutrition.micros!.iron).toBe(999999);
});
```

**Test 3: pasting scientific notation `1e10` is capped to 999999**
```ts
it('caps scientific-notation paste (1e10) at 999999 (LM-SEC-1)', async () => {
  useLogFlowStore.getState().ensureClientId('type');
  const bodies: Record<string, unknown>[] = [];
  authFetch.mockImplementation((url, init) => {
    if (url.includes('/api/library/create')) {
      bodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
      return Promise.resolve(jsonResponse({ item: { id: 'srv-1' } }, { status: 201 }));
    }
    if (url.includes('/api/library/dedup-check')) {
      return Promise.resolve(jsonResponse({ match: null }));
    }
    return Promise.resolve(jsonResponse({}));
  });
  const user = userEvent.setup();
  render(<ConfirmationScreen
    source="text" tab="type" items={[libraryItem]}
    reasoning={null} dedupMatch={null} mode="library-only" onClose={vi.fn()}
  />);
  await user.click(screen.getByTestId('confirmation-item-0-micros-trigger'));
  const ironInput = screen.getByTestId('confirmation-item-0-micro-iron-input') as HTMLInputElement;
  await user.clear(ironInput);
  // Paste scientific notation — bypasses keypress filters
  await user.click(ironInput);
  await user.paste('1e10');
  await user.click(screen.getByTestId('confirmation-save'));
  await waitFor(() => expect(bodies.length).toBe(1));
  const body = bodies[0] as { nutrition: { micros?: Record<string, number> } };
  expect(body.nutrition.micros!.iron).toBe(999999);
});
```

### Zod schema test
Append to `tests/unit/lib/library/create-schema.test.ts`:

**Test 4: schema rejects micros value above 1_000_000**
```ts
it('rejects nutrition.micros values above 1_000_000 (LM-SEC-1 server-side cap)', () => {
  const body = {
    ...validBody(),
    nutrition: {
      kcal: 95,
      macros: { protein_g: 0.5, carbs_g: 25, fat_g: 0.3, fiber_g: 4.4 },
      micros: { sodium: 1_500_000 },
    },
  };
  expect(CreateLibraryBodySchema.safeParse(body).success).toBe(false);
});
it('accepts nutrition.micros value at exactly 1_000_000 boundary (LM-SEC-1)', () => {
  const body = {
    ...validBody(),
    nutrition: {
      kcal: 95,
      macros: { protein_g: 0.5, carbs_g: 25, fat_g: 0.3, fiber_g: 4.4 },
      micros: { sodium: 1_000_000 },
    },
  };
  expect(CreateLibraryBodySchema.safeParse(body).success).toBe(true);
});
```

(The boundary test is an extra-credit case — adds confidence the cap is inclusive — and keeps "Test 4" pair-symmetric with the existing schema test file's pattern of "rejects X" + "accepts X-1" pairings.)

## Regression risk

**Low.** Verified:
- The existing 4 ConfirmationItemMicros tests assert `8` as a valid micro value (well under 999_999) — no test relies on uncapped persistence; all PASS unchanged.
- The 12 existing create-schema tests all use values well under 1_000_000 — PASS unchanged.
- The `roundNutrition` function is unchanged; existing callers (macros rescaling, etc.) untouched.
- The reducer `EDIT_ITEM_MICRO` body is unchanged; the cap moves the boundary up to the input, which is the cleaner place to clamp UX-driven invalid values (failing fast at input edge > clamping at reducer).
- `FoodDetailMacros.tsx` edit surface has its own bounds enforcement (separate code path, not in this batch).

## Codex review pre-emption

Likely Codex challenge: *"Why not also cap inside the reducer / `roundNutrition` for defense in depth?"* — Answer documented in the comment: the reducer's job is rounding (NaN/≤0 → 0); the input boundary owns the upper-cap UX contract. Two enforcement points (input + Zod) is sufficient for this Informational risk tier; adding a third inside the reducer/`roundNutrition` would silently mutate other macros-rescaling call sites that depend on the function's current contract (negative→0, NaN→0, large→large preserved). Out of scope.

Likely Codex challenge: *"Why is the Zod cap higher than the input cap?"* — Answer documented in `Cap value` section: 1-unit headroom absorbs `roundNutrition`'s 1-decimal rounding so the schema doesn't reject values the input has already accepted at the boundary.

## UI-design guideline cross-check (web-ui-guide §Forms / Numeric inputs / Validation)

- HTML5 native validation via `min` / `max` attributes is the documented pattern for bounded numeric inputs.
- Soft caps in the change handler (`Math.min`) are appropriate when paste-vector bypass is a real concern (it is here — `Number('1e300')`).
- No new ARIA attributes needed — `aria-label` already present and unchanged; the cap doesn't introduce a new validation state worth announcing (silent clamp is fine for non-blocking informational caps).

## Stop-the-world flags

None. Pre-conditions satisfied:
- Line-number drift from the followups entry (L1493 → actual L1660) was easily resolved via grep; entry points all found.
- No existing test asserts uncapped values would be persisted; cap is safe to add.
- Coordination with Bug 4 understood (single 22-line region in `ConfirmationItemMicros`); Bug 4 proposal not yet in folder so cannot pre-rebase, but the risk is minimal.

---

**Estimated implementation time:** ~25 minutes (1 small edit in ConfirmationScreen.tsx, 1 small edit in create-schema.ts, 4 new tests). TDD red-green order: write the 4 failing tests first → verify they fail → apply the 2 source-file edits → verify all 4 + existing 16 tests are green.
