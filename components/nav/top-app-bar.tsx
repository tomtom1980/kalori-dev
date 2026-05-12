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
import { ProfileMenu } from './profile-menu';

export interface TopAppBarProps {
  sectionKicker: string;
  editionLine: string;
  userInitials: string;
}

export function TopAppBar({ sectionKicker, editionLine, userInitials }: TopAppBarProps) {
  return (
    <header
      data-testid="top-app-bar"
      className="kalori-top-app-bar"
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
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--type-label)',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--color-dust)',
        }}
      >
        {sectionKicker}
      </span>
      <span
        aria-hidden="true"
        style={{
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: '11px',
          color: 'var(--color-dust)',
        }}
      >
        {editionLine}
      </span>
      <ProfileMenu userInitials={userInitials} />
    </header>
  );
}

export default TopAppBar;
