import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import App from './App';

/**
 * Each test gets its own QueryClient so cached results never leak between cases.
 * Retries are disabled to prevent async timeout noise in tests.
 */
function renderApp(): ReturnType<typeof render> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>,
  );
}

describe('App — landing page integration', () => {
  it('renders the hero search input and Check button', () => {
    renderApp();
    expect(
      screen.getByRole('textbox', { name: /search for a game/i }),
    ).toBeInTheDocument();
    // Use anchored regex to avoid matching GameCard aria-labels
    // ("Check if you can run ...").
    expect(
      screen.getByRole('button', { name: /^check$/i }),
    ).toBeInTheDocument();
  });

  it('renders the hero heading', () => {
    renderApp();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('renders the "Trending Games" carousel section', async () => {
    renderApp();
    expect(
      await screen.findByRole('heading', { name: /trending games/i }),
    ).toBeInTheDocument();
  });

  it('renders the "How It Works" section', async () => {
    renderApp();
    expect(
      await screen.findByRole('heading', { name: /how it works/i }),
    ).toBeInTheDocument();
  });

  it('renders the "Recently Added" carousel section', async () => {
    renderApp();
    expect(
      await screen.findByRole('heading', { name: /recently added/i }),
    ).toBeInTheDocument();
  });

  it('renders game cards from mock data', async () => {
    renderApp();
    // Should appear in Trending carousel
    expect(
      await screen.findByRole('heading', { name: /Cyberpunk 2077/i }),
    ).toBeInTheDocument();
  });
});
