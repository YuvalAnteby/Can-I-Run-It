import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { ClientGameDto } from '../../../@types/game.types';
import GameHero from './GameHero';

const pendingGame = {
  id: 42,
  slug: 'issue-66-pending',
  name: 'Issue 66 Pending Game',
  status: 'pending_approval' as const,
  coverImageUrl: null,
  releaseDate: null,
  developer: null,
  publisher: null,
  genre: null,
  description: null,
  tags: [],
  supportsRayTracing: false,
  supportsDlss: false,
  supportsFsr: false,
  supportsXeSS: false,
  isTrending: false,
  trendingRank: null,
  requirements: [],
  attributions: [
    {
      source: 'rawg' as const,
      label: 'RAWG' as const,
      url: 'https://rawg.io/games/issue-66-pending',
    },
    {
      source: 'pcgamingwiki' as const,
      label: 'PCGamingWiki' as const,
      url: 'https://www.pcgamingwiki.com/wiki/Issue_66_Pending',
    },
  ],
} as unknown as ClientGameDto;

describe('GameHero pending metadata', () => {
  it('uses a local cover placeholder, labels pending review, omits empty separators, and renders safe attribution links', () => {
    render(
      <MemoryRouter>
        <GameHero game={pendingGame} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: pendingGame.name }),
    ).toBeInTheDocument();
    expect(screen.getByText(/pending review/i)).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: pendingGame.name }),
    ).not.toHaveAttribute(
      'src',
      expect.stringContaining('via.placeholder.com'),
    );
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
    expect(screen.getByText('Source: RAWG')).toBeInTheDocument();
    expect(screen.getByText('Source: PCGamingWiki')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'RAWG' })).toHaveAttribute(
      'href',
      'https://rawg.io/games/issue-66-pending',
    );
    expect(screen.getByRole('link', { name: 'PCGamingWiki' })).toHaveAttribute(
      'href',
      'https://www.pcgamingwiki.com/wiki/Issue_66_Pending',
    );
  });

  it('does not render an attribution container for seeded games', () => {
    const seeded = {
      ...pendingGame,
      status: 'published' as const,
      attributions: undefined,
    } as unknown as ClientGameDto;
    render(
      <MemoryRouter>
        <GameHero game={seeded} />
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole('link', { name: 'RAWG' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'PCGamingWiki' }),
    ).not.toBeInTheDocument();
  });
});
