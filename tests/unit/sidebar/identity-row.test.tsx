/**
 * Task A.2 (US-STAB-A2) — `<IdentityRow />` component unit tests.
 *
 * Maps to design-lead spec (`Planning/.tmp/task-A.2-ui-frontend.md` §1, §5)
 * + ux-style spec (`Planning/.tmp/task-A.2-ui-style.md` §1, §5.1).
 *
 * Visual states under test (5 total per ui-style §1):
 *   1. Real Gmail user
 *   2. Email with exotic chars (HTML escape)
 *   3. Anonymous (`user === null`) — em-dash monogram + GUEST label
 *   4. Empty email + full_name fallback
 *   5. Empty email + empty full_name → 'Account' literal
 *
 * Codex Round 1 #3 (DTO): tests now feed the component a `DisplayIdentity`
 * DTO directly rather than a Supabase `User`. The full `User` payload no
 * longer crosses the server→client boundary; the resolver runs on the server
 * (in `app/(app)/layout.tsx`) and only the narrow DTO reaches the browser.
 * Resolver-branch coverage stays in `tests/unit/lib/auth/get-display-identity.test.ts`.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { IdentityRow } from '@/components/nav/identity-row';

import type { DisplayIdentity } from '@/lib/auth/get-display-identity';

// Fixture factory: builds the same DTO shape the server resolver would return
// for each scenario. Mirrors the resolver branches exercised in the resolver
// unit tests.
function makeIdentity(
  over: Partial<DisplayIdentity> & { name: string; initials: string },
): DisplayIdentity {
  return {
    handle: undefined,
    isAnonymous: false,
    ...over,
  };
}

describe('<IdentityRow />', () => {
  // ------------------------------------------------------------- State 1
  it('State 1 (real Gmail): renders email as name + first-letter monogram', () => {
    render(
      <IdentityRow identity={makeIdentity({ name: 'tamas.szalay@gmail.com', initials: 'TS' })} />,
    );
    const row = screen.getByTestId('sidebar-identity-row');
    expect(row).toHaveTextContent('tamas.szalay@gmail.com');
    expect(row).not.toHaveTextContent(/dev user/i);
    // Monogram lives in its own subnode for screen-reader skip + truncation.
    expect(screen.getByTestId('sidebar-identity-row-monogram')).toHaveTextContent('TS');
  });

  it('State 1: row aria-label announces the signed-in identity', () => {
    render(
      <IdentityRow identity={makeIdentity({ name: 'tamas.szalay@gmail.com', initials: 'TS' })} />,
    );
    const row = screen.getByTestId('sidebar-identity-row');
    expect(row).toHaveAttribute('aria-label', 'Signed in as tamas.szalay@gmail.com');
  });

  // ------------------------------------------------------------- State 2
  it('State 2 (AC2 XSS): email with angle brackets renders as escaped TEXT (no <script> element)', () => {
    render(
      <IdentityRow
        identity={makeIdentity({
          name: '&lt;script&gt;alert(1)&lt;/script&gt;@x.com',
          initials: 'S',
        })}
      />,
    );
    const row = screen.getByTestId('sidebar-identity-row');
    // Critical invariant: NO <script> child element exists in the DOM.
    expect(row.querySelectorAll('script').length).toBe(0);
    // Defense-in-depth: the resolver pre-escapes, so the rendered text is
    // the escaped form (e.g. `&lt;script&gt;`). React renders the escaped
    // string verbatim because the source string already contains the
    // entity references as plain characters; JSX child-text interpolation
    // does NOT re-decode entities (that's the whole point of the escape).
    expect(row.textContent).toContain('&lt;script&gt;');
    expect(row.textContent).toContain('&lt;/script&gt;');
    // The aria-label carries the same escaped value (defense-in-depth on
    // the SR surface).
    expect(row).toHaveAttribute(
      'aria-label',
      'Signed in as &lt;script&gt;alert(1)&lt;/script&gt;@x.com',
    );
  });

  // ------------------------------------------------------------- State 3
  it('State 3 (AC3 anonymous): isAnonymous DTO renders GUEST + em-dash monogram', () => {
    render(
      <IdentityRow identity={makeIdentity({ name: 'GUEST', initials: '—', isAnonymous: true })} />,
    );
    const row = screen.getByTestId('sidebar-identity-row');
    expect(row).toHaveTextContent('GUEST');
    expect(row).not.toHaveTextContent(/dev user/i);
    expect(screen.getByTestId('sidebar-identity-row-monogram')).toHaveTextContent('—');
  });

  it('State 3: anonymous row aria-label = "Not signed in"', () => {
    render(
      <IdentityRow identity={makeIdentity({ name: 'GUEST', initials: '—', isAnonymous: true })} />,
    );
    expect(screen.getByTestId('sidebar-identity-row')).toHaveAttribute(
      'aria-label',
      'Not signed in',
    );
  });

  it('State 3: anonymous label uses the kicker typography class (10.5px UPPERCASE 0.18em dust)', () => {
    render(
      <IdentityRow identity={makeIdentity({ name: 'GUEST', initials: '—', isAnonymous: true })} />,
    );
    // The name span carries data-anonymous="true" so consumers / VR can
    // distinguish it from logged-in rows without inspecting style strings.
    const name = screen.getByTestId('sidebar-identity-row-name');
    expect(name).toHaveAttribute('data-anonymous', 'true');
  });

  it('State 3: logged-in name span has data-anonymous="false"', () => {
    render(<IdentityRow identity={makeIdentity({ name: 'tamas@example.com', initials: 'T' })} />);
    expect(screen.getByTestId('sidebar-identity-row-name')).toHaveAttribute(
      'data-anonymous',
      'false',
    );
  });

  // ------------------------------------------------------------- State 4
  it('State 4 (AC4 fallback): empty email + full_name renders the full_name', () => {
    render(<IdentityRow identity={makeIdentity({ name: 'Anh Nguyen', initials: 'AN' })} />);
    const row = screen.getByTestId('sidebar-identity-row');
    expect(row).toHaveTextContent('Anh Nguyen');
    expect(row).not.toHaveTextContent(/dev user/i);
    expect(screen.getByTestId('sidebar-identity-row-monogram')).toHaveTextContent('AN');
  });

  // ------------------------------------------------------------- State 5
  it('State 5 (AC4 terminal): empty email + empty full_name renders Account literal', () => {
    render(<IdentityRow identity={makeIdentity({ name: 'Account', initials: 'A' })} />);
    const row = screen.getByTestId('sidebar-identity-row');
    expect(row).toHaveTextContent('Account');
    expect(row).not.toHaveTextContent(/dev user/i);
    expect(screen.getByTestId('sidebar-identity-row-monogram')).toHaveTextContent('A');
  });

  // ------------------------------------------------------------- Layout
  it('avatar monogram element carries aria-hidden="true" (decorative)', () => {
    render(<IdentityRow identity={makeIdentity({ name: 'tamas@example.com', initials: 'T' })} />);
    expect(screen.getByTestId('sidebar-identity-row-monogram')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('long emails truncate visually (overflow:hidden + text-overflow:ellipsis on the name span)', () => {
    render(
      <IdentityRow
        identity={makeIdentity({
          name: 'firstname.middlename.lastname@verylongdomain.example',
          initials: 'FM',
        })}
      />,
    );
    const name = screen.getByTestId('sidebar-identity-row-name');
    const style = name.style;
    expect(style.textOverflow).toBe('ellipsis');
    expect(style.overflow).toBe('hidden');
    expect(style.whiteSpace).toBe('nowrap');
    // Full email is in the row's aria-label — truncation does not lose it.
    expect(screen.getByTestId('sidebar-identity-row')).toHaveAttribute(
      'aria-label',
      'Signed in as firstname.middlename.lastname@verylongdomain.example',
    );
  });
});
