import { normalizeTimeZone } from '@/lib/time/device-timezone';

const EM_DASH = '—';

export function formatTimeInTimeZone(
  iso: string | null | undefined,
  timezone: string | null | undefined,
): string {
  if (!iso) return EM_DASH;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EM_DASH;

  const tz = normalizeTimeZone(timezone);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const rawHour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  const hour = rawHour === '24' ? '00' : rawHour;
  return `${hour}:${minute}`;
}
