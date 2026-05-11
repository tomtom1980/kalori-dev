'use client';

/**
 * <LoginForm /> — Client Component that renders the magic-link form + Google
 * OAuth button for `/login` (Task 2.1c).
 *
 * Split out from `page.tsx` so the page itself stays a Server Component
 * (reads origin + error from searchParams) while only this island ships JS.
 *
 * Ledger styling (ui-design.md §2 + §7.8.2):
 *   - Zero-radius inputs + buttons
 *   - 56px button height, oxblood primary fill
 *   - bg-2 Google secondary, rule-strong border
 *   - Ivory focus ring inherited from globals.css
 *   - Inline styles (consistent with the existing nav components — see
 *     `components/nav/log-fab.tsx`) — no Tailwind utility classes yet,
 *     because Task 1.2 components also opted for inline styles for
 *     snapshot-deterministic output.
 *
 * Error + success states:
 *   - Empty email: blocks submit, surfaces `errorEmailRequired`
 *   - Invalid email: HTML5 `type=email` catches malformed addresses; if a
 *     value sneaks past we surface `errorEmailInvalid`
 *   - Supabase error: surfaces `errorGeneric` (we deliberately do NOT echo
 *     Supabase's raw `error.message` because it may contain the user's
 *     email — Sentry PII scrubber already redacts, but the UI shouldn't
 *     render it either)
 *   - Success: swaps the form for `magicLinkSent` copy
 */
import { useState, type FormEvent } from 'react';

import { t } from '@/lib/i18n/en';
import { getBrowserSupabase } from '@/lib/supabase/client';

// Minimal RFC 5322-ish email validator. We lean on HTML5 `type=email` for the
// primary gate; this regex is the belt-and-braces check so programmatic submit
// (which bypasses HTML5 validation) still refuses garbage.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface LoginFormProps {
  /** Absolute origin (e.g. `https://kalori-one.vercel.app`) used to build
   * OAuth `redirectTo` URLs. Passed from the server component so client + SSR
   * agree on the origin instead of relying on `window.location.origin` at
   * render time (which happy-dom doesn't supply during tests). */
  origin: string;
  /** Optional pre-seeded error — e.g. user arrived via the auth callback with
   * `?error=expired` — so the page can surface context on first render. */
  initialError?: string;
}

export function LoginForm({ origin, initialError }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [sent, setSent] = useState(false);

  async function handleMagicLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimmed = email.trim();
    if (trimmed.length === 0) {
      setError(t.auth.errorEmailRequired);
      return;
    }
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError(t.auth.errorEmailInvalid);
      return;
    }

    setBusy(true);
    try {
      const supabase = getBrowserSupabase();
      const { error: supabaseError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: `${origin}/auth/callback` },
      });
      if (supabaseError) {
        setError(t.auth.errorGeneric);
        return;
      }
      setSent(true);
    } catch {
      setError(t.auth.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleOAuth() {
    setError(null);
    setBusy(true);
    try {
      const supabase = getBrowserSupabase();
      const { error: supabaseError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${origin}/auth/callback` },
      });
      if (supabaseError) {
        setError(t.auth.errorGoogle);
      }
    } catch {
      setError(t.auth.errorGoogle);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: 'var(--type-body)',
          color: 'var(--color-sand)',
          marginTop: 'var(--spacing-8)',
          maxWidth: '420px',
        }}
      >
        {t.auth.magicLinkSent}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '420px' }}>
      <form onSubmit={handleMagicLink} noValidate>
        <label
          htmlFor="login-email"
          style={{
            display: 'block',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--type-label)',
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            color: 'var(--color-dust)',
            marginBottom: 'var(--spacing-2)',
          }}
        >
          {t.auth.emailLabel}
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          aria-required="true"
          aria-invalid={error ? 'true' : 'false'}
          placeholder={t.auth.emailPlaceholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          style={{
            display: 'block',
            width: '100%',
            height: '56px',
            padding: '0 var(--spacing-4)',
            backgroundColor: 'var(--color-bg-1)',
            border: '1px solid var(--color-rule-strong)',
            borderRadius: 'var(--radius-input)',
            color: 'var(--color-ivory)',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--type-body-sm)',
            outline: 'none',
          }}
        />

        {error ? (
          <p
            role="alert"
            aria-live="assertive"
            style={{
              marginTop: 'var(--spacing-2)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--type-label)',
              color: 'var(--color-oxblood-soft)',
            }}
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          style={{
            marginTop: 'var(--spacing-4)',
            width: '100%',
            height: '56px',
            backgroundColor: 'var(--color-oxblood)',
            color: 'var(--color-ivory)',
            border: '1px solid var(--color-rule-strong)',
            borderRadius: 'var(--radius-input)',
            transition: 'background-color var(--motion-micro) ease',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--type-button)',
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            cursor: busy ? 'wait' : 'pointer',
            padding: 0,
          }}
        >
          {busy ? t.auth.submitting : t.auth.submitMagicLink}
        </button>
      </form>

      <div
        aria-hidden="true"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-3)',
          marginTop: 'var(--spacing-6)',
          marginBottom: 'var(--spacing-6)',
        }}
      >
        <span
          style={{
            flex: 1,
            height: '1px',
            backgroundColor: 'var(--color-rule)',
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--type-label)',
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            color: 'var(--color-dust)',
          }}
        >
          {t.auth.orDivider}
        </span>
        <span
          style={{
            flex: 1,
            height: '1px',
            backgroundColor: 'var(--color-rule)',
          }}
        />
      </div>

      <button
        type="button"
        onClick={handleGoogleOAuth}
        disabled={busy}
        style={{
          width: '100%',
          height: '56px',
          backgroundColor: 'var(--color-bg-2)',
          color: 'var(--color-ivory)',
          border: '1px solid var(--color-rule-strong)',
          borderRadius: 'var(--radius-input)',
          transition: 'background-color var(--motion-micro) ease',
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--type-button)',
          textTransform: 'uppercase',
          letterSpacing: '0.18em',
          cursor: busy ? 'wait' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--spacing-3)',
          padding: 0,
        }}
      >
        <GoogleGlyph />
        <span>{t.auth.continueWithGoogle}</span>
      </button>
    </div>
  );
}

/** Inline SVG Google G — monochrome ivory so it sits cleanly on bg-2 in
 * dark mode (official multi-color G would fight the editorial palette). */
function GoogleGlyph() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      aria-label={t.auth.googleIconA11y}
      role="img"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M10 4.2c1.6 0 3 .6 4.1 1.6l3.1-3C15.3 1.1 12.8 0 10 0 6.1 0 2.8 2.2 1.2 5.4l3.5 2.7C5.5 5.8 7.6 4.2 10 4.2z"
      />
      <path
        fill="currentColor"
        d="M19.6 10.2c0-.7-.1-1.4-.2-2H10v3.8h5.4c-.2 1.3-1 2.4-2 3.1l3.2 2.5c1.9-1.7 3-4.3 3-7.4z"
      />
      <path
        fill="currentColor"
        d="M4.7 11.9c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9L1.2 5.4C.4 6.8 0 8.4 0 10s.4 3.2 1.2 4.6l3.5-2.7z"
      />
      <path
        fill="currentColor"
        d="M10 20c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.4 0-4.5-1.6-5.3-3.9L1.2 14.6C2.8 17.8 6.1 20 10 20z"
      />
    </svg>
  );
}

export default LoginForm;
