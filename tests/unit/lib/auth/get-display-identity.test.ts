/**
 * Task A.2 (US-STAB-A2) — `getDisplayIdentity` resolver unit tests.
 *
 * Maps 1:1 to AC1–AC4 + DT-9 from `Planning/.tmp/task-A.2-briefing.md` and the
 * resolver contract in `Planning/.tmp/task-A.2-ui-frontend.md` §2.
 *
 * Branches under test:
 *   B0 — `user === null` → anonymous (`GUEST`, em-dash monogram)
 *   B1 — `email` non-empty after trim → email branch (HTML-escaped)
 *   B2 — `email` empty + `user_metadata.full_name` non-empty → full_name branch
 *   B3 — both empty → `Account` literal
 *   defensive — empty/whitespace handling, NFKD initials, length cap
 */
import { describe, expect, it } from 'vitest';

import { getDisplayIdentity, type DisplayIdentity } from '@/lib/auth/get-display-identity';

import type { User } from '@supabase/supabase-js';

// Minimal `User`-shaped factory — only the fields the resolver reads. Cast to
// `User` to satisfy the function's type without paying the cost of populating
// the full Supabase `User` record (irrelevant for this pure function).
function makeUser(over: Partial<{ email: string; full_name: string }>): User {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    aud: 'authenticated',
    role: 'authenticated',
    email: over.email,
    app_metadata: {},
    user_metadata: over.full_name === undefined ? {} : { full_name: over.full_name },
    created_at: '2026-05-01T00:00:00.000Z',
  } as unknown as User;
}

