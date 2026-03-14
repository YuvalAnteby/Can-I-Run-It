import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { ClientGameDto } from '../../@types/game.types';
import { GamesGrid } from './GamesGrid';

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

describe('GamesGrid', () => {
  it('renders the section title', () => {
    render(
      <MemoryRouter>
        <GamesGrid title="All Games" games={[]} />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { name: /All Games/i }),
    ).toBeInTheDocument();
  });

  it('renders a card for each game', () => {
    const games = [makeGame(1, 'Game One'), makeGame(2, 'Game Two')];
    render(
      <MemoryRouter>
        <GamesGrid title="All Games" games={games} />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { name: 'Game One' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Game Two' }),
    ).toBeInTheDocument();
  });
});
