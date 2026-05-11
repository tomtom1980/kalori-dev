/**
 * `/login` — Magic link + Google OAuth sign-in surface (Task 2.1c).
 *
 * Server Component wrapper: reads the incoming origin + an optional
 * `?error=...` query and hands them to the client <LoginForm />. Keeping the
 * interactive form in a `'use client'` island avoids shipping JS for the
 * static wordmark + tagline.
 *
 * The `(auth)` route group does NOT add a URL segment (Next.js route-group
 * convention) — user-visible URL remains `/login`. The group exists so the
 * sign-in surface sits outside the `(app)/layout.tsx` nav shell, matching
 * the public-marketing pattern established by `(marketing)/page.tsx`.
 *
 * `dynamic = 'force-dynamic'`: the login page reads request headers + search
 * params. Letting Next static-render it at build time would break the
 * `?error=expired` pass-through and could cache the wrong origin.
 */
import { headers } from 'next/headers';

import { t } from '@/lib/i18n/en';

import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

const AUTH_ERROR_CODES = {
  callback: t.auth.errorCallback,
  generic: t.auth.errorGeneric,
} as const;

type AuthErrorCode = keyof typeof AUTH_ERROR_CODES;

function isAuthErrorCode(value: string | undefined): value is AuthErrorCode {
  return value === 'callback' || value === 'generic';
}

async function resolveOrigin(): Promise<string> {
  const hdrs = await headers();
  // Vercel sets `x-forwarded-host` + `x-forwarded-proto`. Fall back to the
  // env var Vercel already populates (`NEXT_PUBLIC_SITE_URL` is not yet
  // wired, but `VERCEL_URL` is available on every Vercel deployment).
  const host = hdrs.get('x-forwarded-host') ?? hdrs.get('host');
  const proto = hdrs.get('x-forwarded-proto') ?? 'http';
  if (host) return `${proto}://${host}`;
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv;
  return 'http://localhost:3000';
}

interface LoginPageProps {
  searchParams?: Promise<{ error?: string | string[]; deleted?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const origin = await resolveOrigin();
  const resolved = (await searchParams) ?? {};
  const rawError = Array.isArray(resolved.error) ? resolved.error[0] : resolved.error;
  const initialError = isAuthErrorCode(rawError) ? AUTH_ERROR_CODES[rawError] : undefined;
  const rawDeleted = Array.isArray(resolved.deleted) ? resolved.deleted[0] : resolved.deleted;
  const showDeletedBanner = rawDeleted === '1';

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        padding: 'var(--page-padding-desktop)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--spacing-6)',
          paddingBottom: 'var(--spacing-8)',
          borderBottom: '1px solid var(--color-rule-strong)',
          marginBottom: 'var(--spacing-16)',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontWeight: 300,
            fontSize: 'var(--type-wordmark-lg)',
            letterSpacing: '-0.035em',
            lineHeight: 0.88,
            margin: 0,
            color: 'var(--color-ivory)',
          }}
        >
          {t.brand.wordmark}
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 'var(--type-body)',
            color: 'var(--color-sand)',
            margin: 0,
            maxWidth: '320px',
            textAlign: 'right',
          }}
        >
          {t.auth.tagline}
        </p>
      </header>

      {showDeletedBanner ? (
        <div
          data-testid="login-deleted-banner"
          role="status"
          aria-live="polite"
          style={{
            marginBottom: 'var(--spacing-8)',
            padding: 'var(--spacing-4) var(--spacing-5)',
            backgroundColor: 'var(--color-bg-1)',
            borderTop: '1px solid var(--color-oxblood)',
            borderBottom: '1px solid var(--color-oxblood)',
            color: 'var(--color-ivory)',
            maxWidth: '420px',
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--type-label)',
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              color: 'var(--color-oxblood-soft)',
            }}
          >
            {t.auth.deletedBanner.title}
          </p>
          <p
            style={{
              margin: 'var(--spacing-2) 0 0',
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: 'var(--type-body)',
              color: 'var(--color-sand)',
            }}
          >
            {t.auth.deletedBanner.body}
          </p>
        </div>
      ) : null}

      <section style={{ flex: 1 }}>
        <LoginForm origin={origin} {...(initialError ? { initialError } : {})} />
      </section>

      <footer
        style={{
          marginTop: 'var(--spacing-16)',
          textAlign: 'center',
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: 'var(--type-mono)',
          color: 'var(--color-sand)',
        }}
      >
        {t.auth.privacyFooter}
      </footer>
    </main>
  );
}
