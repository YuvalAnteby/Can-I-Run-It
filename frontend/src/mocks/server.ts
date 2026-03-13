import { setupServer } from 'msw/node';

import { handlers } from './handlers';

/**
 * Shared MSW server instance for all tests.
 *
 * Initialized once in src/setupTests.ts via beforeAll/afterEach/afterAll.
 * Never create a new server inside a test file — use server.use() overrides
 * instead when a specific test needs a different response.
 */
export const server = setupServer(...handlers);
