/**
 * <BottomTabBar /> — Mobile-only (below 768px) 72px 4-tab strip.
 *
 * Contract (briefing + ui-design.md §6.1):
 *   - Four primary destinations: DASHBOARD / LIBRARY / PROGRESS / SETTINGS
 *     (Log is the FAB, not a tab)
 *   - Each tab has data-testid="nav-{destination}"
 *   - Active tab on `/dashboard` gets aria-current="page"
 *   - Every tab is ≥ 44×44 tap target (briefing AC)
 *   - `<nav>` landmark with aria-label="Primary"
 *   - 2026-05-17 bugfix-tomi bug #1: each tab renders a lucide icon above
 *     the label (ui-design.md §6.4 Default/Active/Focus state table —
 *     `Icon: dust / ivory / ivory`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BottomTabBar } from '@/components/nav/bottom-tab-bar';

describe('<BottomTabBar />', () => {
  it('renders four tabs (no Log tab; FAB handles logging)', () => {
    render(<BottomTabBar pathname="/dashboard" />);
    expect(screen.getByTestId('nav-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('nav-library')).toBeInTheDocument();
    expect(screen.getByTestId('nav-progress')).toBeInTheDocument();
    expect(screen.getByTestId('nav-settings')).toBeInTheDocument();
    expect(screen.queryByTestId('nav-log')).toBeNull();
  });

  it('marks the active tab with aria-current="page"', () => {
    render(<BottomTabBar pathname="/library" />);
    expect(screen.getByTestId('nav-library')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('nav-dashboard')).not.toHaveAttribute('aria-current');
  });

  it('every tab meets the 44×44 tap-target minimum', () => {
    render(<BottomTabBar pathname="/dashboard" />);
    for (const id of ['nav-dashboard', 'nav-library', 'nav-progress', 'nav-settings']) {
      const tab = screen.getByTestId(id);
      expect(Number.parseInt(tab.style.minWidth || '0', 10)).toBeGreaterThanOrEqual(44);
      expect(Number.parseInt(tab.style.minHeight || '0', 10)).toBeGreaterThanOrEqual(44);
    }
  });

  it('exposes a Primary navigation landmark', () => {
    render(<BottomTabBar pathname="/dashboard" />);
    const nav = screen.getByRole('navigation', { name: /primary/i });
    expect(nav).toBeInTheDocument();
  });

  it('renders full-word labels (Dashboard / Library / Progress / Settings) per ui-design.md §6.4', () => {
    // Bug fix 2026-05-08-mobile-ui-overhaul #2: labels were abbreviated as
    // DASH / LIB / PROG / SET, which the user reported as "first letter or
    // half of the word". Spec calls for full words; CSS textTransform
    // 'uppercase' (line 72) handles the visual styling, so the underlying
    // DOM text content must be the full word.
    render(<BottomTabBar pathname="/dashboard" />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.getByText('Progress')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    // Old abbreviated forms must NOT appear anywhere.
    expect(screen.queryByText('DASH')).toBeNull();
    expect(screen.queryByText('LIB')).toBeNull();
    expect(screen.queryByText('PROG')).toBeNull();
    expect(screen.queryByText('SET')).toBeNull();
  });

  it('keeps textTransform: uppercase on each tab so users see UPPERCASE rendering', () => {
    // Guards against a regression where someone removes the inline style
    // and the labels render as mixed-case "Dashboard" instead of "DASHBOARD".
    render(<BottomTabBar pathname="/dashboard" />);
    for (const id of ['nav-dashboard', 'nav-library', 'nav-progress', 'nav-settings']) {
      const tab = screen.getByTestId(id);
      expect(tab.style.textTransform).toBe('uppercase');
    }
  });

  // ---------------------------------------------------------------------------
  // Bugfix-tomi 2026-05-17 batch — bug #1: bottom-nav needs visible icon column
  //
  // ui-design.md §6.4 prescribes a 3-column state table for each tab slot —
  // `Icon | Label | Top bar`. The shipped component renders only the label,
  // making the bar read as "a strip of text" rather than four buttons.
  // The fix wires lucide-react icons through PrimaryDestination + renders
  // each above the label.
  // ---------------------------------------------------------------------------

  it('renders a decorative <svg> icon inside each tab slot', () => {
    // RED-state assertion: prior to the fix, no `<svg>` element exists inside
    // any tab — the slot only contains the label text node. Post-fix, each
    // tab renders exactly one lucide-react `<svg>` decorative glyph above
    // the `shortLabel`.
    render(<BottomTabBar pathname="/dashboard" />);
    for (const id of ['nav-dashboard', 'nav-library', 'nav-progress', 'nav-settings']) {
      const tab = screen.getByTestId(id);
      const svg = tab.querySelector('svg');
      expect(svg, `${id} must render a lucide <svg> icon child`).not.toBeNull();
    }
  });

  it('decorates each tab icon with aria-hidden="true" (label carries the semantic)', () => {
    // The Link element already carries the accessible name via its
    // `shortLabel` text content + `aria-current`. The icon is purely
    // decorative — it MUST be hidden from assistive tech so screen
    // readers don't announce e.g. "library-book-open Library".
    render(<BottomTabBar pathname="/dashboard" />);
    for (const id of ['nav-dashboard', 'nav-library', 'nav-progress', 'nav-settings']) {
      const tab = screen.getByTestId(id);
      const svg = tab.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('renders the icon ABOVE the short label inside each tab (DOM order)', () => {
    // Vertical hierarchy: §6.4 says icon-then-label inside a tall column
    // with `flex-direction: column`. We assert child-node DOM order — the
    // SVG must be a child node that precedes the text node containing the
    // short label, so flex column places it above visually.
    render(<BottomTabBar pathname="/dashboard" />);
    const tab = screen.getByTestId('nav-dashboard');
    // childNodes is a NodeList of direct children. We expect at least 2:
    // [0] = SVG element, [1] = "Dashboard" text node.
    const children = Array.from(tab.childNodes);
    const svgIndex = children.findIndex(
      (n) => n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName.toLowerCase() === 'svg',
    );
    const textIndex = children.findIndex(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.includes('Dashboard'),
    );
    expect(svgIndex, 'tab must contain an <svg> direct child').toBeGreaterThanOrEqual(0);
    expect(
      textIndex,
      'tab must contain a text-node direct child with the label',
    ).toBeGreaterThanOrEqual(0);
    expect(svgIndex, 'icon must precede label in DOM order').toBeLessThan(textIndex);
  });

  it('routes the active-state color flip through `data-active` (CSS-cascade-allowable contract)', () => {
    // Codex R2 cascade-priority fix: the §6.4 state-table color contract
    // (default dust / active ivory / focus-visible ivory) now lives in
    // `app/globals.css` under `.kalori-bottom-tab` + `[data-active="true"]`
    // + `:focus-visible`. The component MUST expose the active state via
    // the `data-active` attribute so the CSS attribute selector can match
    // — and MUST NOT set `style.color` inline (specificity 1000 would
    // defeat the `:focus-visible` rule at specificity 010-020).
    //
    // The icon uses `stroke="currentColor"` so it tracks the tab's `color`
    // automatically via inheritance — covered by the SVG-stroke assertion
    // below.
    const { unmount } = render(<BottomTabBar pathname="/library" />);
    const activeTab = screen.getByTestId('nav-library');
    const inactiveTab = screen.getByTestId('nav-dashboard');

    expect(activeTab.getAttribute('data-active')).toBe('true');
    expect(inactiveTab.getAttribute('data-active')).toBe('false');

    // Lucide v1.8.0 renders stroke="currentColor" by default — we just
    // confirm that the SVG element does NOT carry a hard-coded stroke
    // override like `#fff` or a CSS variable that would break the
    // inherited-color contract.
    const svg = activeTab.querySelector('svg');
    expect(svg).not.toBeNull();
    const stroke = svg!.getAttribute('stroke');
    // Either "currentColor" (lucide default), null/empty (inherits), or
    // explicitly "currentcolor" — anything else means someone hard-coded
    // a color override and the dust↔ivory state contract is broken.
    expect([null, '', 'currentColor', 'currentcolor']).toContain(stroke);

    unmount();
  });

  it('keeps the 72px slot floor + comfortable tap-target floor after adding the icon', () => {
    // Regression guard: the icon insertion must NOT push the label out of
    // the 72px slot or shrink the tap target. Slot height stays 72px;
    // each tab keeps `minHeight: 64px` + `minWidth: 44px`.
    render(<BottomTabBar pathname="/dashboard" />);
    const nav = screen.getByTestId('bottom-tab-bar');
    expect(nav.style.height).toBe('72px');
    for (const id of ['nav-dashboard', 'nav-library', 'nav-progress', 'nav-settings']) {
      const tab = screen.getByTestId(id);
      expect(Number.parseInt(tab.style.minWidth || '0', 10)).toBeGreaterThanOrEqual(44);
      expect(Number.parseInt(tab.style.minHeight || '0', 10)).toBeGreaterThanOrEqual(64);
    }
  });

  it('assigns a palette accent variable and polished icon class to every tab icon', () => {
    render(<BottomTabBar pathname="/dashboard" />);
    for (const id of ['nav-dashboard', 'nav-library', 'nav-progress', 'nav-settings']) {
      const tab = screen.getByTestId(id);
      const svg = tab.querySelector('svg');
      expect(tab.getAttribute('style')).toContain('--tab-accent');
      expect(svg?.classList.contains('kalori-bottom-tab-icon')).toBe(true);
      expect(svg?.getAttribute('width')).toBe('34');
      expect(svg?.getAttribute('height')).toBe('30');
    }
  });

  it('preserves the 2px oxblood top bar on the active tab post-icon-insertion', () => {
    // §6.4 Active state: 2px oxblood flush-top + ivory icon/label. Icon
    // wiring must NOT regress the top-bar contract.
    render(<BottomTabBar pathname="/progress" />);
    const active = screen.getByTestId('nav-progress');
    expect(active.style.borderTopWidth).toBe('2px');
    expect(active.style.borderTopColor).toBe('var(--color-oxblood)');
    // Inactive tabs must NOT show the oxblood bar.
    const inactive = screen.getByTestId('nav-dashboard');
    expect(inactive.style.borderTopColor).toBe('transparent');
  });

  // ---------------------------------------------------------------------------
  // Codex R1 auto-fix 2026-05-17 — bug #1 follow-up: §6.4 Focus state row.
  //
  // §6.4 Focus state has TWO requirements: (a) 2px ivory outline + 2px offset
  // (already satisfied by the global :focus-visible rule in app/globals.css
  // L298-301), AND (b) icon/label color → ivory. Requirement (b) was the
  // unaddressed gap Codex Round 1 flagged: inline `color` only branches on
  // `active`, so keyboard focus on an inactive tab kept both icon and label
  // in dust, breaking the §6.4 contract.
  //
  // Fix: scoped className `kalori-bottom-tab` on each tab Link wrapper + a
  // single rule in globals.css that flips `color: var(--color-ivory)` on
  // `:focus-visible`. The icon inherits via `currentColor` (already covered
  // by the lucide stroke=currentColor contract test above).
  //
  // jsdom does NOT support `:focus-visible` synthesis, so we mirror the
  // pattern from `tests/integration/focus-ring-token.test.ts` — assert the
  // CSS contract by filesystem-read of globals.css. The DOM-side assertion
  // covers the className wiring, which is jsdom-safe.
  // Pixel-perfect focus paint will be re-verified in Phase 7 Playwright.
  // ---------------------------------------------------------------------------

  it('inactive tab flips icon and label to ivory on keyboard focus-visible (§6.4 Focus state)', () => {
    // CSS contract test (jsdom can't synthesize :focus-visible state).
    // globals.css MUST declare `.kalori-bottom-tab:focus-visible { color: var(--color-ivory); ... }`.
    const cssPath = join(process.cwd(), 'app', 'globals.css');
    const css = readFileSync(cssPath, 'utf8');
    // Permissive regex: matches the rule even if other declarations appear
    // before `color` inside the block. Whitespace/newlines allowed.
    expect(
      css,
      'globals.css must declare `.kalori-bottom-tab:focus-visible { color: var(--color-ivory) }` (§6.4 Focus state: icon/label → ivory)',
    ).toMatch(/\.kalori-bottom-tab:focus-visible\s*\{[^}]*color\s*:\s*var\(--color-ivory\)/);
  });

  it('each tab Link has the kalori-bottom-tab scoped class for §6.4 Focus targeting', () => {
    // DOM-side assertion: the className must be present on every tab Link so
    // the CSS rule above actually targets the right elements at runtime.
    render(<BottomTabBar pathname="/dashboard" />);
    for (const id of ['nav-dashboard', 'nav-library', 'nav-progress', 'nav-settings']) {
      const tab = screen.getByTestId(id);
      expect(
        tab.classList.contains('kalori-bottom-tab'),
        `${id} must carry the 'kalori-bottom-tab' className so the §6.4 focus-visible rule applies`,
      ).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // Codex R2 auto-fix 2026-05-17 — cascade-priority correction.
  //
  // The R1 contract test verified that `app/globals.css` declares
  // `.kalori-bottom-tab:focus-visible { color: var(--color-ivory) }` and that
  // every tab Link carries the `kalori-bottom-tab` className. Codex Round 2
  // pointed out those two assertions are necessary but not sufficient: the
  // shipped component STILL set `color: var(--color-dust)` (inactive) /
  // `var(--color-ivory)` (active) via inline `style={{ ... }}`. Inline styles
  // have CSS specificity 1000, which always beats class-level rules
  // (specificity 010) — so the `:focus-visible` rule could never win when
  // an inactive tab took keyboard focus, and §6.4 Focus row stayed broken.
  //
  // The cascade-allowable test below is a structural assertion that the
  // component does NOT set `color` via inline style. Without an inline
  // color override, the cascade is free to resolve in the CSS-class tier
  // where `:focus-visible` competes with `[data-active="true"]`. Pixel-
  // perfect focus paint verification is deferred to Phase 7 Playwright.
  // ---------------------------------------------------------------------------

  it('inactive tab does not set color via inline style (cascade-allowable for §6.4 focus override)', () => {
    // RED-state: prior to the R2 fix, `style.color === 'var(--color-dust)'`
    // because the component baked the inactive color into the inline style
    // object. GREEN-state: color now lives on `.kalori-bottom-tab` in CSS,
    // so the inline `style` attribute carries NO `color` declaration.
    render(<BottomTabBar pathname="/dashboard" />);
    const inactiveTab = screen.getByTestId('nav-library');
    // `style.color` returns '' (empty) when no inline color is set.
    expect(
      inactiveTab.style.color,
      'inactive tab must NOT set inline style.color (otherwise :focus-visible cannot win the cascade)',
    ).toBe('');
    // Belt-and-suspenders: also assert the `style` attribute text itself
    // contains no `color:` declaration. Guards against jsdom quirks.
    const styleAttr = inactiveTab.getAttribute('style') || '';
    expect(
      styleAttr,
      'style attribute must contain no `color:` declaration so the CSS cascade can resolve §6.4 Focus state',
    ).not.toMatch(/(^|;)\s*color\s*:/);
  });

  it('active tab also does not set color via inline style (cascade-allowable)', () => {
    // The same cascade-priority constraint applies to the active tab —
    // if `style.color: var(--color-ivory)` were inline, then `:focus-visible`
    // could not change color on the active tab either (no-op in practice
    // since both states are ivory, but structurally the contract holds).
    render(<BottomTabBar pathname="/library" />);
    const activeTab = screen.getByTestId('nav-library');
    expect(activeTab.style.color).toBe('');
    const styleAttr = activeTab.getAttribute('style') || '';
    expect(styleAttr).not.toMatch(/(^|;)\s*color\s*:/);
  });

  it('globals.css declares the default + active + focus-visible color rules under .kalori-bottom-tab', () => {
    // Structural CSS contract — verifies all three rows of the §6.4 state
    // table (Default / Active / Focus) are routed through CSS classes
    // (not inline style), so the cascade can resolve correctly.
    const cssPath = join(process.cwd(), 'app', 'globals.css');
    const css = readFileSync(cssPath, 'utf8');
    // Default inactive — `.kalori-bottom-tab { color: var(--color-dust); }`
    expect(
      css,
      'globals.css must declare `.kalori-bottom-tab { color: var(--color-dust) }` (default inactive)',
    ).toMatch(/\.kalori-bottom-tab\s*\{[^}]*color\s*:\s*var\(--color-dust\)/);
    // Active flip — `.kalori-bottom-tab[data-active="true"] { color: var(--color-ivory); }`
    expect(
      css,
      'globals.css must declare `.kalori-bottom-tab[data-active="true"] { color: var(--color-ivory) }` (active flip)',
    ).toMatch(
      /\.kalori-bottom-tab\[data-active=['"]true['"]\]\s*\{[^}]*color\s*:\s*var\(--color-ivory\)/,
    );
    // Focus-visible flip (R1 rule retained) —
    // `.kalori-bottom-tab:focus-visible { color: var(--color-ivory); }`
    expect(
      css,
      'globals.css must declare `.kalori-bottom-tab:focus-visible { color: var(--color-ivory) }` (focus flip)',
    ).toMatch(/\.kalori-bottom-tab:focus-visible\s*\{[^}]*color\s*:\s*var\(--color-ivory\)/);
  });
});
