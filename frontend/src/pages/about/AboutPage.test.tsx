import { render, screen, within } from '@testing-library/react';

describe('About page', () => {
  it('renders the V1 explanation at /about', async () => {
    window.history.pushState({}, '', '/about');
    const { AppRouter } = await import('../../router');

    render(<AppRouter />);

    expect(
      screen.getByRole('heading', { name: /how can i run it works/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/A check uses the game, CPU, GPU, RAM, resolution/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/30, 60, 90, 120, or 144/i)).toBeInTheDocument();
    expect(screen.getByText(/measured database row/i)).toBeInTheDocument();
    expect(screen.getByText(/cached provider result/i)).toBeInTheDocument();
    expect(screen.getAllByText(/heuristic estimate/i).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText(/Verified.*AI.*Estimate/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Can run.*Can't run.*Likely can run.*Likely can't run.*Insufficient data/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/VRAM shortage/i)).toBeInTheDocument();
    expect(screen.getByText(/SSD.*advisory/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Storage capacity is not collected or evaluated/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/curated dataset/i)).toBeInTheDocument();
    const diagram = screen.getByRole('img', {
      name: /service architecture diagram/i,
    });
    for (const name of ['React SPA', 'NestJS API', 'PostgreSQL', 'Gemini']) {
      expect(
        within(diagram).getByRole('heading', { name }),
      ).toBeInTheDocument();
    }
    expect(screen.getByText(/public URL.*pending/i)).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /service architecture diagram/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /compatibility evidence flow diagram/i }),
    ).toBeInTheDocument();

    const behaviorCards = screen.getAllByTestId('behavior-card');
    expect(behaviorCards).toHaveLength(3);
    for (const card of behaviorCards) {
      expect(card.querySelector('svg')).toBeNull();
      expect(card).not.toHaveTextContent(
        /public surface|trust boundary|input|identity|output/i,
      );
      expect(
        Array.from(card.querySelectorAll('[data-testid]')).map((element) =>
          element.getAttribute('data-testid'),
        ),
      ).toEqual([
        'behavior-card-title',
        'behavior-card-description',
        'behavior-card-pills',
      ]);
    }

    expect(screen.getAllByRole('link', { name: 'About' })).toHaveLength(2);
    for (const link of screen.getAllByRole('link', { name: 'About' })) {
      expect(link).toHaveAttribute('href', '/about');
    }
  });
});
