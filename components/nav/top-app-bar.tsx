/**
 * <TopAppBar /> — Mobile + Tablet 44px masthead strip (RSC).
 *
 * Contract (briefing + ui-design.md §6.1 + §6.3):
 *   - 44px tall
 *   - Section kicker on the left (Inter 10.5px 0.18em UPPERCASE, dust)
 *   - Edition line in the centre (Newsreader small caps italic — stub today)
 *   - Profile avatar on the right (tap opens settings sheet — stub today)
 *
 * Positioning + visibility (shown below md, hidden on xl+) happens at the
 * layout level via Tailwind responsive utilities, not in this component.
 */
import { t } from '@/lib/i18n/en';

import { ProfileMenu } from './profile-menu';

export interface TopAppBarProps {
  sectionKicker: string;
  editionLine: string;
  userInitials: string;
}

export function TopAppBar({ userInitials }: TopAppBarProps) {
  return (
    <header
      data-testid="top-app-bar"
      style={{
        height: '44px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingInline: 'var(--spacing-4)',
        backgroundColor: 'var(--color-bg-1)',
        borderBottomWidth: '1px',
        borderBottomStyle: 'solid',
        borderBottomColor: 'var(--color-rule)',
      }}
    >
      <div
        data-testid="top-app-bar-brand"
        aria-label={t.brand.name}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '22px',
            fontWeight: 300,
            letterSpacing: '-0.02em',
            color: 'var(--color-ivory)',
          }}
        >
          {t.brand.name}
        </span>
        <span
          aria-hidden="true"
          style={{
            width: 7,
            height: 7,
            flex: '0 0 auto',
            backgroundColor: 'var(--color-oxblood)',
          }}
        />
      </div>
      <ProfileMenu userInitials={userInitials} />
    </header>
  );
}

export default TopAppBar;
