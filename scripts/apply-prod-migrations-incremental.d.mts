/**
 * Type declarations for `scripts/apply-prod-migrations-incremental.mjs`.
 *
 * The module is plain JS (Node script invoked directly) but the Vitest unit
 * test imports it via the `@/scripts` alias, so hand-written types live here
 * for tsc consumption — matches the pattern in `scripts/lib/sw-digest.d.mts`.
 */

export const EXPECTED_PROD_REF: string;
export const KNOWN_DEV_REF: string;

export function parseMigrationNumber(filename: string): string | null;

export function computeMigrationDelta(local: readonly string[], applied: Set<string>): string[];

export function stripSqlComments(sqlString: string): string;

export function detectDestructiveDDL(sqlString: string): string[];

export interface VerificationQuery {
  name: string;
  sql: string;
  predicate: (rows: unknown) => boolean;
  description: string;
}

export function buildVerificationQuery(migrationNumber: string): VerificationQuery[];

export function parseEnvFile(text: string): Record<string, string>;

export interface ParsedFlags {
  dryRun: boolean;
  apply: boolean;
  confirmDestructive: boolean;
  allowDev: boolean;
  verbose: boolean;
  migrationOverride: string[] | null;
  envFile: string | null;
}

export function parseFlags(argv: readonly string[]): ParsedFlags;

export interface RunQueryResult {
  status: number;
  json: unknown;
}

export interface MakeRunQueryOptions {
  projectRef: string;
  pat: string;
  fetchImpl?: typeof fetch;
  verbose?: boolean;
}

export function makeRunQuery(
  opts: MakeRunQueryOptions,
): (sql: string, label: string) => Promise<RunQueryResult>;

export interface AppliedMigrationsInfo {
  applied: Set<string>;
  source: string;
  // E.1.9 Codex Round 2 finding 2 — disagreement diagnostic fields populated
  // only when `source === 'disagreement'` (tracker says one thing, artifact
  // probe says another). main() halts on `disagreement` unless the operator
  // passes --migrations explicitly.
  trackerHighest?: string;
  artifactHighest?: string;
}

export function detectAppliedMigrations(
  runQuery: (sql: string, label: string) => Promise<RunQueryResult>,
): Promise<AppliedMigrationsInfo>;

export function main(argv: readonly string[]): Promise<void>;
