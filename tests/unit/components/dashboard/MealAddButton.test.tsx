/**
 * Add Food tab merge — MealAddButton dashboard FAB now opens the log modal
 * with activeTab='library' (Add Food default subview) instead of the
 * previous 'type'. The internal LogTab union stays 3-valued; only the
 * default entry surface changed (per plan §13 deviation note).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { MealAddButton } from '@/components/dashboard/MealEntryContextTrigger';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

const globalsCss = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');

beforeEach(() => {
  useLogFlowStore.setState({ activeTab: 'snap', isOpen: false });
});

describe('<MealAddButton />', () => {
  it('opens the log modal with activeTab = library (Add Food default)', () => {
    render(<MealAddButton category="breakfast" timezone="Asia/Saigon" viewedDay="2026-05-17" />);
    fireEvent.click(screen.getByTestId('meal-add-breakfast'));
    const state = useLogFlowStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.activeTab).toBe('library');
    expect(state.pendingMealCategory).toBe('breakfast');
  });

  it('uses the scoped oxblood CTA class hook', () => {
    render(<MealAddButton category="breakfast" />);
    expect(screen.getByTestId('meal-add-breakfast').className).toContain('kalori-meal-add-button');
  });

  it('anchors itself to the bottom of stretched meal columns', () => {
    render(<MealAddButton category="breakfast" />);
    expect(screen.getByTestId('meal-add-breakfast')).toHaveStyle({ marginTop: 'auto' });
  });

  it('defines a restrained muted-red CTA contract without the old bright glow', () => {
    expect(globalsCss).toContain('.kalori-meal-add-button');
    expect(globalsCss).toContain('color-mix(in srgb, var(--color-oxblood) 72%, var(--color-bg-1))');
    expect(globalsCss).toContain('.kalori-meal-add-button:hover');
    expect(globalsCss).toContain(
      'color-mix(in srgb, var(--color-oxblood-soft) 52%, var(--color-bg-1))',
    );
    expect(globalsCss).not.toContain('0 0 18px');
    expect(globalsCss).toContain('0 4px 0');
  });
});
