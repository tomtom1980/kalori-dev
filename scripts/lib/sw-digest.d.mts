/**
 * Type declarations for `scripts/lib/sw-digest.mjs`. The module is plain JS
 * because `scripts/build-sw.mjs` is a Node script invoked by `pnpm sw:build`
 * — keeping it `.mjs` avoids needing a separate TypeScript build step for
 * the SW bundler. The Vitest unit test imports the module via the `@/scripts`
 * alias, so we ship hand-written types here for tsc consumption.
 */
export function digestOf(bytes: Uint8Array): string;
export function digestForCompare(filePath: string, bytes: Uint8Array): string;
