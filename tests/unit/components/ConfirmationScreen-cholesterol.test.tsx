/**
 * Phase 2C — <ConfirmationScreen /> renders cholesterol_mg per row.
 *
 * The post-AI confirmation screen surfaces the 5 macros (P/C/F/Fb/Chol)
 * as a read-only summary strip so the user can verify the values
 * before commit. Cholesterol uses the `mg` unit; legacy ParsedItem
 * rows without the field default to 0.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmationScreen } from '@/app/(app)/log/_components/ConfirmationScreen';

vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authFetch: vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify({ match: null }), { status: 200 })),
  ),
  authPost: vi.fn(),
  SessionExpiredError: class SE extends Error {},
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe('<ConfirmationScreen /> — Phase 2C cholesterol_mg display', () => {
  it('renders cholesterol value with mg suffix when ParsedItem carries cholesterol_mg', () => {
    const items = [
      {
        name: 'beef liver',
        portion: 100,
        unit: 'g',
        kcal: 135,
        macros: { protein_g: 20, carbs_g: 4, fat_g: 4, fiber_g: 0, cholesterol_mg: 396 },
        micros: {},
        confidence: 0.9,
      },
    ];
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={items}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    const row = screen.getByTestId('confirmation-item-0-macros');
    const chol = within(row).getByTestId('confirmation-item-0-cholesterol_mg');
    expect(chol.textContent ?? '').toMatch(/396/);
    expect(chol.textContent ?? '').toMatch(/mg/);
  });

  it('renders cholesterol as 0 mg when ParsedItem omits cholesterol_mg (legacy)', () => {
    const items = [
      {
        name: 'old item',
        portion: 1,
        unit: 'piece',
        kcal: 100,
        macros: { protein_g: 5, carbs_g: 10, fat_g: 2, fiber_g: 1 },
        micros: {},
        confidence: 0.9,
      },
    ];
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={items}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    const chol = screen.getByTestId('confirmation-item-0-cholesterol_mg');
    expect(chol.textContent ?? '').toMatch(/0/);
    expect(chol.textContent ?? '').toMatch(/mg/);
  });

  // 2026-05-16 layout fix — the post-AI confirmation screen was rendering
  // all 5 macros in a narrow column (parent grid track), so labels like
  // "Chol 396mg" wrapped badly and were unreadable. Fix: the macros strip
  // gets its own full-width row beneath the item's name/portion/kcal/remove
  // row, and the inner items flow horizontally so the line wraps as a
  // natural editorial-newspaper run-on.
  describe('layout — macros strip renders on its own full-width row', () => {
    it('renders the macros <dl> as a SIBLING of the item-inner grid (not nested in a narrow track)', () => {
      const items = [
        {
          name: 'beef liver',
          portion: 100,
          unit: 'g',
          kcal: 135,
          macros: { protein_g: 20, carbs_g: 4, fat_g: 4, fiber_g: 0, cholesterol_mg: 396 },
          micros: {},
          confidence: 0.9,
        },
      ];
      render(
        <ConfirmationScreen
          source="text"
          tab="type"
          items={items}
          reasoning={null}
          dedupMatch={null}
          onClose={vi.fn()}
        />,
      );
      const macros = screen.getByTestId('confirmation-item-0-macros');
      // The strip MUST sit at the <li> level (sibling of `.kalori-confirmation-item-inner`),
      // not embedded inside the inner grid — otherwise it inherits a narrow
      // grid track that wraps the labels.
      expect(macros.parentElement).not.toBeNull();
      expect(macros.parentElement?.classList.contains('kalori-confirmation-item-inner')).toBe(
        false,
      );
      // The parent should be the `<li class="kalori-confirmation-item">` row.
      expect(macros.parentElement?.tagName.toLowerCase()).toBe('li');
      expect(macros.parentElement?.classList.contains('kalori-confirmation-item')).toBe(true);
    });

    it('exposes a CSS class on the macros strip so globals.css can give it horizontal flow', () => {
      const items = [
        {
          name: 'beef liver',
          portion: 100,
          unit: 'g',
          kcal: 135,
          macros: { protein_g: 20, carbs_g: 4, fat_g: 4, fiber_g: 0, cholesterol_mg: 396 },
          micros: {},
          confidence: 0.9,
        },
      ];
      render(
        <ConfirmationScreen
          source="text"
          tab="type"
          items={items}
          reasoning={null}
          dedupMatch={null}
          onClose={vi.fn()}
        />,
      );
      const macros = screen.getByTestId('confirmation-item-0-macros');
      expect(macros.classList.contains('kalori-confirmation-item-macros')).toBe(true);
      // All 5 macro sub-items (Protein, Carbs, Fat, Fiber, Cholesterol) are
      // present as children — the read-only strip is complete.
      const subItems = macros.querySelectorAll('.kalori-confirmation-item-macro');
      expect(subItems.length).toBe(5);
      // Each sub-item carries a <dt>/<dd> pair so the strip is a proper
      // description list (semantic + accessible).
      for (const sub of Array.from(subItems)) {
        expect(sub.querySelector('dt')).not.toBeNull();
        expect(sub.querySelector('dd')).not.toBeNull();
      }
    });

    it('renders all 5 macros with their full label+value text so nothing is clipped', () => {
      const items = [
        {
          name: 'beef liver',
          portion: 100,
          unit: 'g',
          kcal: 135,
          macros: { protein_g: 20, carbs_g: 4, fat_g: 4, fiber_g: 0, cholesterol_mg: 396 },
          micros: {},
          confidence: 0.9,
        },
      ];
      render(
        <ConfirmationScreen
          source="text"
          tab="type"
          items={items}
          reasoning={null}
          dedupMatch={null}
          onClose={vi.fn()}
        />,
      );
      const macros = screen.getByTestId('confirmation-item-0-macros');
      const text = macros.textContent ?? '';
      expect(text).toMatch(/P\s*20\s*g/);
      expect(text).toMatch(/C\s*4\s*g/);
      expect(text).toMatch(/F\s*4\s*g/);
      expect(text).toMatch(/Fb\s*0\s*g/);
      expect(text).toMatch(/Chol\s*396\s*mg/);
    });
  });
});
