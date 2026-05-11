'use client';

/**
 * <ShortcutsOverlay /> — `?` key opens a 560px centred modal listing keyboard
 * shortcuts. Task 1.2 ships stub content ("Shortcuts coming soon") — the real
 * shortcut list lands with the respective feature tasks.
 *
 * Contract (briefing):
 *   - Listens for `?` keypress (no modifiers) to open
 *   - Escape closes
 *   - role="dialog" aria-modal="true" aria-labelledby
 *   - bg-1 surface, 1px rule-strong frame, zero radius
 */
import { useEffect, useState } from 'react';

import { t } from '@/lib/i18n/en';

export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const target = event.target as HTMLElement | null;
        if (target && /input|textarea|select/i.test(target.tagName)) return;
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-overlay-heading"
      data-testid="shortcuts-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        zIndex: 60,
      }}
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '560px',
          maxWidth: '90vw',
          backgroundColor: 'var(--color-bg-1)',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'var(--color-rule-strong)',
          padding: 'var(--spacing-8)',
          color: 'var(--color-ivory)',
        }}
      >
        <h2
          id="shortcuts-overlay-heading"
          style={{
            fontFamily: 'var(--font-serif)',
            fontWeight: 300,
            fontSize: 'var(--type-section-sm)',
            letterSpacing: '-0.02em',
            margin: 0,
            marginBottom: 'var(--spacing-4)',
          }}
        >
          {t.shortcutsOverlay.heading}
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--type-body-sm)',
            color: 'var(--color-sand)',
            margin: 0,
          }}
        >
          {t.shortcutsOverlay.stubBody}
        </p>
      </div>
    </div>
  );
}

export default ShortcutsOverlay;
