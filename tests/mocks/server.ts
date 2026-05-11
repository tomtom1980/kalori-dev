/**
 * MSW node-context server bootstrap (Task 1.3; testing-strategy.md §6).
 *
 * Exports a singleton `server` that downstream specs import to install
 * per-test overrides via `server.use(...)`. Lifecycle hooks (`listen`,
 * `resetHandlers`, `close`) are registered centrally in `tests/setup.ts`
 * so individual specs don't need to wire them unless they want finer
 * control (as `tests/integration/msw-gemini.test.ts` does for its
 * isolation-proof test).
 */
import { setupServer } from 'msw/node';

import { handlers } from './handlers';

export const server = setupServer(...handlers);
