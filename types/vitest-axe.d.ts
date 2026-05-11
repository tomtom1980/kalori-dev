/**
 * vitest-axe augments `Vi.Assertion` internally via its `extend-expect`
 * entry, but the Vitest v4 public `Assertion` surface doesn't pick that
 * up automatically. Re-augment the `vitest` module so `expect(results)
 * .toHaveNoViolations()` is visible to TS at call sites.
 */
import type { AxeResults } from 'axe-core';
import 'vitest';

interface NoViolationsMatcherResult {
  message(): string;
  pass: boolean;
  actual: AxeResults['violations'];
}

interface VitestAxeMatchers {
  toHaveNoViolations(): NoViolationsMatcherResult;
}

declare module 'vitest' {
  interface Assertion extends VitestAxeMatchers {
    _axeBrand?: never;
  }
  interface AsymmetricMatchersContaining extends VitestAxeMatchers {
    _axeBrand?: never;
  }
}

export {};
