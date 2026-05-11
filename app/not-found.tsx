/**
 * Task B.5 (US-STAB-B5) — root canonical 404 page.
 *
 * Renders for any unmatched route OUTSIDE the `(app)` route group. The
 * `(app)/library/[id]/not-found.tsx` segment 404 still wins for that
 * sub-tree (Next App Router precedence rule). This surface is the global
 * fallback when a user lands on a URL that doesn't map to any page.
 *
 * Surface:
 *   - Server Component (no 'use client', no hooks).
 *   - Renders OUTSIDE the nav-shell — carries its own minimal masthead
 *     (wordmark + kicker) so the user is never staring at a context-less
 *     error frame.
 *   - Single recovery CTA `<Link href="/">`. The marketing route's RSC
 *     decides the final destination based on auth state (authed →
 *     /dashboard, anon → marketing landing) — no client-side auth-state
 *     branching here.
 *   - Editorial Ledger styling: ember `404` glyph (5.20:1 vs bg-0 — AA
 *     small-text; oxblood-as-text would fail at 2.28:1 per ui-design.md
 *     §3 line 91), Newsreader italic body copy, Inter UPPERCASE kicker +
 *     ivory CTA bracketed by oxblood hairlines (signature accent kept on
 *     decorative chrome only). Zero-radius, hairline-only, no shadows.
 *     WCAG AAA on body text (16.67:1 ivory-on-bg-0).
 *
 * Test contract:
 *   - `data-testid="canonical-404"` is the binary discriminator that
 *     proves the Kalori component rendered (NOT a Next.js default 404).
 *   - All copy routes through `t.notFound.*` per `no-inline-user-strings`.
 */
import type { Metadata } from 'next';
import Link from 'next/link';

import { t } from '@/lib/i18n/en';

export const metadata: Metadata = {
  title: t.notFound.metaTitle,
  description: t.notFound.metaDesc,
};

export default function NotFound() {
  return (
    <main data-testid="canonical-404" className="kalori-notfound-root" role="main">
      <header className="kalori-notfound-masthead">
        <p className="kalori-notfound-wordmark">{t.brand.wordmark}</p>
        <p className="kalori-notfound-kicker">{t.notFound.kicker}</p>
      </header>
      <section className="kalori-notfound-body">
        <h1 className="kalori-notfound-glyph" aria-label={t.notFound.glyphA11y}>
          {t.notFound.glyph}
        </h1>
        <hr className="kalori-notfound-rule" aria-hidden="true" />
        <p className="kalori-notfound-prose">{t.notFound.body}</p>
        <Link
          href="/"
          className="kalori-notfound-cta focus-editorial"
          data-testid="canonical-404-cta"
        >
          {t.notFound.ctaLabel}
        </Link>
      </section>
    </main>
  );
}