describe('getDisplayIdentity — resolver branches', () => {
  // ---------------------------------------------------------------- B0: anon
  it('B0 (AC3): null user → anonymous GUEST with em-dash monogram', () => {
    const out: DisplayIdentity = getDisplayIdentity(null);
    expect(out.name).toBe('GUEST');
    expect(out.handle).toBeUndefined();
    expect(out.initials).toBe('—');
    expect(out.isAnonymous).toBe(true);
  });

  // -------------------------------------------------------- B0: undefined
  // Codex Round-1 Critical fix: a JS caller, test fixture, or future optional
  // prop (e.g. `nav-shell.tsx`'s `user?: User | null`) that propagates
  // `undefined` MUST get the same anonymous identity as `null`. Before the
  // signature widening + `user == null` guard, `getDisplayIdentity(undefined)`
  // skipped the anonymous branch (`user === null` strict-equality fails on
  // `undefined`) and crashed at `user.email` access on line 120.
  it('B0 (AC3): undefined user → anonymous GUEST identical to null branch', () => {
    const out: DisplayIdentity = getDisplayIdentity(undefined);
    expect(out.name).toBe('GUEST');
    expect(out.handle).toBeUndefined();
    expect(out.initials).toBe('—');
    expect(out.isAnonymous).toBe(true);
  });

  // ---------------------------------------------------------------- B1: email
  it('B1 (AC1): user with email returns the email as name', () => {
    const out = getDisplayIdentity(makeUser({ email: 'tamas@example.com' }));
    expect(out.name).toBe('tamas@example.com');
    expect(out.handle).toBeUndefined();
    expect(out.initials).toBe('T');
    expect(out.isAnonymous).toBe(false);
  });

  it('B1 (AC1): email-derived initials use first letter of each separator-split chunk (≤2)', () => {
    // Hyphen-separated local part splits on `-` per the resolver contract;
    // first two chunks contribute first letter each. Matches the briefing
    // example `tamas.szalay@gmail.com` → "TS".
    const out = getDisplayIdentity(makeUser({ email: 'kalori-e2e-1746130000@kalori.test' }));
    expect(out.initials).toBe('KE');
    expect(out.isAnonymous).toBe(false);
  });

  it('B1 (AC1): briefing canonical example tamas.szalay@gmail.com → TS', () => {
    const out = getDisplayIdentity(makeUser({ email: 'tamas.szalay@gmail.com' }));
    expect(out.initials).toBe('TS');
  });

  // ---------------------------------------------------------------- B2: full_name
  it('B2 (AC4): empty email + full_name returns full_name with two-letter initials', () => {
    const out = getDisplayIdentity(makeUser({ email: '', full_name: 'Tamas Szalay' }));
    expect(out.name).toBe('Tamas Szalay');
    expect(out.handle).toBeUndefined();
    expect(out.initials).toBe('TS');
    expect(out.isAnonymous).toBe(false);
  });

  it('B2 (AC4): single-name full_name returns one-letter initials', () => {
    const out = getDisplayIdentity(makeUser({ full_name: 'Anh' }));
    expect(out.name).toBe('Anh');
    expect(out.initials).toBe('A');
  });

  it('B2 (AC4): trims surrounding whitespace from full_name', () => {
    const out = getDisplayIdentity(makeUser({ full_name: '  John  ' }));
    expect(out.name).toBe('John');
    expect(out.initials).toBe('J');
  });

  // ---------------------------------------------------------------- B3: Account
  it('B3 (AC4 terminal): empty email + empty full_name → Account literal', () => {
    const out = getDisplayIdentity(makeUser({ email: '', full_name: '' }));
    expect(out.name).toBe('Account');
    expect(out.initials).toBe('A');
    expect(out.isAnonymous).toBe(false);
  });

  it('B3 (AC4 terminal): whitespace-only email + whitespace-only full_name → Account literal', () => {
    const out = getDisplayIdentity(makeUser({ email: '   ', full_name: '   ' }));
    expect(out.name).toBe('Account');
    expect(out.initials).toBe('A');
  });

  it('B3 (AC4 terminal): missing user_metadata → Account literal', () => {
    const partial = {
      id: 'x',
      aud: 'authenticated',
      role: 'authenticated',
      email: '',
      app_metadata: {},
      user_metadata: undefined,
      created_at: '2026-05-01T00:00:00.000Z',
    } as unknown as User;
    const out = getDisplayIdentity(partial);
    expect(out.name).toBe('Account');
  });

  it('B3 (AC4 terminal): non-string full_name (e.g. boolean) → Account literal', () => {
    const odd = {
      id: 'x',
      aud: 'authenticated',
      role: 'authenticated',
      email: '',
      app_metadata: {},
      user_metadata: { full_name: true },
      created_at: '2026-05-01T00:00:00.000Z',
    } as unknown as User;
    const out = getDisplayIdentity(odd);
    expect(out.name).toBe('Account');
  });

  // ---------------------------------------------------------------- AC2: HTML escape
  it('AC2: email with angle brackets is HTML-escaped', () => {
    const out = getDisplayIdentity(makeUser({ email: '<script>@x.com' }));
    expect(out.name).toBe('&lt;script&gt;@x.com');
    // Initials skip non-letter chars; first letter is `s`.
    expect(out.initials).toBe('S');
  });

  it('AC2: email with the full quintet (& < > " \') is escaped', () => {
    const out = getDisplayIdentity(makeUser({ email: 'a&<>"\'@x.com' }));
    expect(out.name).toBe('a&amp;&lt;&gt;&quot;&#39;@x.com');
    expect(out.initials).toBe('A');
  });

  it('AC2: full_name with angle brackets is HTML-escaped', () => {
    const out = getDisplayIdentity(makeUser({ full_name: 'Alice <Bob>' }));
    expect(out.name).toBe('Alice &lt;Bob&gt;');
    expect(out.initials).toBe('AB');
  });

  // ---------------------------------------------------------------- defensive
  it('handles non-letter full_name gracefully (defensive `?` initial)', () => {
    const out = getDisplayIdentity(makeUser({ full_name: '123' }));
    // After NFKD strip-of-non-letters, no letters remain → defensive `?`.
    expect(out.initials).toBe('?');
    // Name still renders as the trimmed source for visual fidelity.
    expect(out.name).toBe('123');
  });

  it('initials normalize diacritics via NFKD (Á → A)', () => {
    const out = getDisplayIdentity(makeUser({ full_name: 'Ágnes Vargas' }));
    expect(out.initials).toBe('AV');
  });

  // ---------------------------------------------------------------- DTO scope
  // Codex Round 1 #3 (DTO leakage): the resolver is the server→client boundary
  // gate. Its return value MUST contain ONLY the four documented display
  // fields. Any future Supabase metadata addition (e.g. `provider_metadata`,
  // `identities[]`, `phone`, `app_metadata`) must NOT silently propagate into
  // the DTO that crosses the wire to the browser. This test pins the public
  // shape so a regression triggers immediately.
  it('DTO scope: resolver output contains ONLY {name, handle, initials, isAnonymous}', () => {
    // Build a User with a payload of fields beyond what the resolver should
    // expose — provider_metadata, identities, phone, role, etc. The resolver
    // must drop all of these.
    const leaky = {
      id: '00000000-0000-0000-0000-000000000000',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'tamas@example.com',
      phone: '+15551234567',
      app_metadata: { provider: 'google', providers: ['google'] },
      user_metadata: {
        full_name: 'Tamas Szalay',
        avatar_url: 'https://example.com/a.png',
        provider_id: 'secret-provider-id',
      },
      identities: [
        {
          id: 'identity-1',
          provider: 'google',
          identity_data: { sub: 'secret-google-sub', email: 'tamas@example.com' },
        },
      ],
      created_at: '2026-05-01T00:00:00.000Z',
    } as unknown as User;

    const out = getDisplayIdentity(leaky);

    // Allow-list assertion: keys are exactly the four documented fields.
    expect(Object.keys(out).sort()).toEqual(['handle', 'initials', 'isAnonymous', 'name']);

    // Defense-in-depth: assert the most sensitive metadata fields are not
    // present anywhere in the DTO's stringified form. Catches accidental
    // nested-object leakage if a future maintainer broadens the return type.
    const json = JSON.stringify(out);
    expect(json).not.toContain('provider');
    expect(json).not.toContain('identities');
    expect(json).not.toContain('phone');
    expect(json).not.toContain('avatar_url');
    expect(json).not.toContain('secret-google-sub');
    expect(json).not.toContain('secret-provider-id');
  });
});
