'use client';

/**
 * <ProfileMenu /> — Shown in top-app-bar + sidebar bottom.
 *
 * Contract (briefing + ui-design.md §6 + Codex Round 1 F4):
 *   - Trigger is a 32×32 oxblood square with the user's monogram (Newsreader ivory)
 *   - Clicking toggles a dropdown: Settings / Export / Sign out
 *   - Keyboard: Escape closes the menu (F4 — was advertised but unimplemented)
 *   - Pointer: clicking outside the menu closes it (standard dropdown parity)
 *   - Focus trap is optional for Task 1.2; a proper focus trap + initial-focus
 *     sequence lands with Task 2.1's auth wiring.
 *
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { t } from '@/lib/i18n/en';

import { SignOutButton } from './sign-out-button';

export interface ProfileMenuProps {
  userInitials: string;
}

export function ProfileMenu({ userInitials }: ProfileMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Root ref scopes the outside-click heuristic: any pointerdown OUTSIDE
  // this subtree closes the menu, anything inside is a no-op.
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
    }

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current && rootRef.current.contains(target)) return;
      setOpen(false);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.user.menuA11y}
        data-testid="profile-menu-trigger"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '32px',
          height: '32px',
          minWidth: '44px',
          minHeight: '44px',
          backgroundColor: 'var(--color-oxblood)',
          color: 'var(--color-ivory)',
          borderWidth: '0',
          borderStyle: 'none',
          fontFamily: 'var(--font-serif)',
          fontSize: '14px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          cursor: 'pointer',
        }}
      >
        {userInitials}
      </button>
      {open ? (
        <ul
          role="menu"
          aria-label={t.user.menuActionsA11y}
          style={{
            position: 'absolute',
            top: 'calc(100% + var(--spacing-2))',
            right: 0,
            minWidth: '180px',
            backgroundColor: 'var(--color-bg-1)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'var(--color-rule-strong)',
            listStyle: 'none',
            padding: 0,
            margin: 0,
            zIndex: 50,
          }}
        >
          <MenuItem
            label={t.user.menuSettings}
            onSelect={() => {
              setOpen(false);
              router.push('/settings');
            }}
          />
          <MenuItem
            label={t.user.menuExport}
            onSelect={() => {
              setOpen(false);
              router.push('/settings#data-export');
            }}
          />
          <li role="none">
            <SignOutButton variant="menuitem" />
          </li>
        </ul>
      ) : null}
    </div>
  );
}

function MenuItem({ label, onSelect }: { label: string; onSelect: () => void }) {
  return (
    <li role="none">
      <button
        type="button"
        role="menuitem"
        onClick={onSelect}
        style={{
          width: '100%',
          textAlign: 'left',
          minHeight: '44px',
          padding: 'var(--spacing-3) var(--spacing-4)',
          background: 'transparent',
          borderWidth: '0',
          borderStyle: 'none',
          color: 'var(--color-sand)',
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--type-label)',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        {label}
      </button>
    </li>
  );
}

export default ProfileMenu;
