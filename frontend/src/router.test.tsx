import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppRouter } from './router';

vi.mock('./pages/game_detail/GameDetailPage', () => ({
  default: (): ReactElement => <div>Pending detail route mounted</div>,
}));

describe('frontend route contract', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('registers the internal-id pending game route without replacing the published slug route', async () => {
    window.history.pushState({}, '', '/pending-games/42');
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <AppRouter />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText('Pending detail route mounted'),
    ).toBeInTheDocument();
  });
});
