import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardDateControl } from '@/components/dashboard/DashboardDateControl';
import { DashboardInteractionLock } from '@/components/dashboard/DashboardInteractionLock';
import { useDashboardDateTransitionStore } from '@/lib/stores/useDashboardDateTransitionStore';

const routerPushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

describe('<DashboardDateControl />', () => {
  beforeEach(() => {
    routerPushMock.mockClear();
    useDashboardDateTransitionStore.getState().clearLoadingDay();
  });

  it('shows a loading indicator immediately after choosing a different day', () => {
    render(<DashboardDateControl viewedDay="2026-05-11" today="2026-05-11" />);

    fireEvent.change(screen.getByTestId('dashboard-date-input'), {
      target: { value: '2026-05-09' },
    });

    expect(routerPushMock).toHaveBeenCalledWith('/dashboard?day=2026-05-09');
    expect(screen.getByTestId('dashboard-date-control')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('dashboard-date-loading')).toHaveTextContent('Loading day');
    expect(screen.getByTestId('dashboard-date-transition-shield')).toBeInTheDocument();
  });

  it('keeps the loading indicator visible until the selected day renders', () => {
    const { rerender } = render(<DashboardDateControl viewedDay="2026-05-11" today="2026-05-11" />);

    fireEvent.change(screen.getByTestId('dashboard-date-input'), {
      target: { value: '2026-05-09' },
    });

    expect(screen.getByTestId('dashboard-date-loading')).toBeInTheDocument();

    rerender(<DashboardDateControl viewedDay="2026-05-09" today="2026-05-11" />);

    expect(screen.queryByTestId('dashboard-date-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-date-transition-shield')).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-date-control')).toHaveAttribute('aria-busy', 'false');
  });

  it('shows the same loading affordance when returning to today', async () => {
    const user = userEvent.setup();
    render(<DashboardDateControl viewedDay="2026-05-09" today="2026-05-11" />);

    await user.click(screen.getByRole('button', { name: 'Return dashboard to today' }));

    expect(routerPushMock).toHaveBeenCalledWith('/dashboard');
    expect(screen.getByTestId('dashboard-date-loading')).toBeInTheDocument();
  });

  it('locks dashboard interactions while the requested day is still loading', () => {
    render(
      <>
        <DashboardDateControl viewedDay="2026-05-11" today="2026-05-11" />
        <DashboardInteractionLock viewedDay="2026-05-11">
          <button type="button">Add food</button>
        </DashboardInteractionLock>
      </>,
    );

    fireEvent.change(screen.getByTestId('dashboard-date-input'), {
      target: { value: '2026-05-09' },
    });

    const lock = screen.getByTestId('dashboard-interaction-lock');
    expect(lock).toHaveAttribute('aria-disabled', 'true');
    expect(lock).toHaveAttribute('aria-busy', 'true');
    expect(lock).toHaveAttribute('inert');
  });

  // --- Bug #1 (2026-05-16-ios-calendar-fix): iOS-reachable native date input
  //
  // The previous implementation rendered the <input type="date"> with
  // `width: 1px; height: 1px; opacity: 0; pointer-events: none` and opened it
  // programmatically from a sibling button via `input.showPicker()`. iOS Safari
  // refuses to honor that pattern: the picker only opens when the actual input
  // element is hit-tested by the user's tap. These tests lock in the new
  // contract: the native `<input type="date">` itself is the interactive tap
  // target, sized ≥44×44, visually transparent but pointer-receiving, and the
  // calendar icon is decorative (pointer-events: none). The fix MUST NOT call
  // showPicker() from any click handler.
  describe('iOS-reachable date picker (Bug #1)', () => {
    it('keeps the date input as a real pointer-receiving tap target', () => {
      render(<DashboardDateControl viewedDay="2026-05-11" today="2026-05-11" />);

      const input = screen.getByTestId('dashboard-date-input');
      const computed = window.getComputedStyle(input);

      // Must NOT be pointer-events: none — iOS only opens the picker on a
      // user tap that actually hits the input element.
      expect(computed.pointerEvents).not.toBe('none');

      // Visually transparent but layout-preserving so iOS hit-tests the box
      // and the focused input still computes the canonical ivory outline.
      expect(computed.opacity).toBe('0');
      expect(computed.color).toBe('transparent');
      expect(computed.appearance).toBe('none');
      expect(input.getAttribute('style')).toContain('outline-color: var(--color-ivory)');

      // 44×44 minimum hit area (WCAG 2.5.5 + Apple HIG). The input is
      // positioned absolutely over its 44×44 wrapper via inset:0; assert the
      // wrapper carries the floor.
      const wrapper = input.parentElement;
      expect(wrapper).not.toBeNull();
      const wrapperStyle = window.getComputedStyle(wrapper as HTMLElement);
      const minWidth = Number.parseInt(wrapperStyle.minWidth, 10);
      const minHeight = Number.parseInt(wrapperStyle.minHeight, 10);
      expect(minWidth).toBeGreaterThanOrEqual(44);
      expect(minHeight).toBeGreaterThanOrEqual(44);
    });

    // Geometry hit-area guard (Codex I-1): a regression that re-shrinks the
    // input to width:1px/height:1px while leaving pointer-events:auto and
    // opacity:0 intact would still pass every other assertion in this block
    // (parent wrapper would still be ≥44×44). iOS hit-testing is based on the
    // input's own rendered box, so we lock the input's inline geometry contract
    // here. We assert the inline style attribute directly because jsdom does
    // not run layout — it cannot resolve `inset: 0` or `100%` against the
    // wrapper. The inline style is the runtime source of truth the browser
    // (and iOS) will read.
    it('input element geometrically covers the full 44x44 trigger area (iOS hit-test contract)', () => {
      render(<DashboardDateControl viewedDay="2026-05-11" today="2026-05-11" />);

      const input = screen.getByTestId('dashboard-date-input') as HTMLInputElement;

      // Position must be absolute so the input layers over the wrapper.
      expect(input.style.position).toBe('absolute');

      // inset: 0 ensures full coverage. React/CSSOM serializes the bare 0
      // verbatim (no px suffix on shorthand zero) — accept either form, but
      // explicitly reject a missing/empty inset (which would mean the input
      // has fallen back to its intrinsic position).
      expect(input.style.inset).toMatch(/^0(px)?$/);

      // Width and height must fill the wrapper. Explicit regression guard
      // against a 1px×1px shrinking — that's exactly the iOS bug shape.
      expect(input.style.width).toBe('100%');
      expect(input.style.height).toBe('100%');
      expect(input.style.width).not.toBe('1px');
      expect(input.style.height).not.toBe('1px');
    });

    it('preserves the accessible label on the date input itself', () => {
      render(<DashboardDateControl viewedDay="2026-05-11" today="2026-05-11" />);

      const labelled = screen.getByLabelText('Choose dashboard date');
      expect(labelled).toBe(screen.getByTestId('dashboard-date-input'));
    });

    it('renders the calendar icon as decorative (pointer-events: none, aria-hidden)', () => {
      render(<DashboardDateControl viewedDay="2026-05-11" today="2026-05-11" />);

      // Calendar icon container surfaced via data-testid for the test seam.
      const icon = screen.getByTestId('dashboard-date-icon');
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      expect(window.getComputedStyle(icon).pointerEvents).toBe('none');
    });

    it('calls HTMLInputElement.showPicker on input click so desktop browsers open the picker', async () => {
      const showPickerSpy = vi.fn();
      // jsdom may not implement showPicker; install + restore around the test.
      const proto = HTMLInputElement.prototype as unknown as {
        showPicker?: () => void;
      };
      const originalDescriptor = Object.getOwnPropertyDescriptor(proto, 'showPicker');
      Object.defineProperty(proto, 'showPicker', {
        configurable: true,
        writable: true,
        value: showPickerSpy,
      });

      try {
        const user = userEvent.setup();
        render(<DashboardDateControl viewedDay="2026-05-11" today="2026-05-11" />);

        const input = screen.getByTestId('dashboard-date-input');
        await user.click(input);

        // Desktop browsers (Chromium/Firefox/Safari) only open the native
        // date picker on the chevron — and our transparent (opacity:0)
        // input has no visible chevron to click. The onClick handler calls
        // `showPicker()` under the user-activation gesture so the picker
        // opens on a plain field click. iOS/Android still open the OS-level
        // wheel on focus regardless.
        expect(showPickerSpy).toHaveBeenCalled();
      } finally {
        if (originalDescriptor) {
          Object.defineProperty(proto, 'showPicker', originalDescriptor);
        } else {
          delete proto.showPicker;
        }
      }
    });

    it('disables the date input while a day is loading (regression: loading state)', () => {
      render(<DashboardDateControl viewedDay="2026-05-11" today="2026-05-11" />);

      fireEvent.change(screen.getByTestId('dashboard-date-input'), {
        target: { value: '2026-05-09' },
      });

      const input = screen.getByTestId('dashboard-date-input') as HTMLInputElement;
      expect(input.disabled).toBe(true);
    });

    it('preserves the max attribute so future dates cannot be selected', () => {
      render(<DashboardDateControl viewedDay="2026-05-09" today="2026-05-11" />);

      const input = screen.getByTestId('dashboard-date-input');
      expect(input.getAttribute('max')).toBe('2026-05-11');
      expect(input.getAttribute('type')).toBe('date');
    });
  });
});
