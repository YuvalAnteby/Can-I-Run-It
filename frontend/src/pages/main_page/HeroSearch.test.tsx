import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { server } from '../../mocks/server';
import { HeroSearch } from './HeroSearch';

const DISCOVER_URL = 'http://localhost:4000/api/v2/games/discover';
const SELECT_URL = 'http://localhost:4000/api/v2/games/rawg/3498/select';

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

function LocationProbe(): ReactNode {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderWithLocation(): ReturnType<typeof render> {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <HeroSearch />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
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

  it('hides A results and reports loading while the B query is debouncing', async () => {
    server.use(
      http.get(DISCOVER_URL, ({ request }) => {
        const query = new URL(request.url).searchParams.get('q');
        return HttpResponse.json({
          rawgAvailable: true,
          data: [
            {
              source: 'local',
              id: query === 'Alpha' ? 1 : 2,
              slug: query === 'Alpha' ? 'alpha-game' : 'beta-game',
              name: query === 'Alpha' ? 'Alpha Game' : 'Beta Game',
              coverImageUrl: null,
            },
          ],
        });
      }),
    );

    render(<HeroSearch />, { wrapper: makeWrapper() });
    const input = screen.getByRole('textbox', { name: /search for a game/i });
    userEvent.type(input, 'Alpha');
    expect(await screen.findByText('Alpha Game')).toBeInTheDocument();

    userEvent.clear(input);
    userEvent.type(input, 'Beta');

    expect(
      screen.queryByRole('button', { name: /alpha game/i }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('presentation')).toHaveLength(3);
  });

  it('shows loading instead of a stale empty state before an unmatched query settles', () => {
    render(<HeroSearch />, { wrapper: makeWrapper() });
    const input = screen.getByRole('textbox', { name: /search for a game/i });
    userEvent.type(input, 'xyzzy_not_a_real_game');

    expect(screen.getAllByRole('presentation')).toHaveLength(3);
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

  it('labels local and RAWG results distinctly and renders the backend attribution as an active link', async () => {
    server.use(
      http.get(DISCOVER_URL, () =>
        HttpResponse.json({
          rawgAvailable: true,
          data: [
            {
              source: 'local',
              id: 7,
              slug: 'local-game',
              name: 'Same Title',
              coverImageUrl: null,
            },
            {
              source: 'rawg',
              rawgId: 3498,
              name: 'Same Title',
              coverImageUrl: null,
              rawgUrl: 'https://rawg.io/games/same-title',
            },
          ],
        }),
      ),
    );

    render(<HeroSearch />, { wrapper: makeWrapper() });
    userEvent.type(
      screen.getByRole('textbox', { name: /search for a game/i }),
      'Same Title',
    );

    expect(await screen.findAllByText('Same Title')).toHaveLength(2);
    expect(screen.getByText(/local/i)).toBeInTheDocument();
    const rawgLink = screen.getByRole('link', { name: /RAWG/i });
    expect(rawgLink).toHaveAttribute(
      'href',
      'https://rawg.io/games/same-title',
    );
    expect(rawgLink).toHaveAttribute('target', '_blank');
    expect(rawgLink).toHaveAttribute(
      'rel',
      expect.stringContaining('noopener'),
    );
  });

  it('renders a RAWG attribution for an imported local search result', async () => {
    server.use(
      http.get(DISCOVER_URL, () =>
        HttpResponse.json({
          rawgAvailable: true,
          data: [
            {
              source: 'local',
              id: 7,
              slug: 'same-title',
              name: 'Imported Local Game',
              coverImageUrl: 'https://images.example/imported.jpg',
              attributions: [
                {
                  source: 'rawg',
                  label: 'RAWG',
                  url: 'https://rawg.io/games/imported-local-game',
                },
              ],
            },
          ],
        }),
      ),
    );

    render(<HeroSearch />, { wrapper: makeWrapper() });
    userEvent.type(
      screen.getByRole('textbox', { name: /search for a game/i }),
      'Imported Local',
    );

    expect(await screen.findByText('Imported Local Game')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /RAWG/i })).toHaveAttribute(
      'href',
      'https://rawg.io/games/imported-local-game',
    );
  });

  it('keeps local results usable when RAWG is unavailable', async () => {
    server.use(
      http.get(DISCOVER_URL, () =>
        HttpResponse.json({
          rawgAvailable: false,
          data: [
            {
              source: 'local',
              id: 7,
              slug: 'local-game',
              name: 'Local Only Game',
              coverImageUrl: null,
            },
          ],
        }),
      ),
    );

    render(<HeroSearch />, { wrapper: makeWrapper() });
    userEvent.type(
      screen.getByRole('textbox', { name: /search for a game/i }),
      'Local Only',
    );

    expect(await screen.findByText('Local Only Game')).toBeInTheDocument();
    expect(screen.getByText(/RAWG unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it('navigates local results directly to their published slug', async () => {
    server.use(
      http.get(DISCOVER_URL, () =>
        HttpResponse.json({
          rawgAvailable: true,
          data: [
            {
              source: 'local',
              id: 7,
              slug: 'local-game',
              name: 'Local Navigation Game',
              coverImageUrl: null,
            },
          ],
        }),
      ),
    );

    renderWithLocation();
    userEvent.type(
      screen.getByRole('textbox', { name: /search for a game/i }),
      'Local Navigation',
    );
    userEvent.click(
      await screen.findByRole('button', { name: /local navigation game/i }),
    );

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/games/local-game',
    );
  });

  it('disables repeated RAWG selection clicks until the POST resolves, then navigates to the pending page', async () => {
    let resolveSelection: ((response: Response) => void) | undefined;
    const selectRequest = vi.fn();
    server.use(
      http.get(DISCOVER_URL, () =>
        HttpResponse.json({
          rawgAvailable: true,
          data: [
            {
              source: 'rawg',
              rawgId: 3498,
              name: 'Selectable RAWG Game',
              coverImageUrl: null,
              rawgUrl: 'https://rawg.io/games/selectable-rawg-game',
            },
          ],
        }),
      ),
      http.post(SELECT_URL, ({ request }) => {
        selectRequest(request);
        return new Promise<Response>((resolve) => {
          resolveSelection = resolve;
        });
      }),
    );

    renderWithLocation();
    userEvent.type(
      screen.getByRole('textbox', { name: /search for a game/i }),
      'Selectable',
    );
    const selectButton = await screen.findByRole('button', {
      name: /select.*selectable rawg game/i,
    });

    userEvent.click(selectButton);
    await waitFor(() => expect(selectRequest).toHaveBeenCalledTimes(1));
    expect(selectButton).toBeDisabled();
    userEvent.click(selectButton);
    await waitFor(() => expect(selectRequest).toHaveBeenCalledTimes(1));

    resolveSelection?.(
      new Response(
        JSON.stringify({
          id: 42,
          slug: 'selectable-rawg-game',
          status: 'pending_approval',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/pending-games/42',
      ),
    );
  });

  it('shows a retryable selection error and does not navigate when the POST fails', async () => {
    server.use(
      http.get(DISCOVER_URL, () =>
        HttpResponse.json({
          rawgAvailable: true,
          data: [
            {
              source: 'rawg',
              rawgId: 3498,
              name: 'Broken RAWG Game',
              coverImageUrl: null,
              rawgUrl: 'https://rawg.io/games/broken-rawg-game',
            },
          ],
        }),
      ),
      http.post(SELECT_URL, () =>
        HttpResponse.json(
          { message: 'private provider error' },
          { status: 500 },
        ),
      ),
    );

    renderWithLocation();
    userEvent.type(
      screen.getByRole('textbox', { name: /search for a game/i }),
      'Broken',
    );
    userEvent.click(
      await screen.findByRole('button', { name: /select.*broken rawg game/i }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/try again/i);
    expect(screen.getByTestId('location')).toHaveTextContent('/');
    expect(
      screen.queryByText(/private provider error/i),
    ).not.toBeInTheDocument();
  });
});
