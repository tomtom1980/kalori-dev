import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryCreateRecipeDialog } from '@/app/(app)/library/_components/LibraryCreateRecipeDialog';
import type { LibraryItem } from '@/lib/library/fetch';

const authPostMock = vi.fn();
vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authPost: (...args: unknown[]) => authPostMock(...args),
  SessionExpiredError: class SE extends Error {},
}));

function item(id = 'alpha', name = 'Pho Bo'): LibraryItem {
  return {
    id,
    client_id: `client-${id}`,
    display_name: name,
    normalized_name: name.toLowerCase(),
    default_portion: 1,
    default_unit: 'bowl',
    nutrition: { kcal: 420, macros: { protein_g: 24, carbs_g: 52, fat_g: 12 } },
    thumbnail_url: null,
    log_count: 1,
    last_used_at: null,
    user_edited_flag: false,
    created_from: 'text',
    created_at: '2026-01-01T00:00:00Z',
    recipe_eligibility: 'eligible',
  };
}

const recipe = {
  title: 'Pho Bo at Home',
  servings: 2,
  total_time_minutes: 45,
  ingredients: ['Rice noodles', 'Beef broth', 'Thin sliced beef'],
  steps: ['Warm the broth.', 'Cook noodles.', 'Assemble the bowls.'],
  nutrition_note: 'Nutrition is estimated from the saved library item.',
  confidence: 0.82,
};

describe('<LibraryCreateRecipeDialog />', () => {
  beforeEach(() => {
    authPostMock.mockReset();
  });

  it('opens immediately in a loading state and posts the item recipe request', async () => {
    authPostMock.mockImplementationOnce(() => new Promise(() => {}));

    render(<LibraryCreateRecipeDialog open item={item()} onOpenChange={vi.fn()} />);

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('library-create-recipe-spinner')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Reading the saved item and drafting a practical method.',
    );
    await waitFor(() => expect(authPostMock).toHaveBeenCalledTimes(1));
    expect(authPostMock.mock.calls[0]?.[0]).toBe('/api/library/alpha/recipe');
    expect(authPostMock.mock.calls[0]?.[1]).toMatchObject({ client_id: expect.any(String) });
  });

  it('renders recipe title, metadata, ingredients, steps, and note after success', async () => {
    authPostMock.mockResolvedValueOnce({ recipe, source: 'generated', persisted: true });

    render(<LibraryCreateRecipeDialog open item={item()} onOpenChange={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Pho Bo at Home' })).toBeInTheDocument();
    expect(screen.getByText('2 servings')).toBeInTheDocument();
    expect(screen.getByText('45 min')).toBeInTheDocument();
    expect(
      screen.queryByText('Nutrition is estimated from the saved library item.'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Rice noodles')).toBeInTheDocument();
    expect(screen.getByText('Warm the broth.')).toBeInTheDocument();
  });

  it('keeps the dialog open on failure and retries on request', async () => {
    authPostMock.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({
      recipe,
      source: 'cache',
      persisted: true,
    });
    const user = userEvent.setup();

    render(<LibraryCreateRecipeDialog open item={item()} onOpenChange={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not create the recipe');
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { name: 'Pho Bo at Home' })).toBeInTheDocument();
    expect(authPostMock).toHaveBeenCalledTimes(2);
  });

  it('ignores stale completion after switching items', async () => {
    let resolveAlpha!: (value: unknown) => void;
    authPostMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveAlpha = resolve;
          }),
      )
      .mockResolvedValueOnce({
        recipe: { ...recipe, title: 'Banh Mi Method', ingredients: ['Baguette'], steps: ['Fill.'] },
        source: 'generated',
        persisted: true,
      });

    const { rerender } = render(
      <LibraryCreateRecipeDialog open item={item('alpha', 'Pho Bo')} onOpenChange={vi.fn()} />,
    );
    await waitFor(() => expect(authPostMock).toHaveBeenCalledTimes(1));

    rerender(
      <LibraryCreateRecipeDialog open item={item('beta', 'Banh Mi')} onOpenChange={vi.fn()} />,
    );

    expect(await screen.findByRole('heading', { name: 'Banh Mi Method' })).toBeInTheDocument();

    resolveAlpha({
      recipe: { ...recipe, title: 'Stale Pho' },
      source: 'generated',
      persisted: true,
    });

    await waitFor(() => expect(screen.queryByText('Stale Pho')).not.toBeInTheDocument());
  });

  it('does not send a queued recipe request after closing immediately', async () => {
    const { rerender } = render(
      <LibraryCreateRecipeDialog open item={item('alpha', 'Pho Bo')} onOpenChange={vi.fn()} />,
    );

    rerender(
      <LibraryCreateRecipeDialog
        open={false}
        item={item('alpha', 'Pho Bo')}
        onOpenChange={vi.fn()}
      />,
    );

    await Promise.resolve();

    expect(authPostMock).not.toHaveBeenCalled();
  });
});
