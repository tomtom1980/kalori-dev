/**
 * <FoodDetail /> mode=edit query-param test — bugfix-tomi
 * 2026-05-16-library-overhaul Bug 3.
 *
 * When a card's kebab menu Edit action navigates to /library/[id]?mode=edit,
 * FoodDetail must:
 *   1. auto-enter edit mode on first render (calls `edit.enter` internally),
 *   2. `router.replace('/library/[id]')` to strip the query param so reload
 *      / back-navigation doesn't re-trigger.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FoodDetail } from '@/app/(app)/library/_components/FoodDetail/FoodDetail';
import type { LibraryItem } from '@/lib/library/fetch';

vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authPost: vi.fn(),
  SessionExpiredError: class SE extends Error {},
}));

const replaceMock = vi.fn();
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: pushMock,
    refresh: vi.fn(),
  }),
}));

function mk(): LibraryItem {
  return {
    id: 'alpha',
    client_id: 'client-alpha',
    display_name: 'Pho Bo',
    normalized_name: 'pho bo',
    default_portion: 1,
    default_unit: 'bowl',
    nutrition: {
      kcal: 450,
      macros: { protein_g: 25, carbs_g: 60, fat_g: 12, fiber_g: 4 },
    },
    thumbnail_url: null,
    log_count: 3,
    last_used_at: null,
    user_edited_flag: false,
    created_from: 'text',
    created_at: '2026-01-01T00:00:00Z',
  };
}

describe('<FoodDetail /> mode=edit searchParam (Bug 3)', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    pushMock.mockReset();
  });

  it('auto-enters edit mode when initialMode="edit"', async () => {
    render(
      <FoodDetail
        item={mk()}
        history={{ firstLoggedAt: null, totalLogCount: 0, recent: [] }}
        initialMode="edit"
      />,
    );
    // In edit mode the Cancel button (FoodDetailActions) is present.
    await waitFor(() => {
      expect(screen.getByTestId('food-detail-cancel-button')).toBeInTheDocument();
    });
  });

  it('displays approximate grams in view mode when saved on the library item', () => {
    render(
      <FoodDetail
        item={{
          ...mk(),
          default_portion: 1,
          default_unit: 'bowl',
          nutrition: { ...mk().nutrition, approxGrams: 420 },
        }}
        history={{ firstLoggedAt: null, totalLogCount: 0, recent: [] }}
      />,
    );

    expect(screen.getByText(/approx\. 420 g/i)).toBeInTheDocument();
  });

  it('renders unit as a dropdown in edit mode', async () => {
    render(
      <FoodDetail
        item={mk()}
        history={{ firstLoggedAt: null, totalLogCount: 0, recent: [] }}
        initialMode="edit"
      />,
    );
    const unit = await screen.findByTestId('food-detail-edit-unit-input');
    expect(unit.tagName).toBe('SELECT');
    const options = within(unit)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options).toContain('g');
    expect(options).toContain('medium');
    expect(options).toContain('large');
    expect(options).not.toContain('egg');
    expect(options).not.toContain('small egg');
    expect(options).not.toContain('medium egg');
    expect(options).not.toContain('large egg');
  });

  it('preserves a legacy saved egg-specific unit as the selected value only', async () => {
    render(
      <FoodDetail
        item={{ ...mk(), default_unit: 'large egg' }}
        history={{ firstLoggedAt: null, totalLogCount: 0, recent: [] }}
        initialMode="edit"
      />,
    );
    const unit = await screen.findByTestId('food-detail-edit-unit-input');
    expect(unit).toHaveValue('large egg');
    const legacyOption = within(unit).getByRole('option', { name: 'large egg' });
    expect(legacyOption).toBeDisabled();
    const options = within(unit)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options.filter((option) => option === 'large egg')).toHaveLength(1);
    expect(options).toContain('large');
  });

  it('calls router.replace to strip ?mode=edit when initialMode="edit"', async () => {
    render(
      <FoodDetail
        item={mk()}
        history={{ firstLoggedAt: null, totalLogCount: 0, recent: [] }}
        initialMode="edit"
      />,
    );
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/library/alpha');
    });
  });

  it('does NOT auto-enter edit when initialMode is undefined / "view"', () => {
    render(
      <FoodDetail item={mk()} history={{ firstLoggedAt: null, totalLogCount: 0, recent: [] }} />,
    );
    // Cancel button is only present in edit mode.
    expect(screen.queryByTestId('food-detail-cancel-button')).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
