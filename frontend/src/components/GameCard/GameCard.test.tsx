import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ClientGameDto } from '../../@types/game.types';
import { GameCard } from './GameCard';

const mockGame: ClientGameDto = {
  id: 1,
  slug: 'test-game',
  name: 'Test Game',
  coverImageUrl: null,
  releaseDate: '2025-01-01',
  developer: 'Dev Studio',
  publisher: 'Publisher Inc',
  supportsRayTracing: false,
  supportsDlss: false,
  supportsFsr: false,
  requirementTier: 'High',
};

describe('GameCard', () => {
  it('renders the game title', () => {
    render(<GameCard game={mockGame} />);
    expect(
      screen.getByRole('heading', { name: 'Test Game' }),
    ).toBeInTheDocument();
  });

  it('renders the requirement tier badge', () => {
    render(<GameCard game={mockGame} />);
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('renders "Can I Run It?" label', () => {
    render(<GameCard game={mockGame} />);
    expect(screen.getByText('Can I Run It?')).toBeInTheDocument();
  });

  it('renders a cover image when coverImageUrl is provided', () => {
    const gameWithImage: ClientGameDto = {
      ...mockGame,
      coverImageUrl: '/cover.jpg',
    };
    render(<GameCard game={gameWithImage} />);
    expect(screen.getByRole('img', { name: 'Test Game' })).toBeInTheDocument();
  });

  it('calls onClick with the game object when clicked', () => {
    const handleClick = vi.fn();
    render(<GameCard game={mockGame} onClick={handleClick} />);
    userEvent.click(
      screen.getByRole('button', { name: /Check if you can run Test Game/i }),
    );
    expect(handleClick).toHaveBeenCalledWith(mockGame);
  });

  it('does not throw when onClick is not provided', () => {
    render(<GameCard game={mockGame} />);
    userEvent.click(
      screen.getByRole('button', { name: /Check if you can run Test Game/i }),
    );
  });

  it('responds to Enter key (keyboard accessibility)', () => {
    const handleClick = vi.fn();
    render(<GameCard game={mockGame} onClick={handleClick} />);
    const card = screen.getByRole('button', {
      name: /Check if you can run Test Game/i,
    });
    card.focus();
    userEvent.keyboard('{Enter}');
    expect(handleClick).toHaveBeenCalledWith(mockGame);
  });
});
