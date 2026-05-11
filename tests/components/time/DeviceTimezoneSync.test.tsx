import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const routerRefreshMock = vi.fn<() => void>();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: () => routerRefreshMock(),
  }),
}));

const authPostMock = vi.fn<(url: string, body: unknown) => Promise<unknown>>();
vi.mock('@/lib/auth/refresh-interceptor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/refresh-interceptor')>();
  return {
    ...actual,
    authPost: (url: string, body: unknown) => authPostMock(url, body),
  };
});

const getDeviceTimeZoneMock = vi.fn<(fallback?: string) => string>();
vi.mock('@/lib/time/device-timezone', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/time/device-timezone')>();
  return {
    ...actual,
    getDeviceTimeZone: (fallback?: string) => getDeviceTimeZoneMock(fallback),
  };
});

import { DeviceTimezoneSync } from '@/components/time/DeviceTimezoneSync';

describe('<DeviceTimezoneSync />', () => {
  beforeEach(() => {
    routerRefreshMock.mockReset();
    authPostMock.mockReset();
    authPostMock.mockResolvedValue({ ok: true, profile: {} });
    getDeviceTimeZoneMock.mockReset();
  });

  it('does nothing when the profile timezone already matches the device', () => {
    getDeviceTimeZoneMock.mockReturnValue('Asia/Bangkok');

    render(<DeviceTimezoneSync profileTimezone="Asia/Bangkok" />);

    expect(authPostMock).not.toHaveBeenCalled();
    expect(routerRefreshMock).not.toHaveBeenCalled();
  });

  it('saves the device timezone and refreshes server components when it differs', async () => {
    getDeviceTimeZoneMock.mockReturnValue('America/Los_Angeles');

    render(<DeviceTimezoneSync profileTimezone="Asia/Bangkok" />);

    await waitFor(() => expect(authPostMock).toHaveBeenCalledTimes(1));
    expect(authPostMock.mock.calls[0]?.[0]).toBe('/api/profile/save');
    expect(authPostMock.mock.calls[0]?.[1]).toMatchObject({
      patch: { timezone: 'America/Los_Angeles' },
    });
    await waitFor(() => expect(routerRefreshMock).toHaveBeenCalledTimes(1));
  });

  it('rechecks the device timezone when the app regains focus', async () => {
    getDeviceTimeZoneMock
      .mockReturnValueOnce('Asia/Bangkok')
      .mockReturnValueOnce('America/Los_Angeles');

    render(<DeviceTimezoneSync profileTimezone="Asia/Bangkok" />);
    expect(authPostMock).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('focus'));

    await waitFor(() => expect(authPostMock).toHaveBeenCalledTimes(1));
    expect(authPostMock.mock.calls[0]?.[1]).toMatchObject({
      patch: { timezone: 'America/Los_Angeles' },
    });
  });
});
