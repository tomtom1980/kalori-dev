'use client';

/**
 * <LogFlowUserScopeSync /> — F-UI-3.6-B-2 chrome-level bridge.
 *
 * Runs once on mount inside the `(app)` layout. Receives the server-resolved
 * `userId` as a prop and calls `useLogFlowStore.syncUserId(userId)` to:
 *   - record the current session user on first login, OR
 *   - purge persisted drafts / clientIds / library selection when the
 *     sessionStorage-persisted `lastUserId` differs from the new session
 *     (logout → login as a different user on the same device).
 *
 * This keeps the store free of any runtime Supabase auth dependency — the
 * user id is resolved once on the server and forwarded through a single
 * client island that mounts alongside the other chrome controllers.
 */
import { useEffect } from 'react';

import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

export interface LogFlowUserScopeSyncProps {
  userId: string | null;
}

export function LogFlowUserScopeSync({ userId }: LogFlowUserScopeSyncProps) {
  useEffect(() => {
    if (!userId) return;
    useLogFlowStore.getState().syncUserId(userId);
  }, [userId]);
  return null;
}

export default LogFlowUserScopeSync;
