import { setupServer } from 'msw/node';

import { handlers } from './handlers';

/**
 * Shared MSW server instance for all tests.
 *
 * Initialized in src/setupTests.ts — never create a new server inside a test file.
 * To override a handler in a specific test use:
 *   server.use(http.get(...))
 */
export const server = setupServer(...handlers);
