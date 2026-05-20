/**
 * <LibraryCardActionMenu /> component test — bugfix-tomi 2026-05-16-library-overhaul Bug 3.
 *
 * Verifies the per-card quick-action menu (kebab trigger + Edit/Delete items)
 * mounted on top-right of LibraryCard. Tests cover render, dispatch,
 * stopPropagation contract with the parent card's click handler, and a11y.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LibraryCardActionMenu } from '@/app/(app)/library/_components/LibraryCardActionMenu';

describe('<LibraryCardActionMenu />', () => {
  it('renders trigger with aria-label populated from displayName', () => {
    render(
      <LibraryCardActionMenu
        itemId="a"
        displayName="Banh Mi"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onQuickLog={vi.fn()}
      />,
    );
    const trigger = screen.getByTestId('library-card-menu-trigger-a');
    expect(trigger).toHaveAttribute('aria-label', 'Actions for Banh Mi');
  });

  it('opens menu on click and reveals Edit + Delete items', async () => {
    const user = userEvent.setup();
    render(
      <LibraryCardActionMenu
        itemId="a"
        displayName="Banh Mi"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onQuickLog={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('library-card-menu-trigger-a'));
    expect(await screen.findByTestId('library-card-menu-edit-a')).toBeInTheDocument();
    expect(screen.getByTestId('library-card-menu-delete-a')).toBeInTheDocument();
  });

  it('shows Create recipe between Quick log and Edit when provided', async () => {
    const user = userEvent.setup();
    render(
      <LibraryCardActionMenu
        itemId="a"
        displayName="Banh Mi"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onQuickLog={vi.fn()}
        onCreateRecipe={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('library-card-menu-trigger-a'));

    const menuItems = await screen.findAllByRole('menuitem');
    expect(menuItems.map((node) => node.textContent)).toEqual([
      'Quick log',
      'Create recipe',
      'Edit',
      'Delete',
    ]);
  });

  it('omits Create recipe when no create handler is provided', async () => {
    const user = userEvent.setup();
    render(
      <LibraryCardActionMenu
        itemId="a"
        displayName="Banh Mi"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onQuickLog={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('library-card-menu-trigger-a'));

    expect(screen.queryByTestId('library-card-menu-create-recipe-a')).not.toBeInTheDocument();
  });

  it('Create recipe click calls onCreateRecipe exactly once', async () => {
    const onCreateRecipe = vi.fn();
    const user = userEvent.setup();
    render(
      <LibraryCardActionMenu
        itemId="a"
        displayName="Banh Mi"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onQuickLog={vi.fn()}
        onCreateRecipe={onCreateRecipe}
      />,
    );

    await user.click(screen.getByTestId('library-card-menu-trigger-a'));
    await user.click(await screen.findByTestId('library-card-menu-create-recipe-a'));

    expect(onCreateRecipe).toHaveBeenCalledTimes(1);
  });

  it('Edit click calls onEdit exactly once', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(
      <LibraryCardActionMenu
        itemId="a"
        displayName="Banh Mi"
        onEdit={onEdit}
        onDelete={vi.fn()}
        onQuickLog={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('library-card-menu-trigger-a'));
    await user.click(await screen.findByTestId('library-card-menu-edit-a'));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('Delete click calls onDelete exactly once', async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(
      <LibraryCardActionMenu
        itemId="a"
        displayName="Banh Mi"
        onEdit={vi.fn()}
        onDelete={onDelete}
        onQuickLog={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('library-card-menu-trigger-a'));
    await user.click(await screen.findByTestId('library-card-menu-delete-a'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('clicking the trigger does NOT bubble to a parent click handler (stopPropagation)', async () => {
    const parentClick = vi.fn();
    const user = userEvent.setup();
    render(
      <div onClick={parentClick} data-testid="parent">
        <LibraryCardActionMenu
          itemId="a"
          displayName="Banh Mi"
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onQuickLog={vi.fn()}
        />
      </div>,
    );
    await user.click(screen.getByTestId('library-card-menu-trigger-a'));
    expect(parentClick).not.toHaveBeenCalled();
  });
});
