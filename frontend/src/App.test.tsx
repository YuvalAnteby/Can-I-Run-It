import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import App from './App';

/** Isolated QueryClient for tests — retries disabled to avoid async timeout noise. */
const testQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

test('renders main page heading', () => {
  render(
    <QueryClientProvider client={testQueryClient}>
      <App />
    </QueryClientProvider>,
  );
  const checkButton = screen.getByRole('button', { name: /check/i });
  expect(checkButton).toBeInTheDocument();
});
