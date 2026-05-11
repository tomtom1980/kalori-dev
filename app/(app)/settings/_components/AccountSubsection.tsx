/**
 * § 05 · ACCOUNT — Task 5.2 Phase 2B (synthesis §2.3).
 *
 * RSC. Renders static markup + the <AccountDeleteTrigger /> client
 * island. The danger zone is separated from the credentials block by a
 * 32px gap and a 1px rule-strong top border per synthesis §2.3.
 */
import { t } from '@/lib/i18n/en';

import { AccountDeleteTrigger } from '@/components/settings/AccountDeleteTrigger';

export interface AccountSubsectionProps {
  userEmail: string;
}

export function AccountSubsection({ userEmail }: AccountSubsectionProps): React.ReactElement {
  return (
    <section
      data-testid="settings-account-section"
      style={{
        marginTop: 'var(--spacing-8)',
        paddingTop: 'var(--spacing-6)',
        borderTop: '1px solid var(--color-rule-strong)',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '10.5px',
          fontWeight: 500,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--color-dust)',
          margin: 0,
          marginBottom: 'var(--spacing-2)',
        }}
      >
        {t.settings.account.kicker}
      </p>
      <h2
        style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 300,
          fontSize: 'var(--type-section-md)',
          color: 'var(--color-ivory)',
          margin: 0,
          marginBottom: 'var(--spacing-3)',
        }}
      >
        {t.settings.account.title}
      </h2>
      <p
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '16px',
          color: 'var(--color-ivory)',
          margin: 0,
          marginBottom: 'var(--spacing-2)',
        }}
      >
        {userEmail}
      </p>
      {/* Danger zone */}
      <div
        style={{
          marginTop: '32px',
          paddingTop: 'var(--spacing-4)',
          borderTop: '1px solid var(--color-rule-strong)',
        }}
      >
        {/*
          § DANGER kicker — synthesis §2.3 specs oxblood-soft, but
          oxblood-soft on bg-0 computes 2.83:1 (axe-core measured), below
          AA 4.5:1. Synthesis §1a missed the kicker in its escalation
          table; the parallel ux-auditor advisory ("danger semantic must
          be visible to all users") and the briefing's "ZERO serious
          axe violations" mandate both push toward escalating. We escalate
          to the dust token (#8a8173 → 5.18:1 on bg-0), matching the
          existing kicker color convention used in masthead/nav/sidebar.
          The "DANGER" semantic is preserved by the danger-zone subtitle
          below + the ember-colored Delete account → link.
        */}
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '10.5px',
            fontWeight: 500,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--color-dust)',
            margin: 0,
            marginBottom: 'var(--spacing-2)',
          }}
        >
          {t.settings.account.dangerKicker}
        </p>
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: '13px',
            color: 'var(--color-sand)',
            margin: 0,
            marginBottom: 'var(--spacing-2)',
          }}
        >
          {t.settings.account.dangerSubtitle}
        </p>
        <AccountDeleteTrigger userEmail={userEmail} />
      </div>
    </section>
  );
}

export default AccountSubsection;
