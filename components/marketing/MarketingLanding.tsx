/**
 * <MarketingLanding /> — Task B.1 (US-STAB-B1) AC2 RSC.
 *
 * Public root `/` landing for anonymous visitors (and visitors whose
 * server-side `getUser()` errored — fail-closed by treating like anon).
 * Authed visitors are redirected to `/dashboard` upstream in
 * `app/(marketing)/page.tsx` and never reach this component.
 *
 * Per PRD §5 lock-out and design fragment §10: minimal Ledger surface —
 * brand wordmark + italic tagline + oxblood SIGN IN CTA + privacy footer.
 * NO hero copy, NO feature grid, NO pricing, NO images, NO client JS.
 *
 * `deleted` prop drives an optional account-deletion confirmation banner
 * above the wordmark when the visitor returns from `AccountDeleteFlow` via
 * `/?deleted=1`. Banner uses `role="status"` for polite SR announcement.
 *
 * Tokens: every color / type / spacing value comes from `app/globals.css`.
 * Style mirror reference (NOT import): `components/dashboard/Masthead.tsx`.
 *
 * Hover: `:hover` on `<a>` cannot be expressed via inline style, so a
 * single scoped utility class `kalori-marketing-cta` lives in `globals.css`
 * (mirrors `kalori-wizard-cta` convention).
 */
import { t } from '@/lib/i18n/en';

export interface MarketingLandingProps {
  /**
   * True when `?deleted=1` is present on the request URL. Renders the
   * account-deletion confirmation banner above the wordmark.
   */
  deleted?: boolean;
}

export function MarketingLanding({ deleted = false }: MarketingLandingProps = {}) {
  return (
    <main
      data-testid="landing-root"
      role="main"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        paddingInline: 'var(--page-padding-mobile)',
        paddingBlockStart: 'var(--spacing-6)',
        paddingBlockEnd: 'var(--spacing-6)',
      }}
    >
      {deleted ? (
        <div
          data-testid="landing-deleted-banner"
          role="status"
          aria-live="polite"
          style={{
            padding: 'var(--spacing-3) var(--spacing-4)',
            backgroundColor: 'var(--color-bg-1)',
            border: '1px solid var(--color-rule)',
            color: 'var(--color-ivory)',
            marginBlockEnd: 'var(--spacing-6)',
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--type-label)',
              fontWeight: 500,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--color-ivory)',
            }}
          >
            {t.auth.deletedBanner.title}
          </p>
          <p
            style={{
              margin: 'var(--spacing-2) 0 0',
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: 'var(--type-body-sm)',
              color: 'var(--color-sand)',
            }}
          >
            {t.auth.deletedBanner.body}
          </p>
        </div>
      ) : null}

      <section
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--spacing-6)',
          textAlign: 'center',
        }}
      >
        <h1
          data-testid="landing-wordmark"
          style={{
            fontFamily: 'var(--font-serif)',
            fontWeight: 300,
            fontSize: 'clamp(48px, 9vw, 72px)',
            lineHeight: 1,
            letterSpacing: '-0.02em',
            color: 'var(--color-ivory)',
            margin: 0,
          }}
        >
          {t.brand.wordmark}
        </h1>

        <hr
          aria-hidden="true"
          style={{
            width: '80px',
            margin: 0,
            border: 'none',
            borderTop: '1px solid var(--color-rule)',
          }}
        />

        <p
          data-testid="landing-tagline"
          style={{
            margin: 0,
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 'var(--type-body-sm)',
            color: 'var(--color-sand)',
            maxWidth: '36ch',
          }}
        >
          {t.masthead.tagline}
        </p>

        <a
          data-testid="landing-signin-cta"
          href="/login"
          className="kalori-marketing-cta"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '220px',
            minHeight: '56px',
            paddingInline: 'var(--spacing-6)',
            backgroundColor: 'var(--color-oxblood)',
            color: 'var(--color-ivory)',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--type-button)',
            fontWeight: 500,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            textDecoration: 'none',
            border: '1px solid var(--color-oxblood)',
            marginBlockStart: 'var(--spacing-2)',
          }}
        >
          {t.auth.title}
        </a>
      </section>

      <footer
        style={{
          paddingBlockStart: 'var(--spacing-6)',
          marginBlockStart: 'var(--spacing-12)',
          borderTop: '1px solid var(--color-rule)',
          textAlign: 'center',
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--type-label)',
          fontWeight: 500,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--color-dust)',
        }}
      >
        {t.auth.privacyFooter}
      </footer>
    </main>
  );
}

export default MarketingLanding;
