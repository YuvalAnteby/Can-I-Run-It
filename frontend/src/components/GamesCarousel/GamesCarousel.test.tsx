import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { ClientGameDto } from '../../@types/game.types';
import { GamesCarousel } from './GamesCarousel';

const makeGame = (id: number, name: string): ClientGameDto => ({
  id,
  slug: `game-${id}`,
  name,
  coverImageUrl: null,
  releaseDate: null,
  developer: null,
  publisher: null,
  supportsRayTracing: false,
  supportsDlss: false,
  supportsFsr: false,
});

describe('GamesCarousel', () => {
  it('renders the section heading', () => {
    render(
      <MemoryRouter>
        <GamesCarousel title="Trending Games" games={[]} />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { name: /Trending Games/i }),
    ).toBeInTheDocument();
  });

  it('shows empty state when no games are provided', () => {
    render(
      <MemoryRouter>
        <GamesCarousel title="Trending Games" games={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/no games to show/i)).toBeInTheDocument();
  });

  it('renders a card for each game', () => {
    const games = [makeGame(1, 'Alpha Game'), makeGame(2, 'Beta Game')];
    render(
      <MemoryRouter>
        <GamesCarousel title="Trending Games" games={games} />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { name: 'Alpha Game' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Beta Game' }),
    ).toBeInTheDocument();
  });

  it('renders the correct number of list items', () => {
    const games = [
      makeGame(1, 'Alpha Game'),
      makeGame(2, 'Beta Game'),
      makeGame(3, 'Gamma Game'),
    ];
    render(
      <MemoryRouter>
        <GamesCarousel title="Trending Games" games={games} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });
});
