/**
 * Type declarations for scripts/schema-drift-check.mjs.
 *
 * The runtime script is plain Node.js ESM (.mjs); these .d.mts types let
 * Vitest tests + IDE consumers reference the public API with full strict
 * typing without dragging the script into the TypeScript compilation graph.
 */

export interface SchemaReference {
  /** Repo-relative POSIX path, e.g. `lib/library/fetch.ts`. */
  file: string;
  /** 1-indexed line number of the `.<verb>(` call. */
  line: number;
  /** Best-effort 1-indexed column on that line (lookahead offset). */
  column: number;
  /** Table name from `.from('<table>')`. */
  table: string;
  /** Column literals extracted from `select(...)` / `insert({...})` / etc. */
  columns: string[];
  /** Which builder verb produced this reference. */
  kind: 'select' | 'insert' | 'update' | 'upsert';
  /**
   * Set when the scanner detected the call but could not extract column
   * names (e.g. opaque identifier payload `.insert(payload)`). Downstream
   * tooling can use this to surface a separate audit class without rerunning
   * the AST scan. `columns` is `[]` in this case.
   */
  unsupported?: 'identifier-payload';
}

export interface SchemaFinding {
  file: string;
  line: number;
  /** 1-indexed character column on the line (matches `col=` in annotation). */
  col: number;
  table: string;
  /**
   * The offending column name (1 finding = 1 column). For unknown-table
   * findings the value is `<missing-table>` and `reason='unknown-table'`.
   */
  column: string;
  kind: 'select' | 'insert' | 'update' | 'upsert';
  /**
   * Optional reason classifier. `'unknown-table'` means the literal
   * table is absent from the generated schema map (renamed / dropped
   * migration). Omitted for column-level drift findings.
   */
  reason?: 'unknown-table';
  /** Pre-formatted GitHub Actions annotation line. */
  annotation: string;
}

export interface RunScanOptions {
  repoRoot: string;
  includeRoots?: string[];
  typesFile?: string;
  mode?: 'report-only' | 'block';
}

export interface RunScanResult {
  references: SchemaReference[];
  findings: SchemaFinding[];
  /** 0 in report-only mode regardless of findings; 1 in block mode if any. */
  exitCode: number;
  mode: 'report-only' | 'block';
  tablesKnown: number;
}

export interface IsTypesFileFreshOptions {
  typesFile: string;
  migrationsDir: string;
  /** Test affordance: override the filesystem newest-migration lookup. */
  simulatedNewestMigration?: string;
}

export interface IsTypesFileFreshResult {
  fresh: boolean;
  newestMigration: string | null;
  markerMigration: string | null;
  /** Computed hash of every migration file's content (SHA-256, hex). */
  actualContentHash?: string;
  /** Hash extracted from the types-file header marker. */
  markerContentHash?: string | null;
  reason?: string;
}

export function runScan(options: RunScanOptions): Promise<RunScanResult>;

export function isTypesFileFresh(options: IsTypesFileFreshOptions): IsTypesFileFreshResult;

/**
 * SHA-256 hash of every `*.sql` file under `migrationsDir`, walked in
 * lexicographic order. Used by `isTypesFileFresh` to detect in-place
 * edits to a migration that don't change its filename.
 */
export function computeMigrationsContentHash(migrationsDir: string): string;

export function parseSchemaFromTypes(content: string): Map<string, Set<string>>;

export function extractReferencesFromFile(absPath: string, repoRoot: string): SchemaReference[];

export function detectDrift(
  reference: SchemaReference,
  schema: Map<string, Set<string>>,
): Array<Omit<SchemaFinding, 'annotation'>>;
