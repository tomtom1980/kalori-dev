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
});
