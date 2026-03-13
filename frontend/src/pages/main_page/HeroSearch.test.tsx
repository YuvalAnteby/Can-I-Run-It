import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { HeroSearch } from './HeroSearch';

/**
 * Each test gets its own QueryClient so cached results never leak between cases.
 * Retries disabled to prevent async timeout noise.
 */
function makeWrapper(): ({ children }: { children: ReactNode }) => ReactNode {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

/**
 * NOTE: this project uses @testing-library/user-event v13, which exposes a
 * direct (synchronous) API — userEvent.type(), userEvent.click(), etc.
 * The v14 `.setup()` method does NOT exist here.
 *
 * Async tests rely on findBy* helpers (default 1 000 ms timeout) to cover
 * the 300 ms debounce inside useGameSearch without needing fake timers.
 */
describe('HeroSearch', () => {
  // ── Static render ────────────────────────────────────────────────────────

  it('renders the hero heading', () => {
    render(<HeroSearch />, { wrapper: makeWrapper() });
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('renders the search input with an accessible label', () => {
    render(<HeroSearch />, { wrapper: makeWrapper() });
    expect(
      screen.getByRole('textbox', { name: /search for a game/i }),
    ).toBeInTheDocument();
  });

  it('renders the Check button', () => {
    render(<HeroSearch />, { wrapper: makeWrapper() });
    // Use exact name to avoid collision with GameCard aria-labels
    // ("Check if you can run ...").
    expect(
      screen.getByRole('button', { name: /^check$/i }),
    ).toBeInTheDocument();
  });

  it('does not show a dropdown before the user types', () => {
    render(<HeroSearch />, { wrapper: makeWrapper() });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  // ── Typing interaction ───────────────────────────────────────────────────

  it('opens the dropdown immediately on typing', () => {
    render(<HeroSearch />, { wrapper: makeWrapper() });
    const input = screen.getByRole('textbox', { name: /search for a game/i });
    userEvent.type(input, 'Cyberpunk');
    // dropdownOpen is set to true synchronously via the reducer on SET_QUERY
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('shows matching results in the dropdown after the debounce settles', async () => {
    render(<HeroSearch />, { wrapper: makeWrapper() });
    const input = screen.getByRole('textbox', { name: /search for a game/i });
    userEvent.type(input, 'Cyberpunk');

    // findByText polls for up to 1 000 ms — enough to cover the 300 ms debounce
    // + React Query promise resolution.
    expect(await screen.findByText('Cyberpunk 2077')).toBeInTheDocument();
  });

  it('shows "No games found" message for an unmatched query', () => {
    render(<HeroSearch />, { wrapper: makeWrapper() });
    const input = screen.getByRole('textbox', { name: /search for a game/i });
    userEvent.type(input, 'xyzzy_not_a_real_game');

    // Before the debounce fires, results = [] and isLoading = false
    // so the "no games found" message is rendered immediately.
    expect(screen.getByText(/no games found/i)).toBeInTheDocument();
  });

  // ── Selecting a result ───────────────────────────────────────────────────

  it('fills the input and closes the dropdown when a result is selected', async () => {
    render(<HeroSearch />, { wrapper: makeWrapper() });
    const input = screen.getByRole('textbox', { name: /search for a game/i });
    userEvent.type(input, 'Cyberpunk');

    // Wait for the debounce + React Query to surface "Cyberpunk 2077"
    await screen.findByText('Cyberpunk 2077');

    userEvent.click(screen.getByText('Cyberpunk 2077'));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveValue('Cyberpunk 2077');
  });

  // ── Check button ─────────────────────────────────────────────────────────

  it('closes the dropdown when the Check button is clicked', () => {
    render(<HeroSearch />, { wrapper: makeWrapper() });
    const input = screen.getByRole('textbox', { name: /search for a game/i });
    userEvent.type(input, 'Cyberpunk');

    // Dropdown is open synchronously after typing
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    userEvent.click(screen.getByRole('button', { name: /^check$/i }));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
