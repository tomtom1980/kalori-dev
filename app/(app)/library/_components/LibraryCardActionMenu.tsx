'use client';

/**
 * `<LibraryCardActionMenu />` — Bug 3 (library overhaul 2026-05-16).
 *
 * Kebab quick-action menu mounted in the top-right corner of every
 * LibraryCard. Built on Radix `DropdownMenu` (pattern precedent:
 * `FilterDropdown.tsx`). Menu items: Edit + Delete (no Log Now — keeps
 * scope tight per Bug 3 approval gate).
 *
 * `stopPropagation` on the trigger's `onClick` + `onPointerDown` so menu
 * open does NOT bubble to the parent card's activation handler. The
 * card root has been refactored from `<button>` to `<div role="button">`
 * (LibraryCard.tsx) to legally host this nested interactive element —
 * native `<button>` inside `<button>` is invalid HTML and an a11y
 * nested-interactive violation.
 *
 * Hidden in selectMode via `display: none` (handled at the LibraryCard
 * level, not here) — the trigger is not rendered when `selectMode=true`.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreVertical } from 'lucide-react';

import { t } from '@/lib/i18n/en';

export interface LibraryCardActionMenuProps {
  itemId: string;
  displayName: string;
  onEdit: () => void;
  onDelete: () => void;
  onQuickLog: () => void;
  onCreateRecipe?: (() => void) | undefined;
}

export function LibraryCardActionMenu({
  itemId,
  displayName,
  onEdit,
  onDelete,
  onQuickLog,
  onCreateRecipe,
}: LibraryCardActionMenuProps) {
  const triggerLabel = t.library.cardMenuAriaLabel.replace('{name}', displayName);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="kalori-library-card-menu-trigger"
          data-testid={`library-card-menu-trigger-${itemId}`}
          aria-label={triggerLabel}
          // Opt out of the sitewide 3D hover-lift — the trigger already has
          // its own dark-scrim hover treatment, and a compounding lift on
          // an absolutely-positioned button inside a filter context flickers
          // the underlying thumbnail on click.
          data-no-hover-lift="true"
          // Stop the card root's `onClick` from firing when the user
          // opens the menu. `onPointerDown` is the earlier event Radix
          // uses to open the menu; stop there too so any future
          // pointer-down-based parent handler is also shielded.
          onPointerDown={(ev) => {
            ev.stopPropagation();
          }}
          onClick={(ev) => {
            ev.stopPropagation();
          }}
          onKeyDown={(ev) => {
            // Block Space/Enter from bubbling to the card root keyboard
            // activate handler — Radix opens the menu via its own
            // listener, so we just stop propagation here.
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.stopPropagation();
            }
          }}
        >
          <MoreVertical size={16} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="kalori-library-card-menu-content"
          sideOffset={4}
          align="end"
          data-testid={`library-card-menu-${itemId}`}
          // Stop the eventual menu-item click from bubbling to the
          // (now hidden) trigger / card root. Radix already calls
          // event.preventDefault() on outside clicks; this guards the
          // inside-click bubbling path.
          onClick={(ev) => ev.stopPropagation()}
        >
          <DropdownMenu.Item
            className="kalori-library-card-menu-item"
            data-testid={`library-card-menu-quicklog-${itemId}`}
            onSelect={() => {
              onQuickLog();
            }}
          >
            {t.library.cardMenuQuickLog}
          </DropdownMenu.Item>
          {onCreateRecipe ? (
            <DropdownMenu.Item
              className="kalori-library-card-menu-item"
              data-testid={`library-card-menu-create-recipe-${itemId}`}
              onSelect={() => {
                onCreateRecipe();
              }}
            >
              {t.library.cardMenuCreateRecipe}
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Item
            className="kalori-library-card-menu-item"
            data-testid={`library-card-menu-edit-${itemId}`}
            onSelect={() => {
              onEdit();
            }}
          >
            {t.library.cardMenuEdit}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="kalori-library-card-menu-item kalori-library-card-menu-item--destructive"
            data-testid={`library-card-menu-delete-${itemId}`}
            onSelect={() => {
              onDelete();
            }}
          >
            {t.library.cardMenuDelete}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export default LibraryCardActionMenu;
