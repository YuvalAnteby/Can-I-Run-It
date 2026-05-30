import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HowItWorks } from './HowItWorks';

describe('HowItWorks', () => {
  it('renders the section heading', () => {
    render(<HowItWorks />);
    expect(
      screen.getByRole('heading', { name: /How It Works/i }),
    ).toBeInTheDocument();
  });

  it('renders exactly three steps', () => {
    render(<HowItWorks />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('renders the step titles', () => {
    render(<HowItWorks />);
    expect(
      screen.getByRole('heading', { name: /Search a Game/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Enter Your Specs/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Get Your Result/i }),
    ).toBeInTheDocument();
  });
});
