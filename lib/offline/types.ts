/**
 * Task 5.1.1 — Offline outbox types.
 *
 * Single source of truth for the outbox row shape, kind enum, flush result,
 * and the (forward-declared) ConflictError that Task 5.1.5 will surface to
 * the UI on 412 goal-weight conflicts. Defining ConflictError here keeps
 * the data layer self-contained — UI can import it without dragging in any
 * outbox internals.
 *
 * See `Planning/.tmp/task-5.1-ui-architecture.md` §A for the full rationale.
 */

/**
 * Mutation kinds that may be queued offline. The string values are also used
 * as Sentry tag values, so they must be stable / log-safe (kebab-case).
 */
export type OutboxKind =
  | 'entry-create'
  | 'entry-delete'
  | 'water-log'
  | 'weight-log'
  | 'library-update'
  | 'library-bulk-delete'
  | 'goal-weight-update';

/** HTTP method narrowed to the verbs used by Kalori mutations. */
export type OutboxMethod = 'POST' | 'PATCH' | 'DELETE';

/**
 * Body shape required by `enqueue`. The `client_id` field IS the I11
 * idempotency key — every retry of the same row sends the SAME bytes. Callers
 * generate the UUID before optimistic UI; the outbox stores the body verbatim.
 */
export interface OutboxBody {
  client_id: string;
  [key: string]: unknown;
}

/**
 * Persisted outbox row. `id` is a local IDB record identifier (UUID v4 minted
 * at enqueue, used only as a stable key inside the outbox array). The I11
 * idempotency key is `client_id`, which lives both at the row level (for fast
 * lookups) and inside `body` (for byte-identical retries).
 */
export interface OutboxRow {
  id: string;
  client_id: string;
  kind: OutboxKind;
  endpoint: string;
  method: OutboxMethod;
  body: OutboxBody;
  createdAt: number;
  attempts: number;
  lastError: string | null;
  lastAttemptAt: number | null;
  /**
   * Set when the row hit a 412 Precondition Failed (F10 goal-weight conflict).
   * `current` is the server's view of the conflicting field, surfaced verbatim
   * to the UI so Task 5.1.5's modal can render side-by-side values. `null`
   * when no conflict has been recorded for this row.
   */
  conflict: { current: unknown; recordedAt: number } | null;
}

/**
 * Caller input to `enqueue`. The body MUST already carry `client_id` — the
 * outbox does not mint it on the caller's behalf because the client_id must
 * exist BEFORE the optimistic UI fires (architecture.md §11).
 */
export interface EnqueueInput {
  kind: OutboxKind;
  endpoint: string;
  method: OutboxMethod;
  body: OutboxBody;
}

/**
 * Returned from `enqueue`. `idbAvailable: false` indicates IDB was missing or
 * threw on access — the caller should surface the IDB-unavailable toast and
 * fall back to online-only mode (the row was NOT persisted).
 */
export interface EnqueueResult {
  id: string;
  client_id: string;
  idbAvailable: boolean;
}

/** Returned from `flush`. Tally of attempted / succeeded / failed rows. */
export interface FlushResult {
  attempted: number;
  succeeded: number;
  failed: Array<{
    client_id: string;
    kind: OutboxKind;
    error: string;
    /**
     * Present ONLY for 412 conflict rows (F10 goal-weight path). Carries the
     * server's authoritative current value for the field that conflicted, so
     * Task 5.1.5's modal can render "OFFLINE EDIT vs CURRENT TARGET" without
     * re-fetching. Other failure rows omit this field.
     */
    conflict?: { current: unknown };
  }>;
  durationMs: number;
  /** False when IDB is unavailable — flush is a no-op. */
  idbAvailable: boolean;
}

/**
 * 412-mediated conflict surfaced to the UI (F10 goal-weight path). The data
 * layer creates this on a 412 response; Task 5.1.5's modal consumes it.
 */
export class ConflictError extends Error {
  readonly client_id: string;
  readonly kind: OutboxKind;
  readonly current: unknown;

  constructor(args: { client_id: string; kind: OutboxKind; current: unknown; message?: string }) {
    super(args.message ?? `Outbox row ${args.client_id} conflicted (${args.kind}).`);
    this.name = 'ConflictError';
    this.client_id = args.client_id;
    this.kind = args.kind;
    this.current = args.current;
  }
}
