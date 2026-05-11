/**
 * `POST /api/account/delete` — I9 account-deletion cascade (Task 5.2).
 *
 * Method: POST per synthesis §4.1 (HTTP DELETE bodies are RFC-ambiguous; POST
 * carries `{ confirm: 'DELETE' }` unambiguously). The client-side caller
 * (Phase 2B `<AccountDeleteFlow>`) invokes this via authFetch — R1 firewall.
 *
 * Cascade contract (synthesis §5 + briefing §7.5):
 *   1. Storage objects FIRST — paginated under `{userId}/`, 100/page, 1×
 *      retry on transient remove failures.
 *   2. DB rows SECOND — `delete_user_data(p_user_id)` PL/pgSQL transaction
 *      (migration 0013).
 *   3. auth.users LAST — service-role admin client (F-IMPL-1 opt-out below).
 *   4. Cache invalidation — TAGS.profile + TAGS.userLibrary.
 *   5. Sign out + return.
 *
 * Sequencing markers: `deleteAccountCascade` invokes the optional
 * `onPhase()` callback at every phase boundary; production passes a
 * Sentry breadcrumb logger; tests pass an event-log recorder that
 * asserts `storage_end < db_start AND db_end < auth_start`.
 */
import * as Sentry from '@sentry/nextjs';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  AuthDeleteError,
  DbCascadeError,
  FenceSetError,
  StorageListError,
  StorageRemoveError,
  deleteAccountCascade,
  type CascadePhase,
} from '@/lib/account/delete';
import { TAGS } from '@/lib/cache/tags';
import { getServerSupabase } from '@/lib/supabase/server';
// eslint-disable-next-line kalori/no-admin-in-app -- I9 account-deletion cascade requires service-role access to auth.users
import { getAdminSupabase } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const BodySchema = z.object({ confirm: z.literal('DELETE') }).strict();

function phaseFromError(err: unknown): CascadePhase {
  if (err instanceof FenceSetError) return 'fence';
  if (err instanceof StorageListError || err instanceof StorageRemoveError) return 'storage';
  if (err instanceof DbCascadeError) return 'db';
  if (err instanceof AuthDeleteError) return 'auth';
  return 'storage';
}

function causeFromError(err: unknown): string {
  if (
    err instanceof FenceSetError ||
    err instanceof StorageListError ||
    err instanceof StorageRemoveError ||
    err instanceof DbCascadeError ||
    err instanceof AuthDeleteError
  ) {
    return err.cause;
  }
  return 'cascade_failed';
}

export async function POST(request: Request): Promise<Response> {
  // 1. Parse + validate body.
  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const check = BodySchema.safeParse(parsedBody);
  if (!check.success) {
    return NextResponse.json(
      { error: 'ValidationError', issues: check.error.issues },
      { status: 400 },
    );
  }

  // 2. Auth guard — RLS-bound user-scoped client.
  const supabase = await getServerSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const userId = userData.user.id;

  // 3. Run the cascade. Sequencing markers go to Sentry breadcrumbs in
  //    production so I9 ordering can be reconstructed from logs after a
  //    failed delete.
  const admin = getAdminSupabase();
  try {
    await deleteAccountCascade({
      userId,
      supabase,
      admin,
      onPhase: (marker) => {
        Sentry.addBreadcrumb({
          category: 'account-delete',
          level: 'info',
          message: marker,
          data: { user_id: userId },
        });
      },
    });
  } catch (err: unknown) {
    Sentry.captureException(err, {
      tags: { component: 'account-delete' },
      extra: { user_id: userId, cause: causeFromError(err) },
    });
    const recoverable = !(err instanceof AuthDeleteError);
    return NextResponse.json(
      {
        error: 'cascade_failed',
        recoverable,
        cause: causeFromError(err),
        phase: phaseFromError(err),
      },
      { status: 500 },
    );
  }

  // 4. Cache invalidation — best effort. A failure here does NOT roll back
  //    the cascade (Storage + DB + auth.users are all already gone).
  try {
    revalidateTag(TAGS.profile(userId), 'max');
    revalidateTag(TAGS.userLibrary(userId), 'max');
  } catch {
    // Non-fatal; the user is already gone.
  }

  // 5. Sign-out (server cookie clear). Best-effort — session invalidation
  //    is implicit anyway since auth.users is gone.
  try {
    await supabase.auth.signOut();
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export function GET(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}

export function DELETE(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
