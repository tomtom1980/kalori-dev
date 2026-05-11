/**
 * @vitest-environment happy-dom
 *
 * Task B.3 (US-STAB-B3) — Sidebar "Navigation" header non-interactive contract.
 *
 * Three acceptance criteria, co-located in this single file per the Phase 1
 * ux-specialist routing decision (`Planning/.tmp/task-B.3-ui-ux-specialist.md`
 * §7) — `vitest-axe` is the project's vitest-side axe surface, so AC3 lives
 * here alongside AC1/AC2 rather than being threaded into a phase a11y sweep:
 *
 *   - AC1 — `<h2>` heading semantics with no interactive attrs
 *           (no `href`, no `onclick` DOM attribute, no `tabindex` 0).
 *   - AC2 — element is skipped in keyboard tab order.
 *           Two-RED brownfield discipline: the original `<span>` already
 *           passed an "is-not-tabbable" assertion accidentally; the RED-1
 *           trace recorded in `task-B.3-output.md` documents that the test
 *           DOES catch a deliberate `tabIndex={0}` regression.
 *   - AC3 — axe-core sweep on the sidebar in isolation, with the page-level
 *           rule `page-has-heading-one` disabled (the unit harness mounts
 *           only `<Sidebar />` — no document-level `<h1>` exists). The
 *           full-page axe sweep that DOES carry an `<h1>` is covered by
 *           Phase D US-STAB-D1.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { Sidebar } from '@/components/nav/sidebar';

describe('<Sidebar /> Navigation header (US-STAB-B3)', () => {
  it('AC1 (no-interactive-attrs): Navigation label is <h2> with no interactive attrs', () => {
    render(<Sidebar pathname="/dashboard" />);

    const heading = screen.getByRole('heading', { level: 2, name: /navigation/i });

    // Tag is exactly H2 (the load-bearing semantic flip).
    expect(heading.tagName).toBe('H2');

    // No anchor target — the heading must not look like a link.
    expect(heading).not.toHaveAttribute('href');

    // No DOM-level onclick attribute. (React `onClick` props attach
    // synthetic listeners to the React root, not as DOM attributes; the
    // absence of the attribute string here is the surface the AC names.)
    expect(heading).not.toHaveAttribute('onclick');

    // Acceptable tabIndex: undefined (the `<h2>` default — getAttribute
    // returns null) or -1 (explicit out-of-tab-order). Anything ≥ 0 would
    // mean a future hand made the heading focusable, which AC1 forbids.
    const ti = heading.getAttribute('tabindex');
    expect(ti === null || ti === '-1').toBe(true);
  });

  it('AC2 (not-in-tab-order): Navigation header is skipped when tabbing through the sidebar', async () => {
    const user = userEvent.setup();

    // Anchor focus inside a focusable harness so userEvent.tab() has
    // somewhere natural to start. The two harness buttons frame the
    // sidebar; tabbing from the leading button walks every focusable
    // inside the sidebar. The heading must NEVER receive focus during
    // that walk.
    render(
      <>
        <button type="button" data-testid="tab-anchor-before">
          before
        </button>
        <Sidebar pathname="/dashboard" />
        <button type="button" data-testid="tab-anchor-after">
          after
        </button>
      </>,
    );

    // Land focus on the leading anchor so the first user.tab() call
    // moves into the sidebar's tabbable elements deterministically.
    screen.getByTestId('tab-anchor-before').focus();

    const heading = screen.getByRole('heading', { level: 2, name: /navigation/i });

    // 12 presses comfortably covers: 5 destination Links + Sign Out
    // button + the trailing anchor + cycle re-entry. The heading must
    // not become activeElement on ANY of those steps.
    for (let i = 0; i < 12; i += 1) {
      await user.tab();
      expect(document.activeElement).not.toBe(heading);
    }
  });

  it('AC3 (axe-clean-on-sidebar-nav): no a11y violations on the sidebar in isolation', async () => {
    const { container } = render(<Sidebar pathname="/dashboard" />);

    // Disable `page-has-heading-one` — the unit harness mounts only
    // `<Sidebar />` without a document-level `<h1>`. The rule is
    // page-level and not applicable to component-isolation render. The
    // authed-page render (which DOES carry an `<h1>`) is covered by
    // Phase D US-STAB-D1.
    const results = await axe(container, {
      rules: {
        'page-has-heading-one': { enabled: false },
      },
    });

    expect(results).toHaveNoViolations();
  });
});
