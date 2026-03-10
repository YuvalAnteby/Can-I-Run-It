import { render, screen } from '@testing-library/react';
import App from './App';

test('renders main page heading', () => {
  render(<App />);
  const checkButton = screen.getByRole('button', { name: /check/i });
  expect(checkButton).toBeInTheDocument();
});
