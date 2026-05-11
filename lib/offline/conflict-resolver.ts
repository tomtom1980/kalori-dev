/**
 * Task 5.1.5 — F10 conflict policy resolver (pure, table-driven).
 *
 * Per design-doc §14 (line 751) + §18.1 F10 (line 855):
 *   - **Design-doc rule:** "client wins on last-write-wins except
 *     profile.goal_weight changes, which require user confirmation"
 *     (§14.751, verbatim).
 *   - §18.1 F10 explicitly authorises silent LWW for **library edits only**
 *     ("Last-write-wins for library edits …"). It does NOT authorise silent
 *     dequeue of entry / water / weight conflicts.
 *
 * Codex Round 1 (F1) reconciliation
 * ─────────────────────────────────
 * The original implementation mapped every non-goal kind to silent
 * `winner: 'server'` LWW. That broadened silent server-wins beyond what
 * §18.1 authorised: a 412 on an offline meal/water/weight mutation would
 * silently discard the queued write. Until the data layer ships
 * client-wins re-submit (queued row body rewrites with refreshed
 * precondition metadata) we narrow the policy to:
 *
 *   - `library-update` / `library-bulk-delete` → `'lww-silent'` (server
 *      wins). Explicitly authorised by §18.1 F10.
 *   - `entry-create` / `entry-delete` / `water-log` / `weight-log`  →
 *      `'fail-loud'`. Caller surfaces a user-visible error toast so the
 *      offline write is never silently lost. Followup
 *      `F-OFFLINE-5.1.5-CLIENT-WINS-RESUBMIT` tracks the proper
 *      client-wins re-submit path.
 *   - `goal-weight-update` → `'prompt-user'`. Modal asks the user.
 *
 * This module owns ZERO side effects:
 *   - No `outbox.*` calls.
 *   - No I/O.
 *   - No React imports.
 *   - No `client_id` mutation (I11 contract — operates on `kind` + opaque
 *     payloads).
 *
 * @see Planning/.tmp/task-5.1.5-briefing.md §6
 * @see Planning/.tmp/task-5.1.5-codex-review.md F1
 */

import type { OutboxBody, OutboxKind } from './types';

/**
 * Per-row resolution policy.
 *
 * - `'lww-silent'`: caller dequeues the row and continues without prompting.
 *   Authorised only for `library-update` and `library-bulk-delete`.
 * - `'prompt-user'`: caller mounts the F10 conflict modal; the user picks.
 *   Used only for `goal-weight-update`.
 * - `'fail-loud'`: caller MUST surface a user-visible error and leave the
 *   row in conflict. Used for `entry-create` / `entry-delete` / `water-log`
 *   / `weight-log` until a client-wins re-submit path ships.
 */
export type ConflictPolicy = 'lww-silent' | 'prompt-user' | 'fail-loud';

/**
 * Resolution payload returned to the caller.
 *
 * - `winner` is `'server' | 'local'` for `lww-silent` (today always
 *   `'server'`). For `'prompt-user'` and `'fail-loud'` it is `null` because
 *   the resolver does not unilaterally choose — the user picks (modal) or
 *   the caller surfaces the error and leaves the row queued.
 * - `reason` is a Sentry-loggable, non-empty string for breadcrumbs.
 */
export interface ConflictResolution {
  policy: ConflictPolicy;
  winner: 'server' | 'local' | null;
  reason: string;
}

/**
 * Pure resolver.
 *
 * Inputs:
 *   - `kind`         — the queued row's mutation kind (drives the policy).
 *   - `serverCurrent` — the server's authoritative value at conflict time
 *                       (412 response body). Surfaced verbatim so the caller
 *                       can render side-by-side values for goal-weight prompts.
 *   - `localBody`    — the queued payload that triggered the 412. Read-only.
 *
 * Returns: a `ConflictResolution` record the caller orchestrates against.
 */
export function resolveConflict(args: {
  kind: OutboxKind;
  serverCurrent: unknown;
  localBody: OutboxBody;
}): ConflictResolution {
  // Reference inputs to keep TypeScript honest about reading them; the lint
  // rule prevents unused-var noise. We do NOT mutate them — purity is the
  // explicit contract this module ships.
  void args.serverCurrent;
  void args.localBody;

  if (args.kind === 'goal-weight-update') {
    return {
      policy: 'prompt-user',
      winner: null,
      reason: 'F10 goal-weight requires user confirmation per design-doc §18.1',
    };
  }

  if (args.kind === 'library-update' || args.kind === 'library-bulk-delete') {
    return {
      policy: 'lww-silent',
      winner: 'server',
      reason: 'F10 LWW: server wins for library edits per design-doc §18.1',
    };
  }

  // entry-create / entry-delete / water-log / weight-log — design-doc §18.1
  // does NOT authorise silent server-wins for these kinds. Caller surfaces a
  // user-visible error; row stays queued. See
  // F-OFFLINE-5.1.5-CLIENT-WINS-RESUBMIT for the proper fix.
  return {
    policy: 'fail-loud',
    winner: null,
    reason:
      'F10 fail-loud: design-doc §18.1 only authorises silent LWW for library edits; ' +
      'this kind requires client-wins re-submit (deferred via F-OFFLINE-5.1.5-CLIENT-WINS-RESUBMIT)',
  };
}
