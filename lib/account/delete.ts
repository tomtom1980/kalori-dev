/**
 * I9 account deletion cascade orchestrator (Task 5.2).
 *
 * Server-only. The single canonical implementation of the Storage → DB →
 * auth.users cascade contract per design-doc §6 + briefing §7.5.
 *
 * ORDER IS LOAD-BEARING (see briefing §7.5 forbidden interleavings):
 *   1. deleteStorageObjectsForUser — paginated under {userId}/, 100/page,
 *      with 1× retry on transient remove failures. Loop until empty page.
 *   2. delete_user_data RPC — single PL/pgSQL transaction wiping all 8
 *      user-owned tables in FK-safe order.
 *   3. admin.auth.admin.deleteUser — service-role only, last step.
 *
 * Sequencing markers (test-observable): each phase fires `onPhase('start')`
 * + `onPhase('end')` so integration tests can assert
 * `storage_end < db_start AND db_end < auth_start`.
 *
 * Codex Round 2 NEW-C1 — RPC client choice. `set_account_deleting` (Phase 0)
 * and `delete_user_data` (Phase 2) MUST run under service-role:
 *   - `delete_user_data` — migration 0015 revoked EXECUTE from `authenticated`.
 *     A user-scoped call now fails with permission denied (SQLSTATE 42501).
 *   - `set_account_deleting` — under SECURITY DEFINER the function relies
 *     on `auth.uid() = p_user_id` for cross-user safety. Migration 0017
 *     extends the guard to also accept service-role callers (where
 *     `auth.uid()` is NULL) so the cascade can run them via admin.
 * Both RPCs are therefore routed through the admin client. The user-scoped
 * client is still used for the Storage cleanup phase (RLS-bound).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type CascadePhase = 'fence' | 'storage' | 'db' | 'auth';
export type CascadeMarker =
  | 'fence_start'
  | 'fence_end'
  | 'storage_start'
  | 'storage_end'
  | 'db_start'
  | 'db_end'
  | 'auth_start'
  | 'auth_end';

export class StorageListError extends Error {
  override readonly cause: string;
  constructor(message = 'storage_list_failed', cause = 'storage_list_failed') {
    super(message);
    this.name = 'StorageListError';
    this.cause = cause;
  }
}

export class StorageRemoveError extends Error {
  override readonly cause: string;
  constructor(message = 'storage_remove_failed', cause = 'storage_remove_failed') {
    super(message);
    this.name = 'StorageRemoveError';
    this.cause = cause;
  }
}

export class DbCascadeError extends Error {
  override readonly cause: string;
  constructor(message = 'db_transaction_rollback', cause = 'db_transaction_rollback') {
    super(message);
    this.name = 'DbCascadeError';
    this.cause = cause;
  }
}

/**
 * Codex R1 C3 — Phase 0 fence-set failure. Raised when
 * `set_account_deleting` fails before the cascade can mark the user as
 * deleting. Recoverable: nothing has been touched yet.
 */
export class FenceSetError extends Error {
  override readonly cause: string;
  constructor(message = 'fence_set_failed', cause = 'fence_set_failed') {
    super(message);
    this.name = 'FenceSetError';
    this.cause = cause;
  }
}

export class AuthDeleteError extends Error {
  override readonly cause: string;
  constructor(
    message = 'auth_users_delete_failed_post_db',
    cause = 'auth_users_delete_failed_post_db',
  ) {
    super(message);
    this.name = 'AuthDeleteError';
    this.cause = cause;
  }
}

export interface DeleteAccountCascadeArgs {
  userId: string;
  supabase: SupabaseClient; // user-scoped SSR client (Storage + RLS-bound)
  admin: SupabaseClient; // service-role client (only auth.admin.deleteUser)
  /**
   * Optional sequencing marker emitter — invoked at each phase boundary.
   * Tests pass a recorder; production passes a noop or a structured logger.
   */
  onPhase?: (marker: CascadeMarker, userId: string) => void;
}

const STORAGE_BUCKET = 'food-thumbnails';
const STORAGE_PAGE_SIZE = 100;

async function listOnce(
  supabase: SupabaseClient,
  userId: string,
): Promise<Array<{ name: string }>> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(`${userId}/`, { limit: STORAGE_PAGE_SIZE, offset: 0 });
  if (error) throw new StorageListError('storage_list_failed', String(error.message ?? error));
  return (data ?? []) as Array<{ name: string }>;
}

async function removeBatch(supabase: SupabaseClient, paths: string[]): Promise<void> {
  // 1× retry on transient failure (briefing §7.5).
  let attempt = 0;
  while (true) {
    const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
    if (!error) return;
    attempt += 1;
    if (attempt >= 2) {
      throw new StorageRemoveError('storage_remove_failed', String(error.message ?? error));
    }
  }
}

async function deleteStorageObjectsForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  // Pagination loop: list 100 → remove 100 → list again → exit when list returns empty.
  // Defensive iteration cap for safety against runaway listings.
  const MAX_ITERATIONS = 1000;
  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const objects = await listOnce(supabase, userId);
    if (objects.length === 0) return;
    const paths = objects.map((o) => `${userId}/${o.name}`);
    await removeBatch(supabase, paths);
    if (objects.length < STORAGE_PAGE_SIZE) return;
  }
  throw new StorageRemoveError('storage_pagination_runaway', 'storage_pagination_runaway');
}

/**
 * Run the full I9 cascade. ORDER IS LOAD-BEARING.
 *
 * Each phase emits a start/end marker for test observability. Throws a
 * typed error class on failure so callers can map to a stable
 * `cause: string` slug for the UI's failure panel (synthesis §2.1
 * Step 6 cause line).
 */
export async function deleteAccountCascade(args: DeleteAccountCascadeArgs): Promise<void> {
  const { userId, supabase, admin, onPhase } = args;
  const emit = (m: CascadeMarker): void => {
    if (onPhase) onPhase(m, userId);
  };

  // 0. FENCE — Codex R1 C3. Mark `profiles.deleting_at = now()` BEFORE
  //    any cascade work so concurrent mutations from sibling tabs / outbox
  //    replays / in-flight requests are rejected with HTTP 423. This is
  //    the load-bearing invariant that prevents post-cascade orphans.
  //    Codex Round 2 NEW-C1 — runs under service-role; migration 0017
  //    relaxes set_account_deleting's `auth.uid() = p_user_id` guard to
  //    also accept service-role callers.
  emit('fence_start');
  try {
    const { error } = await admin.rpc('set_account_deleting', { p_user_id: userId });
    if (error) {
      throw new FenceSetError('fence_set_failed', String(error.message ?? error));
    }
  } finally {
    emit('fence_end');
  }

  // 1. Storage FIRST.
  emit('storage_start');
  try {
    await deleteStorageObjectsForUser(supabase, userId);
  } finally {
    emit('storage_end');
  }

  // 2. DB transaction SECOND.
  //    Codex Round 2 NEW-C1 — runs under service-role; migration 0015
  //    revoked EXECUTE from `authenticated`, so the user-scoped client
  //    can no longer call this RPC. Service-role retains EXECUTE via
  //    Postgres' default function permissions.
  emit('db_start');
  try {
    const { error } = await admin.rpc('delete_user_data', { p_user_id: userId });
    if (error) {
      throw new DbCascadeError('db_transaction_rollback', String(error.message ?? error));
    }
  } finally {
    emit('db_end');
  }

  // 3. auth.users LAST.
  emit('auth_start');
  try {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      throw new AuthDeleteError('auth_users_delete_failed_post_db', String(error.message ?? error));
    }
  } finally {
    emit('auth_end');
  }
}
