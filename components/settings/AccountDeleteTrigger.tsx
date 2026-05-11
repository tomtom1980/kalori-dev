'use client';

/**
 * <AccountDeleteTrigger /> — Task 5.2 Phase 2B (synthesis §2.3 + §2.1).
 *
 * Settings § 05 § DANGER zone trigger. The actual modal subtree
 * (`AccountDeleteFlow`) is dynamically imported on first click so the
 * Settings page initial render stays bundle-thin (synthesis §2.1
 * "lazy via next/dynamic({ ssr: false })").
 *
 * Visual: text link, NOT a button (synthesis §2.1 "the `Delete account →`
 * link"). 44px hit area via padding (touch target). Color escalated from
 * oxblood-soft (2.84:1 fail) to ember (4.98:1 ✓) per Risk #4 / §1a.
 */

import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';

import { t } from '@/lib/i18n/en';

const AccountDeleteFlow = dynamic(
  () => import('./AccountDeleteFlow').then((m) => m.AccountDeleteFlow),
  { ssr: false, loading: () => null },
);

export interface AccountDeleteTriggerProps {
  userEmail: string;
}

export function AccountDeleteTrigger({ userEmail }: AccountDeleteTriggerProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  // Phase 3 a11y fix C1 — Radix Dialog cannot return focus to the trigger
  // because the dialog is opened via lazy-mount (`initialOpen`), not via
  // `<Dialog.Trigger>`. We pass this ref through to AccountDeleteFlow so
  // it can restore focus on close (WCAG 2.4.3 Focus Order).
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="account-delete-trigger"
        aria-label={t.settings.account.deleteAriaLabel}
        onClick={() => setOpen(true)}
        style={{
          appearance: 'none',
          background: 'transparent',
          border: 'none',
          padding: 'var(--spacing-3) 0',
          minHeight: '44px',
          display: 'inline-flex',
          alignItems: 'center',
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: '16px',
          color: 'var(--color-ember)', // Synthesis §1a — ember (4.98:1) NOT oxblood-soft.
          textDecoration: 'underline',
          textDecorationColor: 'var(--color-oxblood-soft)',
          textDecorationThickness: '1px',
          textUnderlineOffset: '4px',
          cursor: 'pointer',
        }}
      >
        {t.settings.account.deleteLink}
      </button>
      {open ? (
        <AccountDeleteFlow
          userEmail={userEmail}
          initialOpen
          triggerRef={triggerRef}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export default AccountDeleteTrigger;
