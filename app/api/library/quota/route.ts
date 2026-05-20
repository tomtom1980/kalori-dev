import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';

import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import { getLibraryCreateQuota } from '@/lib/library/create-quota';
import { getServerSupabase } from '@/lib/supabase/server';
import { normalizeProfileTimezone } from '@/lib/time/device-timezone';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const fenced = await requireProfileOrJson401({
    route: '/api/library/quota',
    selectExtras: 'timezone',
  });
  if (fenced instanceof Response) return fenced;

  const supabase = await getServerSupabase();
  const timezone = normalizeProfileTimezone(fenced.profile.timezone);

  try {
    const quota = await getLibraryCreateQuota({
      supabase,
      userId: fenced.user.id,
      tz: timezone,
    });
    return NextResponse.json({ quota }, { status: 200 });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { component: 'library-quota', scope: 'count' },
      extra: { userId: fenced.user.id },
    });
    return NextResponse.json({ error: 'quota_lookup_failed' }, { status: 503 });
  }
}
