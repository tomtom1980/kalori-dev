/**
 * Bug 4 — `<MobileWheelPicker />` primitive (bugfix-tomi
 * 2026-05-08-mobile-ui-overhaul). RED tests first per project TDD policy.
 *
 * Authoritative spec — `Planning/ui-design.md` §4.1.10 + §10.6.1 a11y
 * contract + §13 tiebreaker #23.
 *
 * Coverage:
 *   - role="listbox" + aria-activedescendant + per-row role="option"
 *   - Active row aria-selected="true"; others "false"
 *   - ArrowDown / ArrowUp move active row by one
 *   - PageDown / PageUp move by 5
 *   - Home / End jump to first / last
 *   - Enter fires onCommit with the active value
 *   - Escape fires onCancel (no commit)
 *   - onChange fires when active row changes (snap-end semantics —
 *     keyboard nav fires immediately, mirroring snap-end on touch)
 *   - When useReducedMotion mock returns true, no inertial transition
 *     is applied (the wheel still functions, but the active-row change
 *     is instant — verified by checking the rendered className /
 *     attribute the component sets when reduced-motion is active)
 *   - Renders the controlled `value` prop's row as initial active row
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MobileWheelPicker } from '@/components/primitives/MobileWheelPicker';

const reducedMotionMock = vi.fn<() => boolean | null>(() => false);
vi.mock('@/lib/motion/defaults', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/motion/defaults')>('@/lib/motion/defaults');
  return {
    ...actual,
    useReducedMotion: () => reducedMotionMock(),
  };
});

const NUMERIC_OPTIONS = Array.from({ length: 10 }, (_, i) => ({
  value: i + 1,
  label: String(i + 1),
}));

afterEach(() => {
  reducedMotionMock.mockReset();
  reducedMotionMock.mockReturnValue(false);
});

describe('<MobileWheelPicker />', () => {
  it('renders with role="listbox" and the supplied aria-label', () => {
    render(
      <MobileWheelPicker
        value={3}
        onChange={() => {}}
        options={NUMERIC_OPTIONS}
        ariaLabel="Portion in portions"
      />,
    );
    const list = screen.getByRole('listbox', { name: 'Portion in portions' });
    expect(list).toBeInTheDocument();
  });

  it('each option row has role="option" and the active row is aria-selected="true"', () => {
    render(
      <MobileWheelPicker
        value={3}
        onChange={() => {}}
        options={NUMERIC_OPTIONS}
        ariaLabel="Portion"
      />,
    );
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(NUMERIC_OPTIONS.length);
    const active = options.find((el) => el.getAttribute('aria-selected') === 'true');
    expect(active).toBeDefined();
    expect(active?.textContent).toBe('3');
    // Inactive rows are explicitly aria-selected="false" (not omitted) so
    // screen readers consistently announce "X of N".
    const inactive = options.filter((el) => el.getAttribute('aria-selected') === 'false');
    expect(inactive).toHaveLength(NUMERIC_OPTIONS.length - 1);
  });

  it('container aria-activedescendant points at the active row id', () => {
    render(
      <MobileWheelPicker
        value={5}
        onChange={() => {}}
        options={NUMERIC_OPTIONS}
        ariaLabel="Portion"
      />,
    );
    const list = screen.getByRole('listbox');
    const active = screen.getAllByRole('option').find((el) => el.textContent === '5');
    expect(active?.id).toBeTruthy();
    expect(list.getAttribute('aria-activedescendant')).toBe(active?.id);
  });

  it('ArrowDown advances the active row and fires onChange with the new value', () => {
    const onChange = vi.fn();
    render(
      <MobileWheelPicker
        value={3}
        onChange={onChange}
        options={NUMERIC_OPTIONS}
        ariaLabel="Portion"
      />,
    );
    const list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('ArrowUp decrements the active row and fires onChange', () => {
    const onChange = vi.fn();
    render(
      <MobileWheelPicker
        value={3}
        onChange={onChange}
        options={NUMERIC_OPTIONS}
        ariaLabel="Portion"
      />,
    );
    const list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('Home jumps to the first row, End jumps to the last', () => {
    const onChange = vi.fn();
    render(
      <MobileWheelPicker
        value={5}
        onChange={onChange}
        options={NUMERIC_OPTIONS}
        ariaLabel="Portion"
      />,
    );
    const list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(list, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith(10);
  });

  it('PageDown / PageUp move by 5 rows (one viewport)', () => {
    // The component is controlled — value doesn't change across calls
    // unless the parent updates the `value` prop. We assert the *first*
    // PageDown emits a +5 jump (from 5 → 10 clamped), and re-render with
    // the new value to verify PageUp returns to 5.
    const { rerender } = render(
      <MobileWheelPicker
        value={5}
        onChange={() => {}}
        options={NUMERIC_OPTIONS}
        ariaLabel="Portion"
      />,
    );
    let list = screen.getByRole('listbox');
    const onChangeAfterPageDown = vi.fn();
    rerender(
      <MobileWheelPicker
        value={5}
        onChange={onChangeAfterPageDown}
        options={NUMERIC_OPTIONS}
        ariaLabel="Portion"
      />,
    );
    list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'PageDown' });
    expect(onChangeAfterPageDown).toHaveBeenLastCalledWith(10);

    // Now drive the controlled value to 10 and assert PageUp moves -5.
    const onChangeAfterPageUp = vi.fn();
    rerender(
      <MobileWheelPicker
        value={10}
        onChange={onChangeAfterPageUp}
        options={NUMERIC_OPTIONS}
        ariaLabel="Portion"
      />,
    );
    list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'PageUp' });
    expect(onChangeAfterPageUp).toHaveBeenLastCalledWith(5);
  });

  it('clamps ArrowUp at the first row (no wrap)', () => {
    const onChange = vi.fn();
    render(
      <MobileWheelPicker
        value={1}
        onChange={onChange}
        options={NUMERIC_OPTIONS}
        ariaLabel="Portion"
      />,
    );
    const list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clamps ArrowDown at the last row (no wrap)', () => {
    const onChange = vi.fn();
    render(
      <MobileWheelPicker
        value={10}
        onChange={onChange}
        options={NUMERIC_OPTIONS}
        ariaLabel="Portion"
      />,
    );
    const list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Enter fires onCommit with the active value', () => {
    const onCommit = vi.fn();
    render(
      <MobileWheelPicker
        value={3}
        onChange={() => {}}
        onCommit={onCommit}
        options={NUMERIC_OPTIONS}
        ariaLabel="Portion"
      />,
    );
    const list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(3);
  });

  it('Escape fires onCancel and does NOT fire onCommit', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(
      <MobileWheelPicker
        value={3}
        onChange={() => {}}
        onCommit={onCommit}
        onCancel={onCancel}
        options={NUMERIC_OPTIONS}
        ariaLabel="Portion"
      />,
    );
    const list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('clicking a non-active row makes it active and fires onChange', () => {
    const onChange = vi.fn();
    render(
      <MobileWheelPicker
        value={3}
        onChange={onChange}
        options={NUMERIC_OPTIONS}
        ariaLabel="Portion"
      />,
    );
    const target = screen.getAllByRole('option').find((el) => el.textContent === '7')!;
    fireEvent.click(target);
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it('renders the static end-state under reduced motion (no inertial transition class)', () => {
    reducedMotionMock.mockReturnValue(true);
    const { container } = render(
      <MobileWheelPicker
        value={3}
        onChange={() => {}}
        options={NUMERIC_OPTIONS}
        ariaLabel="Portion"
      />,
    );
    // The component declares `data-reduced-motion="true"` on the listbox
    // when `useReducedMotion()` returns true. Visual regression covers the
    // pixel result; this assertion guards the runtime contract.
    const list = container.querySelector('[role="listbox"]');
    expect(list?.getAttribute('data-reduced-motion')).toBe('true');
  });

  it('default (no reduced motion) does not declare data-reduced-motion="true"', () => {
    reducedMotionMock.mockReturnValue(false);
    const { container } = render(
      <MobileWheelPicker
        value={3}
        onChange={() => {}}
        options={NUMERIC_OPTIONS}
        ariaLabel="Portion"
      />,
    );
    const list = container.querySelector('[role="listbox"]');
    expect(list?.getAttribute('data-reduced-motion')).not.toBe('true');
  });

  it('controlled value prop change updates the active row and aria-activedescendant', () => {
    const { rerender, container } = render(
      <MobileWheelPicker
        value={3}
        onChange={() => {}}
        options={NUMERIC_OPTIONS}
        ariaLabel="Portion"
      />,
    );
    const initialActive = screen
      .getAllByRole('option')
      .find((el) => el.getAttribute('aria-selected') === 'true');
    expect(initialActive?.textContent).toBe('3');
    rerender(
      <MobileWheelPicker
        value={8}
        onChange={() => {}}
        options={NUMERIC_OPTIONS}
        ariaLabel="Portion"
      />,
    );
    const list = container.querySelector('[role="listbox"]')!;
    const activeNow = screen
      .getAllByRole('option')
      .find((el) => el.getAttribute('aria-selected') === 'true');
    expect(activeNow?.textContent).toBe('8');
    expect(list.getAttribute('aria-activedescendant')).toBe(activeNow?.id);
  });

  it('listbox is keyboard-focusable (tabIndex=0)', () => {
    render(
      <MobileWheelPicker
        value={3}
        onChange={() => {}}
        options={NUMERIC_OPTIONS}
        ariaLabel="Portion"
      />,
    );
    const list = screen.getByRole('listbox');
    expect(list.getAttribute('tabindex')).toBe('0');
  });

  it('touch-scroll fires onChange when the snapped row crosses an option boundary (Codex R1 I1)', () => {
    // Codex R1 finding I1: touch-scroll never fired onChange — wheel
    // primitive's core purpose was defeated. After fix: a user-initiated
    // scroll that settles on a different row MUST fire onChange with the
    // new value, mirroring snap-end semantics.
    //
    // After Codex R2 finding C-R2-1, the picker uses padding spacers of
    // (clientHeight - itemHeight)/2 on each side, so scrollTop = N *
    // itemHeight centers row N. Scroll math: derivedIdx = round(scrollTop
    // / itemHeight). To center row 4 (option value=5): scrollTop = 4 *
    // 44 = 176.
    const onChange = vi.fn();
    const itemHeight = 44;
    const { container } = render(
      <MobileWheelPicker
        value={3}
        onChange={onChange}
        options={NUMERIC_OPTIONS}
        itemHeight={itemHeight}
        ariaLabel="Portion"
      />,
    );
    const list = container.querySelector('[role="listbox"]') as HTMLUListElement;

    // Stub each row's offsetTop INCLUDING the top padding spacer so the
    // (programmatic-scroll) useEffect's math runs against browser-realistic
    // values. paddingTop = (clientHeight - itemHeight) / 2 = 88.
    const clientHeight = itemHeight * 5;
    const paddingTop = (clientHeight - itemHeight) / 2;
    const rows = Array.from(list.children) as HTMLLIElement[];
    rows.forEach((row, idx) => {
      Object.defineProperty(row, 'offsetTop', {
        configurable: true,
        value: paddingTop + idx * itemHeight,
      });
      Object.defineProperty(row, 'offsetHeight', { configurable: true, value: itemHeight });
    });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: clientHeight });

    // Reset onChange — the mount-time programmatic scrollTo must NOT
    // count as a touch-scroll commit (and shouldn't anyway, because that
    // scrollTop maps back to activeIndex=2, which equals current).
    onChange.mockClear();

    // Centering row 4 (option value=5) requires scrollTop = 4 * itemHeight = 176.
    list.scrollTop = 4 * itemHeight;
    fireEvent.scroll(list);

    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('programmatic scroll from value-prop change does NOT re-fire onChange (no feedback loop)', () => {
    // After the I1 fix the onScroll handler MUST distinguish user touch
    // scrolls from the component's own scrollTo (driven by value-prop
    // change). Otherwise a keyboard ArrowDown that scrolls the active
    // row into view would re-fire onChange in a loop.
    const onChange = vi.fn();
    const itemHeight = 44;
    const { container, rerender } = render(
      <MobileWheelPicker
        value={3}
        onChange={onChange}
        options={NUMERIC_OPTIONS}
        itemHeight={itemHeight}
        ariaLabel="Portion"
      />,
    );
    const list = container.querySelector('[role="listbox"]') as HTMLUListElement;
    const clientHeight = itemHeight * 5;
    const paddingTop = (clientHeight - itemHeight) / 2;
    const rows = Array.from(list.children) as HTMLLIElement[];
    rows.forEach((row, idx) => {
      Object.defineProperty(row, 'offsetTop', {
        configurable: true,
        value: paddingTop + idx * itemHeight,
      });
      Object.defineProperty(row, 'offsetHeight', { configurable: true, value: itemHeight });
    });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: clientHeight });

    onChange.mockClear();

    // Parent updates the controlled value — component will programmatically
    // scrollTo the new active row. The resulting scroll event must not
    // be mistaken for a user touch-scroll.
    rerender(
      <MobileWheelPicker
        value={7}
        onChange={onChange}
        options={NUMERIC_OPTIONS}
        itemHeight={itemHeight}
        ariaLabel="Portion"
      />,
    );
    // jsdom doesn't dispatch a scroll event from element.scrollTo, so we
    // do it ourselves to mimic the browser. After the C-R2-1 fix:
    // scrollTop = 6 * itemHeight = 264 centers row index 6 (value=7).
    // This scrollTop maps back to derivedIdx=6 — the same activeIndex
    // value=7 produced — so the equality short-circuit must reject it.
    list.scrollTop = 6 * itemHeight;
    fireEvent.scroll(list);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('touch-scroll that settles back on the current value does NOT fire onChange', () => {
    // No-op scrolls (user wiggles the wheel and lets it snap back to the
    // same row) must not fire onChange. Otherwise consumers see redundant
    // updates that can cause re-renders or analytics noise.
    const onChange = vi.fn();
    const itemHeight = 44;
    const { container } = render(
      <MobileWheelPicker
        value={3}
        onChange={onChange}
        options={NUMERIC_OPTIONS}
        itemHeight={itemHeight}
        ariaLabel="Portion"
      />,
    );
    const list = container.querySelector('[role="listbox"]') as HTMLUListElement;
    const clientHeight = itemHeight * 5;
    const paddingTop = (clientHeight - itemHeight) / 2;
    const rows = Array.from(list.children) as HTMLLIElement[];
    rows.forEach((row, idx) => {
      Object.defineProperty(row, 'offsetTop', {
        configurable: true,
        value: paddingTop + idx * itemHeight,
      });
      Object.defineProperty(row, 'offsetHeight', { configurable: true, value: itemHeight });
    });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: clientHeight });

    onChange.mockClear();

    // After the C-R2-1 fix: scrollTop = 2 * itemHeight = 88 centers
    // row index 2 (value=3) — the same as current.
    list.scrollTop = 2 * itemHeight;
    fireEvent.scroll(list);

    expect(onChange).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Codex R2 finding C-R2-1 (Critical) — boundary scroll-math regression suite.
  //
  // Bug: with no padding spacers, scrollTop=0 placed the FIRST option at the
  // viewport TOP (not center), and the derive-index formula returned index 2
  // instead of 0. Touch users physically could not select boundary rows
  // (index 0..1 or last-1..last) because scrollTop is clamped to >= 0 and
  // <= scrollHeight - clientHeight. Visual-vs-scroll desync also broke the
  // controlled-value contract: opening with `value=options[0]` rendered the
  // active indicator at index 0 but scrollTop=0 mapped back to index 2.
  //
  // Fix: add top + bottom padding spacers of (clientHeight - itemHeight)/2.
  // After the fix, scrollTop = N * itemHeight centers row N — the formula
  // collapses to round(scrollTop / itemHeight). This suite exercises the
  // boundary cases and the rounding behavior near a row boundary so we
  // never regress this again.
  // ---------------------------------------------------------------------------

  it('C-R2-1: scrollTop=0 selects the first option (boundary at index 0)', () => {
    const onChange = vi.fn();
    const itemHeight = 44;
    const { container } = render(
      <MobileWheelPicker
        value={5}
        onChange={onChange}
        options={NUMERIC_OPTIONS}
        itemHeight={itemHeight}
        ariaLabel="Portion"
      />,
    );
    const list = container.querySelector('[role="listbox"]') as HTMLUListElement;
    const clientHeight = itemHeight * 5;
    const paddingTop = (clientHeight - itemHeight) / 2;
    const rows = Array.from(list.children) as HTMLLIElement[];
    rows.forEach((row, idx) => {
      Object.defineProperty(row, 'offsetTop', {
        configurable: true,
        value: paddingTop + idx * itemHeight,
      });
      Object.defineProperty(row, 'offsetHeight', { configurable: true, value: itemHeight });
    });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: clientHeight });

    onChange.mockClear();
    // Touch-user scrolls to the very top.
    list.scrollTop = 0;
    fireEvent.scroll(list);

    // First option (value=1, index 0) must be selectable.
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('C-R2-1: rendering with value=options[0] sets scrollTop=0 (centering useEffect)', () => {
    // The visual active row and the scroll-derived active row must agree.
    // Before the fix: opening with value=options[0] rendered the indicator
    // at index 0 but scrollTop=0 mapped back to index 2 → desync.
    const itemHeight = 44;
    const { container } = render(
      <MobileWheelPicker
        value={1}
        onChange={() => {}}
        options={NUMERIC_OPTIONS}
        itemHeight={itemHeight}
        ariaLabel="Portion"
      />,
    );
    const list = container.querySelector('[role="listbox"]') as HTMLUListElement;
    const clientHeight = itemHeight * 5;
    const paddingTop = (clientHeight - itemHeight) / 2;
    const rows = Array.from(list.children) as HTMLLIElement[];
    rows.forEach((row, idx) => {
      Object.defineProperty(row, 'offsetTop', {
        configurable: true,
        value: paddingTop + idx * itemHeight,
      });
      Object.defineProperty(row, 'offsetHeight', { configurable: true, value: itemHeight });
    });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: clientHeight });

    // Force the centering useEffect to re-run by toggling activeIndex via
    // a rerender. The mount-time effect already ran (against jsdom's 0
    // offsetTop/clientHeight), so re-render with the same value triggers
    // a fresh re-run now that we've stubbed the layout properties.
    const { rerender } = render(
      <MobileWheelPicker
        value={1}
        onChange={() => {}}
        options={NUMERIC_OPTIONS}
        itemHeight={itemHeight}
        ariaLabel="Portion"
      />,
      { container },
    );
    // Apply stubs to whatever listbox is now in the DOM.
    const list2 = container.querySelector('[role="listbox"]') as HTMLUListElement;
    const rows2 = Array.from(list2.children) as HTMLLIElement[];
    rows2.forEach((row, idx) => {
      Object.defineProperty(row, 'offsetTop', {
        configurable: true,
        value: paddingTop + idx * itemHeight,
      });
      Object.defineProperty(row, 'offsetHeight', { configurable: true, value: itemHeight });
    });
    Object.defineProperty(list2, 'clientHeight', { configurable: true, value: clientHeight });

    rerender(
      <MobileWheelPicker
        value={2}
        onChange={() => {}}
        options={NUMERIC_OPTIONS}
        itemHeight={itemHeight}
        ariaLabel="Portion"
      />,
    );
    rerender(
      <MobileWheelPicker
        value={1}
        onChange={() => {}}
        options={NUMERIC_OPTIONS}
        itemHeight={itemHeight}
        ariaLabel="Portion"
      />,
    );

    expect(list2.scrollTop).toBe(0);
  });

  it('C-R2-1: scrollTop=(N-1)*itemHeight selects the last option (boundary at last index)', () => {
    const onChange = vi.fn();
    const itemHeight = 44;
    const { container } = render(
      <MobileWheelPicker
        value={5}
        onChange={onChange}
        options={NUMERIC_OPTIONS}
        itemHeight={itemHeight}
        ariaLabel="Portion"
      />,
    );
    const list = container.querySelector('[role="listbox"]') as HTMLUListElement;
    const clientHeight = itemHeight * 5;
    const paddingTop = (clientHeight - itemHeight) / 2;
    const rows = Array.from(list.children) as HTMLLIElement[];
    rows.forEach((row, idx) => {
      Object.defineProperty(row, 'offsetTop', {
        configurable: true,
        value: paddingTop + idx * itemHeight,
      });
      Object.defineProperty(row, 'offsetHeight', { configurable: true, value: itemHeight });
    });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: clientHeight });

    onChange.mockClear();
    const lastIdx = NUMERIC_OPTIONS.length - 1; // 9
    list.scrollTop = lastIdx * itemHeight; // 9 * 44 = 396
    fireEvent.scroll(list);

    // Last option (value=10, index 9) must be selectable.
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it('C-R2-1: rounding behavior — half-row threshold lands on the nearer row', () => {
    const onChange = vi.fn();
    const itemHeight = 44;
    const { container } = render(
      <MobileWheelPicker
        value={5}
        onChange={onChange}
        options={NUMERIC_OPTIONS}
        itemHeight={itemHeight}
        ariaLabel="Portion"
      />,
    );
    const list = container.querySelector('[role="listbox"]') as HTMLUListElement;
    const clientHeight = itemHeight * 5;
    const paddingTop = (clientHeight - itemHeight) / 2;
    const rows = Array.from(list.children) as HTMLLIElement[];
    rows.forEach((row, idx) => {
      Object.defineProperty(row, 'offsetTop', {
        configurable: true,
        value: paddingTop + idx * itemHeight,
      });
      Object.defineProperty(row, 'offsetHeight', { configurable: true, value: itemHeight });
    });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: clientHeight });

    onChange.mockClear();
    // From value=5 (index 4), scroll just under half-row past index 1 →
    // should still round to index 1, NOT index 2.
    list.scrollTop = 1 * itemHeight + itemHeight / 2 - 1; // 65
    fireEvent.scroll(list);
    expect(onChange).toHaveBeenLastCalledWith(2); // option value=2 (index 1)

    // Just over half-row past index 1 → rounds to index 2.
    list.scrollTop = 1 * itemHeight + itemHeight / 2 + 1; // 67
    fireEvent.scroll(list);
    expect(onChange).toHaveBeenLastCalledWith(3); // option value=3 (index 2)
  });

  it('C-R2-1: visual-vs-scroll sync — value=options[0] renders aria-selected at index 0 AND scroll math agrees', () => {
    // Reproduction case from Codex R2: opening with value=options[0]
    // visually clamps to top while scroll-derived index says options[2].
    const onChange = vi.fn();
    const itemHeight = 44;
    const { container } = render(
      <MobileWheelPicker
        value={1}
        onChange={onChange}
        options={NUMERIC_OPTIONS}
        itemHeight={itemHeight}
        ariaLabel="Portion"
      />,
    );
    const list = container.querySelector('[role="listbox"]') as HTMLUListElement;

    // Visual state: aria-selected="true" must be on index 0 (value=1).
    const visuallyActive = screen
      .getAllByRole('option')
      .find((el) => el.getAttribute('aria-selected') === 'true');
    expect(visuallyActive?.textContent).toBe('1');

    // Stub layout, then scroll to the position that visually centers
    // index 0: scrollTop = 0.
    const clientHeight = itemHeight * 5;
    const paddingTop = (clientHeight - itemHeight) / 2;
    const rows = Array.from(list.children) as HTMLLIElement[];
    rows.forEach((row, idx) => {
      Object.defineProperty(row, 'offsetTop', {
        configurable: true,
        value: paddingTop + idx * itemHeight,
      });
      Object.defineProperty(row, 'offsetHeight', { configurable: true, value: itemHeight });
    });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: clientHeight });

    onChange.mockClear();
    list.scrollTop = 0;
    fireEvent.scroll(list);

    // The scroll-derived active index must agree with the visual one
    // (index 0, value=1). The handler short-circuits (clamped ===
    // activeIndex) when they agree → onChange must NOT fire.
    expect(onChange).not.toHaveBeenCalled();
  });
});
