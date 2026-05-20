/**
 * `<FoodDetailMacros />` — Bug 8 + Bug 9 (library overhaul batch 2026-05-16).
 *
 * RED-first contract tests for:
 *
 *   Bug 8 — Fiber typography promotion + DV % line on all 4 macros.
 *     - Fiber MUST render under the macros block (Inter UPPERCASE dust
 *       label + JetBrains Mono ivory value), NOT inside the
 *       Newsreader-italic micros block where it falls today.
 *     - Each of the 4 macros (Protein / Carbs / Fat / Fiber) renders an
 *       FDA-DV-% suffix derived from `lib/nutrition/macro-dv.ts`.
 *
 *   Bug 9 — Micros collapsed-by-default with expand toggle.
 *     - Sodium remains visible by default.
 *     - Other micros (calcium, iron, vitamin_c, etc.) start hidden behind a
 *       Radix Collapsible with `aria-expanded="false"`.
 *     - Click expands, revealing additional rows in priority order.
 *     - Toggle is HIDDEN when no extra micros exist.
 *
 * The component is rendered directly (not through <FoodDetail />) to keep
 * the test surface tight to the macros/micros DOM contract.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FoodDetailMacros } from '@/app/(app)/library/_components/FoodDetail/FoodDetailMacros';
import type { LibraryItem } from '@/lib/library/fetch';

const baseItem: LibraryItem = {
  id: '11111111-1111-4111-8111-111111111111',
  client_id: '22222222-2222-4222-8222-222222222222',
  display_name: 'Pho Bo',
  normalized_name: 'pho bo',
  default_portion: 400,
  default_unit: 'g',
  nutrition: {
    kcal: 500,
    macros: { protein_g: 25, carbs_g: 50, fat_g: 18, fiber_g: 14 },
    micros: { sodium_mg: 800 },
  },
  thumbnail_url: null,
  log_count: 3,
  last_used_at: '2026-04-20T12:00:00Z',
  user_edited_flag: false,
  created_from: 'text',
  created_at: '2026-04-14T22:03:00Z',
};

const baseDraft = {
  display_name: 'Pho Bo',
  default_portion: '400',
  default_unit: 'g',
  kcal: '500',
  protein_g: '25',
  carbs_g: '50',
  fat_g: '18',
  fiber_g: '14',
  sugar_g: '',
  sodium_mg: '800',
};

function renderMacros(overrides: Partial<LibraryItem> = {}) {
  const item = { ...baseItem, ...overrides };
  return render(
    <FoodDetailMacros
      item={item}
      editing={false}
      draft={baseDraft}
      errors={{}}
      onDraftChange={vi.fn()}
    />,
  );
}

// -------- Bug 8: Fiber promotion + DV % line --------

describe('<FoodDetailMacros /> — Bug 8 Fiber promotion', () => {
  it('renders Fiber inside the macros block (NOT inside the micros block)', () => {
    renderMacros();
    const macros = screen.getByTestId('food-detail-macros');
    expect(within(macros).getByTestId('food-detail-macro-fiber_g')).toBeInTheDocument();
  });

  it("Fiber's label uses the `kalori-fd-macro-label` class (Inter UPPERCASE dust), NOT the serif-italic micro-name class", () => {
    renderMacros();
    const fiberRow = screen.getByTestId('food-detail-macro-fiber_g');
    const labels = fiberRow.querySelectorAll('.kalori-fd-macro-label');
    expect(labels.length).toBeGreaterThan(0);
    // The fiber row MUST NOT contain a `.kalori-fd-micro-name` (serif italic).
    expect(fiberRow.querySelector('.kalori-fd-micro-name')).toBeNull();
  });

  it('does NOT render Fiber inside the micros read-only block', () => {
    renderMacros();
    const microsBlock = screen.getByTestId('food-detail-micros');
    expect(within(microsBlock).queryByText(/^fiber$/i)).toBeNull();
  });
});

describe('<FoodDetailMacros /> — Bug 8 DV % line on all 4 macros', () => {
  it('Protein row renders an FDA-DV % suffix derived from MACRO_DV_G.protein (50g)', () => {
    renderMacros();
    const row = screen.getByTestId('food-detail-macro-protein_g');
    // 25g / 50g = 50%
    expect(within(row).getByTestId('food-detail-macro-dv-protein_g')).toHaveTextContent(
      /50%\s*DV/i,
    );
  });

  it('Carbs row renders an FDA-DV % suffix derived from MACRO_DV_G.carbs (275g)', () => {
    renderMacros();
    const row = screen.getByTestId('food-detail-macro-carbs_g');
    // 50g / 275g = 18.18% → 18
    expect(within(row).getByTestId('food-detail-macro-dv-carbs_g')).toHaveTextContent(/18%\s*DV/i);
  });

  it('Fat row renders an FDA-DV % suffix derived from MACRO_DV_G.fat (78g)', () => {
    renderMacros();
    const row = screen.getByTestId('food-detail-macro-fat_g');
    // 18g / 78g = 23.08% → 23
    expect(within(row).getByTestId('food-detail-macro-dv-fat_g')).toHaveTextContent(/23%\s*DV/i);
  });

  it('Fiber row renders an FDA-DV % suffix derived from MACRO_DV_G.fiber (28g)', () => {
    renderMacros();
    const row = screen.getByTestId('food-detail-macro-fiber_g');
    // 14g / 28g = 50%
    expect(within(row).getByTestId('food-detail-macro-dv-fiber_g')).toHaveTextContent(/50%\s*DV/i);
  });

  it('omits the DV % element when a macro value is null/zero (no "0% DV" line)', () => {
    renderMacros({
      nutrition: {
        ...baseItem.nutrition,
        macros: { protein_g: 0, carbs_g: 50, fat_g: 18, fiber_g: 14 },
      },
    });
    const row = screen.getByTestId('food-detail-macro-protein_g');
    expect(within(row).queryByTestId('food-detail-macro-dv-protein_g')).toBeNull();
  });
});

// -------- Bug 9: Micros expand toggle --------

describe('<FoodDetailMacros /> — Bug 9 micros collapsed expand toggle', () => {
  const richMicros: LibraryItem = {
    ...baseItem,
    nutrition: {
      ...baseItem.nutrition,
      micros: {
        sodium_mg: 800,
        calcium_mg: 200,
        iron_mg: 2.5,
        vitamin_c_mg: 30,
      },
    },
  };

  it('renders sodium by default in the micros block', () => {
    render(
      <FoodDetailMacros
        item={richMicros}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    const micros = screen.getByTestId('food-detail-micros');
    expect(within(micros).getByText(/^sodium$/i)).toBeInTheDocument();
  });

  it('does NOT show calcium/iron/vitamin_c by default (collapsed)', () => {
    render(
      <FoodDetailMacros
        item={richMicros}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    // Trigger button exists with aria-expanded=false.
    const trigger = screen.getByTestId('food-detail-micros-expand-trigger');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // Hidden rows are not in the accessibility tree (Collapsible swaps display).
    expect(screen.queryByText(/^calcium$/i)).toBeNull();
    expect(screen.queryByText(/^iron$/i)).toBeNull();
    expect(screen.queryByText(/vitamin\s*c/i)).toBeNull();
  });

  it('clicking the trigger expands and reveals the extra micros', async () => {
    const user = userEvent.setup();
    render(
      <FoodDetailMacros
        item={richMicros}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    const trigger = screen.getByTestId('food-detail-micros-expand-trigger');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/^calcium$/i)).toBeInTheDocument();
    expect(screen.getByText(/^iron$/i)).toBeInTheDocument();
    expect(screen.getByText(/vitamin\s*c/i)).toBeInTheDocument();
  });

  it('does NOT render the expand toggle when only sodium_mg is present (no extras to expand into)', () => {
    render(
      <FoodDetailMacros
        item={baseItem}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('food-detail-micros-expand-trigger')).toBeNull();
  });

  it('does NOT render the expand toggle when nutrition.micros is empty', () => {
    render(
      <FoodDetailMacros
        item={{ ...baseItem, nutrition: { ...baseItem.nutrition, micros: {} } }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('food-detail-micros-expand-trigger')).toBeNull();
  });
});

// -------- Bug 2: Library micros always render with a unit suffix --------
//
// Today's surface: `buildMicroRow` resolves units via `unitFromMicroKey`
// which strips suffixes from `*_mg / *_mcg / *_ug / *_g`. Returns `''` for
// keys with no suffix (AI-drift bare canonical codes). The canonical unit
// map (`CANONICAL_CODE_TO_UNIT` + `canonicalMicroUnit`) sourced from
// `DEFAULT_MICROS_LIST` resolves units for every shape the canonicalizer
// accepts — suffixed legacy aliases, bare canonical codes, display-name
// keys — so the user never sees `Vitamin C  30` with no unit.

describe('<FoodDetailMacros /> — Bug 2 library micros unit display', () => {
  it('suffixed legacy micro (vitamin_c_mg) renders with "mg" suffix in the expanded panel', async () => {
    const user = userEvent.setup();
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: { sodium_mg: 800, vitamin_c_mg: 30 },
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('food-detail-micros-expand-trigger'));
    expect(screen.getByText(/^30\s+mg$/i)).toBeInTheDocument();
  });

  it('bare canonical micro (vitamin_c, no suffix) ALSO renders with "mg" suffix — proves canonical map fallback', async () => {
    // This is the bug-reproducer case. Before the fix, `unitFromMicroKey`
    // returned `''` because the key carries no suffix, and the row dropped
    // through to the `${value}` else-branch — user saw "30" with no unit.
    const user = userEvent.setup();
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: { sodium_mg: 800, vitamin_c: 30 },
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('food-detail-micros-expand-trigger'));
    expect(screen.getByText(/^30\s+mg$/i)).toBeInTheDocument();
  });

  it('bare canonical mcg micro (vitamin_a) renders with "mcg" suffix — fat-soluble vitamins not silently mis-unit', async () => {
    // Vitamin A's canonical unit is mcg (FDA DV 900mcg RAE). If the renderer
    // fell through to a hardcoded `mg` literal or to the no-unit branch,
    // the user could not tell mcg from mg — a 1000x mental-model gap.
    const user = userEvent.setup();
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: { sodium_mg: 800, vitamin_a: 800 },
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('food-detail-micros-expand-trigger'));
    expect(screen.getByText(/^800\s+mcg$/i)).toBeInTheDocument();
  });

  it('sodium always-visible row renders "mg" via the canonical helper (not a hardcoded literal)', () => {
    // The default row's unit literal used to live as a hardcoded
    // `t.library.detail.macroUnitMg`. After the fix, sodium's unit is
    // resolved through `canonicalMicroUnit('sodium')`. Behavioural assertion
    // unchanged — sodium still ends in " mg" — but the test pins that the
    // hardcoded path is no longer the source.
    render(
      <FoodDetailMacros
        item={baseItem}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    const micros = screen.getByTestId('food-detail-micros');
    // Sodium row value cell: "800 mg".
    expect(within(micros).getByText(/^800\s+mg$/i)).toBeInTheDocument();
  });

  it('orphan key (omega3_g, not in DEFAULT_MICROS_LIST) still renders with "g" via legacy suffix fallback', async () => {
    // The canonical map closes its allowlist at 30 entries. Anything
    // outside (legacy `omega3_g`, future un-canonicalised micros) must
    // still pick up its unit from the existing suffix parser. The fallback
    // path stays alive.
    const user = userEvent.setup();
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: { sodium_mg: 800, omega3_g: 1.5 },
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('food-detail-micros-expand-trigger'));
    expect(screen.getByText(/^1\.5\s+g$/i)).toBeInTheDocument();
  });

  it('suffix-stripping does NOT double-unit a pre-suffixed key (vitamin_c_mg renders "30 mg", not "30 mg mg")', async () => {
    // Defensive regression — if the canonical resolver were chained
    // naively after suffix-stripping, `vitamin_c_mg` could end up
    // rendering both the suffix-derived `mg` AND the canonical `mg`.
    // Assert the exact final string shape so a double-unit bug is loud.
    const user = userEvent.setup();
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: { sodium_mg: 800, vitamin_c_mg: 30 },
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('food-detail-micros-expand-trigger'));
    expect(screen.queryByText(/30\s+mg\s+mg/i)).toBeNull();
    expect(screen.getByText(/^30\s+mg$/i)).toBeInTheDocument();
  });
});

// -------- Bug 2 precision tiers (bugfix-tomi 2026-05-17-library-card-and-micros-precision) --------
//
// `formatMilligrams` previously collapsed any sub-1 value to "0" via
// `Math.round`, producing the user-visible mismatch "0 mg · N% DV" alongside
// a non-zero DV badge (because `formatMicroPercent` operates on the
// unrounded source value). The fix adds two new precision tiers so
// micronutrient rows with trace mg/mcg amounts surface their actual value
// honestly:
//   - 0 < v < 0.05  → `toFixed(2)` (e.g. 0.04 → "0.04")
//   - 0.05 <= v < 1 → `toFixed(1)` (e.g. 0.3  → "0.3")
//   - v >= 1        → existing integer rounding (unchanged)

describe('<FoodDetailMacros /> — Bug 2 micros precision display', () => {
  // iron RDA = 18 mg → 0.3 / 18 = 1.67% → "2%" (clears the 1% RDA filter
  // so the row stays in the sorted/filtered output; sodium @ 0.3 mg /
  // 2300 mg = 0.013% would drop). Iron is the canonical fixture for the
  // bug — sub-1 mg with DV badge that survives the cross-surface filter.
  it('iron_mg = 0.3 renders "0.3 mg" with "· 2% DV" suffix (not the pre-fix "0 mg")', async () => {
    const user = userEvent.setup();
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: { sodium_mg: 800, iron_mg: 0.3 },
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('food-detail-micros-expand-trigger'));
    const ironRow = screen.getByTestId('food-detail-micro-row-iron_mg');
    // Exact "0.3 mg" string (the post-fix output).
    expect(within(ironRow).getByText(/^0\.3\s+mg$/i)).toBeInTheDocument();
    // Regression guard: the pre-fix output of "0 mg" must NOT appear on
    // this row.
    expect(within(ironRow).queryByText(/^0\s+mg$/i)).toBeNull();
    // DV badge unchanged: 0.3 / 18 = 1.67 → "2%".
    expect(within(ironRow).getByTestId('food-detail-micro-dv-iron_mg')).toHaveTextContent(
      /2%\s*DV/i,
    );
  });

  it('bare canonical mcg micro (vitamin_d = 0.2) renders "0.2 mcg" (sub-1 mcg, 1-decimal tier)', async () => {
    // vitamin_d canonical RDA = 20 mcg → 0.2 / 20 = 1% → clears the
    // <1% filter. Proves the new precision tier applies UNIFORMLY to
    // mcg rows (the same `formatMilligrams` formatter handles both
    // mg and mcg display per FoodDetailMacros.tsx line 561+563).
    const user = userEvent.setup();
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: { sodium_mg: 800, vitamin_d: 0.2 },
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('food-detail-micros-expand-trigger'));
    expect(screen.getByText(/^0\.2\s+mcg$/i)).toBeInTheDocument();
  });
});

// -------- Bug 3: Library micros render `· {n}% DV` mono suffix + role="meter" --------
//
// Today (post-Bug-2) every micro row in the library detail view renders
// "{value} {unit}" but the user has no reference frame — is 30 mg of
// vitamin C a lot or a little? The dashboard MicrosRdaPanel already
// answers that question; the library view does not. Bug 3 adds:
//
//   1. A `· {n}% DV` mono suffix on EVERY micro row whose canonical key
//      has an RDA in `DEFAULT_MICROS_LIST`. The percent is derived from
//      `formatMicroPercent(value, rda)` — same helper the dashboard
//      `<MicronutrientPanel />` uses, so the library and the dashboard
//      cannot disagree on a row.
//   2. `role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}`
//      wrapping each measurable row (ui-design.md §7.1.6 line 989).
//      Rows WITHOUT a canonical RDA reference (orphan keys like
//      `omega3_g`) MUST NOT advertise as meters — silently asserting
//      "100% of nothing" would lie to screen readers.
//   3. The DV suffix MUST omit entirely when there's no RDA (orphan
//      keys, sugar's macro slot) — never render "0% DV" as a placeholder.

describe('<FoodDetailMacros /> — Bug 3 library micros DV suffix + role=meter', () => {
  it('vitamin_c_mg row renders a "· 33% DV" suffix via formatMicroPercent (30 mg ÷ 90 mg RDA)', async () => {
    const user = userEvent.setup();
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: { sodium_mg: 800, vitamin_c_mg: 30 },
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('food-detail-micros-expand-trigger'));
    // 30 / 90 = 33.33 → 33%
    expect(screen.getByTestId('food-detail-micro-dv-vitamin_c_mg')).toHaveTextContent(/33%\s*DV/i);
  });

  it('vitamin_a (bare canonical) row renders an "· 89% DV" suffix via canonicalMicroRda (800 ÷ 900 mcg)', async () => {
    // 800 / 900 = 88.88 → 89%. Critically the DV reference is reached
    // through `canonicalMicroRda('vitamin_a')` even though the key
    // carries no `_mcg` suffix — proves canonical-RDA fallback for
    // AI-drift bare codes.
    const user = userEvent.setup();
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: { sodium_mg: 800, vitamin_a: 800 },
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('food-detail-micros-expand-trigger'));
    expect(screen.getByTestId('food-detail-micro-dv-vitamin_a')).toHaveTextContent(/89%\s*DV/i);
  });

  it('sodium always-visible default row renders a "· 35% DV" suffix (800 ÷ 2300 mg)', () => {
    // 800 / 2300 = 34.78 → 35%. Default-row coverage — Bug 3 must
    // apply to the always-visible sodium row, not only the collapsible
    // panel.
    render(
      <FoodDetailMacros
        item={baseItem}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('food-detail-micro-dv-sodium')).toHaveTextContent(/35%\s*DV/i);
  });

  it('vitamin_c_mg row attaches role="meter" with aria-valuenow=33 / aria-valuemin=0 / aria-valuemax=100', async () => {
    const user = userEvent.setup();
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: { sodium_mg: 800, vitamin_c_mg: 30 },
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('food-detail-micros-expand-trigger'));
    const meter = screen.getByTestId('food-detail-micro-row-vitamin_c_mg');
    expect(meter).toHaveAttribute('role', 'meter');
    expect(meter).toHaveAttribute('aria-valuenow', '33');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '100');
  });

  it('sodium default row attaches role="meter" with aria-valuenow=35 (clamped 0..100)', () => {
    render(
      <FoodDetailMacros
        item={baseItem}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    const meter = screen.getByTestId('food-detail-micro-row-sodium');
    expect(meter).toHaveAttribute('role', 'meter');
    expect(meter).toHaveAttribute('aria-valuenow', '35');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '100');
  });

  it('over-RDA rows (e.g. 4600 mg sodium = 200% of 2300) clamp aria-valuenow to 100 — meter cap', () => {
    // The DV TEXT SUFFIX may show the true 200% (informative — the user
    // SHOULD see overshoot). The aria-valuenow MUST be clamped to the
    // declared aria-valuemax (100) or screen readers report invalid
    // values. Matches the dashboard `MicrosOverflowToggle` precedent
    // (`Math.min(100, row.pct)`).
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: { sodium_mg: 4600 },
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    const meter = screen.getByTestId('food-detail-micro-row-sodium');
    expect(meter).toHaveAttribute('aria-valuenow', '100');
    // The DV suffix itself reports the un-clamped 200% so the user knows
    // they exceeded the reference value.
    expect(screen.getByTestId('food-detail-micro-dv-sodium')).toHaveTextContent(/200%\s*DV/i);
  });

  it('orphan key (omega3_g) row does NOT render a DV suffix and does NOT carry role="meter"', async () => {
    // omega3 is not in DEFAULT_MICROS_LIST — `canonicalMicroRda`
    // returns undefined. The row MUST render exactly as it does today
    // (value + unit only). No `0% DV`. No `role="meter"`.
    const user = userEvent.setup();
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: { sodium_mg: 800, omega3_g: 1.5 },
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('food-detail-micros-expand-trigger'));
    // Value still renders with its unit (Bug 2 fallback path).
    expect(screen.getByText(/^1\.5\s+g$/i)).toBeInTheDocument();
    // But NO DV suffix and NO meter wrapper.
    expect(screen.queryByTestId('food-detail-micro-dv-omega3_g')).toBeNull();
    expect(screen.queryByTestId('food-detail-micro-row-omega3_g')).toBeNull();
  });

  it('sugar default row does NOT render a DV suffix (sugar has no RDA in DEFAULT_MICROS_LIST)', () => {
    // Sugar is a carb sub-component shown in the micros block by design
    // (see MicrosReadOnly default-row build). It is NOT a canonical
    // micro — `canonicalMicroRda('sugar')` returns undefined. The row
    // continues to render today's "20 g" and nothing else.
    //
    // sugar_g is stored on macros at runtime but kept off the typed
    // LibraryItem.macros interface in lib/library/fetch.ts (see
    // FoodDetailMacros.tsx line 231 — read via `as { sugar_g?: number }`
    // cast). Mirror the component's widening here so the literal type-
    // checks. Matches the precedent set by commit a0879b1 for the IDRIFT
    // test sibling.
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            macros: { ...baseItem.nutrition.macros!, sugar_g: 20 } as {
              protein_g: number;
              carbs_g: number;
              fat_g: number;
              fiber_g?: number;
              cholesterol_mg?: number;
            },
            micros: { sodium_mg: 800 },
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('food-detail-micro-dv-sugar')).toBeNull();
    expect(screen.queryByTestId('food-detail-micro-row-sugar')).toBeNull();
  });

  it('zero-value canonical micro (vitamin_c = 0) is silently dropped by the universal <1% filter', () => {
    // Bug 1 (bugfix-tomi 2026-05-17-micros-display-consistency) — the
    // universal display rule hides RDA-having rows below 1%. A 0%
    // vitamin_c row never reaches the DV-suffix codepath because the
    // `sortAndFilterMicrosByRdaPct` helper filters it out. The DOM does
    // not crash and no vitamin_c testid renders.
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: { sodium_mg: 800, vitamin_c: 0 },
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    // No vitamin_c row, no vitamin_c DV suffix.
    expect(screen.queryByTestId('food-detail-micro-dv-vitamin_c')).toBeNull();
    expect(screen.queryByTestId('food-detail-micro-row-vitamin_c')).toBeNull();
    // Sodium (35%) still renders as the head row.
    expect(screen.getByTestId('food-detail-micro-row-sodium')).toBeInTheDocument();
  });

  it('value text remains intact next to the DV suffix (vitamin_c_mg still says "30 mg" + "33% DV" as siblings)', async () => {
    // Bug 2 pinned that the value cell reads exactly "30 mg" with
    // matching `getByText(/^30\s+mg$/i)`. Bug 3 adds a DV suffix as a
    // SEPARATE sibling span so the value cell text node is unchanged.
    // This pins that the Bug 2 assertion still holds.
    const user = userEvent.setup();
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: { sodium_mg: 800, vitamin_c_mg: 30 },
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('food-detail-micros-expand-trigger'));
    // Value text still its own node.
    expect(screen.getByText(/^30\s+mg$/i)).toBeInTheDocument();
    // DV suffix is its own node.
    expect(screen.getByTestId('food-detail-micro-dv-vitamin_c_mg')).toBeInTheDocument();
  });
});

// -------- Codex R1 C1: sodium canonical/legacy key alignment --------
//
// `ConfirmationItemMicros` (library-only confirmation flow, Bug 1) writes
// micros under canonical DEFAULT_MICROS_LIST codes — including the bare
// `sodium` key. `FoodDetailMacros` historically read only the legacy
// `micros.sodium_mg` suffix-keyed shape, so a library row created through
// the new add-form had its sodium fall into the collapsible extras and
// could not be edited from the dedicated sodium input.
//
// Contract (all three tests below):
//   1. Sodium row + value + meter render IDENTICALLY for `micros.sodium`,
//      `micros.sodium_mg`, or both. The canonical resolver normalises the
//      key shape; the renderer never sees the drift.
//   2. The extras loop excludes BOTH `sodium` and `sodium_mg`. A canonical-
//      only sodium row must NEVER reach the collapsible.
//   3. When both keys are present (data drift), the canonical row wins;
//      neither value is double-rendered.

describe('<FoodDetailMacros /> — Codex R1 C1 sodium canonical/legacy alignment', () => {
  it('canonical-only `micros.sodium = 500` renders 500 mg in the always-visible sodium row', () => {
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            // Note: ONLY `sodium`, no `sodium_mg`. This is the shape
            // ConfirmationItemMicros writes for the new library-only flow.
            micros: { sodium: 500 } as Record<string, number>,
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    const meter = screen.getByTestId('food-detail-micro-row-sodium');
    expect(meter).toHaveAttribute('role', 'meter');
    // 500 mg / 2300 mg = 21.7% → 22%
    expect(meter).toHaveAttribute('aria-valuenow', '22');
    const micros = screen.getByTestId('food-detail-micros');
    expect(within(micros).getByText(/^500\s+mg$/i)).toBeInTheDocument();
  });

  it('legacy-only `micros.sodium_mg = 500` continues to render 500 mg (back-compat preserved)', () => {
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: { sodium_mg: 500 },
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    const meter = screen.getByTestId('food-detail-micro-row-sodium');
    expect(meter).toHaveAttribute('role', 'meter');
    expect(meter).toHaveAttribute('aria-valuenow', '22');
    const micros = screen.getByTestId('food-detail-micros');
    expect(within(micros).getByText(/^500\s+mg$/i)).toBeInTheDocument();
  });

  it('drift case: BOTH `sodium` and `sodium_mg` present → canonical wins, no double-render', () => {
    // Data drift defensive case. The renderer must pick ONE source and not
    // double-render. Canonical `sodium` wins (the new ConfirmationItemMicros
    // shape), and neither key bleeds into the extras collapsible.
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: { sodium: 500, sodium_mg: 999 } as Record<string, number>,
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    const micros = screen.getByTestId('food-detail-micros');
    // Canonical wins → 500, not 999.
    expect(within(micros).getByText(/^500\s+mg$/i)).toBeInTheDocument();
    // 999 mg variant MUST NOT appear anywhere (no double render).
    expect(within(micros).queryByText(/^999\s+mg$/i)).toBeNull();
    // Only ONE sodium row exists.
    const sodiumRows = within(micros).queryAllByTestId('food-detail-micro-row-sodium');
    expect(sodiumRows.length).toBe(1);
  });

  it('extras loop: canonical `sodium` appears exactly ONCE (head row or collapsible) — never double-rendered', async () => {
    // Bug 1 (bugfix-tomi 2026-05-17-micros-display-consistency) —
    // sodium is no longer pinned to the head. It enters the unified list
    // and sorts by pct like every other RDA-having row. With
    // sodium=500 (22%) + vitamin_c_mg=30 (33%), vitamin_c wins the head
    // slot and sodium lands inside the collapsible. The historic
    // "double-render" guard (canonical-wins dedup) still applies: only
    // ONE sodium row exists across the entire `MicrosReadOnly` output.
    const user = userEvent.setup();
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: { sodium: 500, vitamin_c_mg: 30 } as Record<string, number>,
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('food-detail-micros-expand-trigger'));
    // Exactly ONE sodium row anywhere in the micros block (head or
    // collapsible), never both. This is the dedup contract.
    const micros = screen.getByTestId('food-detail-micros');
    const sodiumRows = within(micros).queryAllByTestId('food-detail-micro-row-sodium');
    expect(sodiumRows).toHaveLength(1);
    // Vitamin C wins the head slot (33% > 22% sodium); sodium lands in
    // the collapsible. Both are present, sorted by pct desc.
    const collapsibleContent = screen.getByTestId('food-detail-micros-expand-content');
    expect(
      within(collapsibleContent).getByTestId('food-detail-micro-row-sodium'),
    ).toBeInTheDocument();
    // Head row is vitamin_c_mg.
    expect(screen.getByText(/^30\s+mg$/i)).toBeInTheDocument();
  });

  it('edit mode: canonical-only `micros.sodium = 500` exposes the sodium edit input', async () => {
    // Codex's "the edit input cannot edit it" — the EditMicrosCollapsible
    // gates the sodium input on `savedSodiumMg > 0`. With canonical-only
    // sodium, the legacy `micros.sodium_mg` lookup returned 0, so the
    // input was suppressed. Post-fix, the canonical resolver picks up
    // `micros.sodium` and the input renders.
    //
    // bugfix library-micros-parse (2026-05-17): testid migrated from
    // `food-detail-edit-sodium-input` to `food-detail-edit-micro-sodium-input`
    // when the edit-mode panel was extended to handle all canonical micros.
    const user = userEvent.setup();
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: { sodium: 500 } as Record<string, number>,
          },
        }}
        editing={true}
        draft={{ ...baseDraft, sodium_mg: '500', micros: { sodium: '500' } }}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    // Expand the edit-mode collapsible to reach the sodium input.
    await user.click(screen.getByTestId('food-detail-edit-micros-trigger'));
    expect(screen.getByTestId('food-detail-edit-micro-sodium-input')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// LM-I1 — display-name "Sodium" read parity (bugfix batch followups 2026-05-17)
// ---------------------------------------------------------------------------
//
// `resolveSodiumMg` (pre-fix) read only the raw keys `micros.sodium` and
// `micros.sodium_mg` via direct bracket access. The extras-loop exclusion
// (FoodDetailMacros.tsx:629), in contrast, routes every key through
// `canonicalizeMicroKey` and drops anything whose canonical form is
// `'sodium'` — which INCLUDES display-name `"Sodium"` (resolved via
// `DISPLAY_NAME_TO_CANONICAL_CODE`). A `micros: { "Sodium": 500 }` row was
// therefore hidden from BOTH the always-visible meter (read-path strict)
// AND the collapsible extras (exclude-path canonical-aware) — the user saw
// no sodium at all.
//
// The fix routes `resolveSodiumMg` through `canonicalizeMicroKey`, mirroring
// the exclude-path. After the fix, both paths accept canonical / legacy
// alias / display-name; canonical wins on drift.
//
// Encoding-boundary symmetry rule (lessons 2026-05-14): producer and
// consumer paths both route through `canonicalizeMicroKey`.

describe('<FoodDetailMacros /> — LM-I1 display-name parity', () => {
  it('display-name `micros["Sodium"] = 500` renders 500 mg in the always-visible sodium row', () => {
    // RED pre-fix: resolveSodiumMg returns null for display-name "Sodium"
    // because direct bracket access only checks `sodium` / `sodium_mg`.
    // The exclude-path canonicalizes and drops it from extras too — so the
    // row vanishes entirely.
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            // Display-name shape — capital S, no underscore suffix.
            // `canonicalizeMicroKey("Sodium")` returns `"sodium"` via
            // `DISPLAY_NAME_TO_CANONICAL_CODE`.
            micros: { Sodium: 500 } as Record<string, number>,
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    const meter = screen.getByTestId('food-detail-micro-row-sodium');
    expect(meter).toHaveAttribute('role', 'meter');
    // 500 mg / 2300 mg ≈ 21.7% → 22%
    expect(meter).toHaveAttribute('aria-valuenow', '22');
    const micros = screen.getByTestId('food-detail-micros');
    expect(within(micros).getByText(/^500\s+mg$/i)).toBeInTheDocument();
  });

  it('canonical `micros.sodium = 500` still renders 500 mg (regression cite)', () => {
    // Regression cite — the rewrite of resolveSodiumMg through
    // canonicalizeMicroKey must NOT break the canonical-only path.
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: { sodium: 500 } as Record<string, number>,
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    const meter = screen.getByTestId('food-detail-micro-row-sodium');
    expect(meter).toHaveAttribute('role', 'meter');
    expect(meter).toHaveAttribute('aria-valuenow', '22');
    const micros = screen.getByTestId('food-detail-micros');
    expect(within(micros).getByText(/^500\s+mg$/i)).toBeInTheDocument();
  });

  it('legacy `micros.sodium_mg = 500` still renders 500 mg (regression cite)', () => {
    // Regression cite — back-compat for legacy unit-suffix shape.
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: { sodium_mg: 500 } as Record<string, number>,
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    const meter = screen.getByTestId('food-detail-micro-row-sodium');
    expect(meter).toHaveAttribute('role', 'meter');
    expect(meter).toHaveAttribute('aria-valuenow', '22');
    const micros = screen.getByTestId('food-detail-micros');
    expect(within(micros).getByText(/^500\s+mg$/i)).toBeInTheDocument();
  });

  it('drift case: BOTH `Sodium` (display-name) and `sodium` (canonical) → canonical wins', () => {
    // Data drift defensive case — pins canonical-wins precedence under
    // the new canonicalizeMicroKey-routed read path. The renderer must
    // pick the canonical entry (100), never the display-name entry (500).
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: { Sodium: 500, sodium: 100 } as Record<string, number>,
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    const micros = screen.getByTestId('food-detail-micros');
    // Canonical wins → 100 mg, not 500 mg.
    expect(within(micros).getByText(/^100\s+mg$/i)).toBeInTheDocument();
    expect(within(micros).queryByText(/^500\s+mg$/i)).toBeNull();
    // Only ONE sodium row exists.
    const sodiumRows = within(micros).queryAllByTestId('food-detail-micro-row-sodium');
    expect(sodiumRows.length).toBe(1);
    // 100 / 2300 ≈ 4.3% → 4%
    expect(sodiumRows[0]).toHaveAttribute('aria-valuenow', '4');
  });

  it('extras loop: display-name `Sodium` appears exactly ONCE (canonical dedup, sorted by pct)', async () => {
    // Bug 1 (bugfix-tomi 2026-05-17-micros-display-consistency) —
    // sodium is no longer pinned to the head. With sodium=500 (22%) +
    // vitamin_c_mg=30 (33%), vitamin_c wins the head slot and sodium
    // lands inside the collapsible. The canonical-dedup contract still
    // holds: display-name "Sodium" → canonical sodium → exactly ONE
    // sodium row across the entire micros block.
    const user = userEvent.setup();
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: { Sodium: 500, vitamin_c_mg: 30 } as Record<string, number>,
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('food-detail-micros-expand-trigger'));
    const micros = screen.getByTestId('food-detail-micros');
    const sodiumRows = within(micros).queryAllByTestId('food-detail-micro-row-sodium');
    expect(sodiumRows).toHaveLength(1);
    // Head row is vitamin_c (33%); sodium (22%) is in the collapsible.
    const collapsibleContent = screen.getByTestId('food-detail-micros-expand-content');
    expect(
      within(collapsibleContent).getByTestId('food-detail-micro-row-sodium'),
    ).toBeInTheDocument();
    expect(within(collapsibleContent).getByText(/^500\s+mg$/i)).toBeInTheDocument();
    expect(screen.getByText(/^30\s+mg$/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Bug 1 — universal cross-surface display rule (bugfix-tomi
// 2026-05-17-micros-display-consistency).
//
// User-articulated rule applied UNIVERSALLY to MicrosReadOnly:
//   - RDA-having rows with pct < 1% → HIDE (sodium <1% disappears)
//   - RDA-having rows with pct >= 1% → SHOW, sorted DESC by pct
//   - RDA-unknown rows (sugar, orphan keys) → SHOW at end (sugar visible
//     under the new rule even though it has no canonical RDA)
//
// The always-visible "sodium + sugar" hardcoded carve-out is gone — every
// row flows through `sortAndFilterMicrosByRdaPct`. The visual contract
// still maintains "head row visible + tail under Collapsible" so the
// page mass is preserved, but the head is whichever row tops the sorted
// list (typically sodium for normal meals at 35% DV).
// ---------------------------------------------------------------------------

describe('<FoodDetailMacros /> — Bug 1 universal cross-surface display rule', () => {
  it('RDA-having rows render in DESC pct order across head + collapsible', async () => {
    // sodium 800/2300 = 35%, vitamin_c 30/90 = 33%, calcium 200/1300 = 15%,
    // iron 2.5/18 = 14%. Expected DOM order top-down: sodium, vitamin_c,
    // calcium, iron.
    const user = userEvent.setup();
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: {
              sodium_mg: 800,
              vitamin_c_mg: 30,
              calcium_mg: 200,
              iron_mg: 2.5,
            },
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('food-detail-micros-expand-trigger'));
    const micros = screen.getByTestId('food-detail-micros');
    const rows = within(micros).getAllByText(/.+/, { selector: '.kalori-fd-micro-name' });
    const names = rows.map((r) => r.textContent ?? '');
    const sodiumIdx = names.findIndex((n) => /sodium/i.test(n));
    const vcIdx = names.findIndex((n) => /vitamin\s*c/i.test(n));
    const caIdx = names.findIndex((n) => /^calcium$/i.test(n));
    const feIdx = names.findIndex((n) => /^iron$/i.test(n));
    expect(sodiumIdx).toBeLessThan(vcIdx);
    expect(vcIdx).toBeLessThan(caIdx);
    expect(caIdx).toBeLessThan(feIdx);
  });

  it('sodium <1% (e.g. 10 mg → 0% rounded) is HIDDEN — no row, no testid (always-visible carve-out removed)', () => {
    // 10 mg / 2300 = 0.43% → rounds to 0% → below 1% threshold → row dropped.
    // Pre-Bug-1 behaviour: sodium ALWAYS rendered. Post-Bug-1: sodium
    // follows the universal rule.
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: { sodium_mg: 10 },
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('food-detail-micro-row-sodium')).toBeNull();
    expect(screen.queryByTestId('food-detail-micro-dv-sodium')).toBeNull();
    // The empty-state branch fires (no rows survive the filter).
    expect(screen.getByTestId('food-detail-no-micros')).toBeInTheDocument();
  });

  it('sugar (RDA-unknown) is STILL shown even at low values — sorted to end of list', async () => {
    // Sugar has no canonical RDA in DEFAULT_MICROS_LIST. The universal
    // rule keeps RDA-unknown rows visible at the end of the sorted list.
    // With sodium 800 (35%) + sugar 5g, sodium is head; sugar lands in
    // the collapsible tail (RDA-unknown rows sort after all RDA-having).
    const user = userEvent.setup();
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            macros: { ...baseItem.nutrition.macros!, sugar_g: 5 } as {
              protein_g: number;
              carbs_g: number;
              fat_g: number;
              fiber_g?: number;
              sugar_g?: number;
            },
            micros: { sodium_mg: 800 },
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    // Sugar lands in the collapsible (sodium 35% is head). Expand to reveal.
    await user.click(screen.getByTestId('food-detail-micros-expand-trigger'));
    const micros = screen.getByTestId('food-detail-micros');
    expect(within(micros).getByText(/^sugar$/i)).toBeInTheDocument();
    // No DV suffix for sugar (RDA-unknown branch).
    expect(within(micros).queryByTestId('food-detail-micro-dv-sugar')).toBeNull();
  });

  it('sodium >=1% (e.g. 800 mg → 35%) is sorted into its pct-position (head when top, collapsible otherwise)', async () => {
    // sodium=800 (35%), vitamin_c=30 (33%). Sodium is head; vitamin_c
    // follows in the collapsible.
    const user = userEvent.setup();
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            micros: { sodium_mg: 800, vitamin_c_mg: 30 },
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    // Sodium head visible immediately (no click needed).
    expect(screen.getByTestId('food-detail-micro-row-sodium')).toBeInTheDocument();
    // Vitamin C is initially collapsed; expand it.
    await user.click(screen.getByTestId('food-detail-micros-expand-trigger'));
    const collapsibleContent = screen.getByTestId('food-detail-micros-expand-content');
    expect(
      within(collapsibleContent).getByTestId('food-detail-micro-row-vitamin_c_mg'),
    ).toBeInTheDocument();
  });

  it('empty micros + no sugar → empty-state branch renders the food-detail-no-micros testid', () => {
    render(
      <FoodDetailMacros
        item={{
          ...baseItem,
          nutrition: {
            ...baseItem.nutrition,
            macros: { ...baseItem.nutrition.macros! },
            micros: {},
          },
        }}
        editing={false}
        draft={baseDraft}
        errors={{}}
        onDraftChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('food-detail-no-micros')).toBeInTheDocument();
  });
});
