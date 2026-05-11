import { t } from '@/lib/i18n/en';

/**
 * Route-group loading boundary for `(app)` (Dashboard / Library / Progress /
 * Settings / Log).
 *
 * Why: the `(app)` layout is `force-dynamic` and every page does 2-3 sequential
 * server awaits, including a cross-region (iad1↔ap-southeast-1) auth round trip.
 * Without this fallback, `<Link>` clicks hold the OLD page until the new RSC
 * fully resolves (400-1500ms perceived freeze). With this file present, App
 * Router paints the skeleton in <50ms while the destination streams in.
 *
 * Pulse animation + reduced-motion guard live in `app/globals.css`
 * (`@keyframes kalori-app-loading-pulse` + `[data-kalori-loading-dot]`).
 */
export default function AppLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t.nav.a11y.pageLoading}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: 'var(--spacing-3)',
      }}
    >
      <span
        aria-hidden="true"
        data-kalori-loading-dot="true"
        style={{
          width: '7px',
          height: '7px',
          backgroundColor: 'var(--color-oxblood)',
          display: 'inline-block',
        }}
      />
      <span
        style={{
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: 'var(--type-body)',
          color: 'var(--color-ivory)',
          letterSpacing: '0.01em',
        }}
      >
        {t.nav.loadingLabel}
      </span>
    </div>
  );
}
