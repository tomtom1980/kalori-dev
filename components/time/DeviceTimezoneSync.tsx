'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { authPost, SessionExpiredError } from '@/lib/auth/refresh-interceptor';
import { getDeviceTimeZone, normalizeTimeZone } from '@/lib/time/device-timezone';
import { mintClientId } from '@/lib/water/client-id';

interface DeviceTimezoneSyncProps {
  profileTimezone: string;
}

export function DeviceTimezoneSync({ profileTimezone }: DeviceTimezoneSyncProps) {
  const router = useRouter();
  const lastSyncedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const syncDeviceTimezone = () => {
      const profileTz = normalizeTimeZone(profileTimezone);
      const deviceTz = getDeviceTimeZone(profileTz);
      if (deviceTz === profileTz || lastSyncedRef.current === deviceTz) return;

      lastSyncedRef.current = deviceTz;
      void (async () => {
        try {
          await authPost('/api/profile/save', {
            client_id: mintClientId(),
            patch: { timezone: deviceTz },
          });
          if (!cancelled) router.refresh();
        } catch (err) {
          if (err instanceof SessionExpiredError) return;
          lastSyncedRef.current = null;
        }
      })();
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') syncDeviceTimezone();
    };

    syncDeviceTimezone();
    window.addEventListener('focus', syncDeviceTimezone);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', syncDeviceTimezone);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [profileTimezone, router]);

  return null;
}
