import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SearchableSelect } from './SearchableSelect';

const options = [
  { id: 1, name: 'RTX 4090', manufacturer: 'NVIDIA' },
  { id: 2, name: 'RX 7900 XTX', manufacturer: 'AMD' },
  { id: 3, name: 'Arc A770', manufacturer: 'Intel' },
];

const renderSelect = () => {
  const onSelect = vi.fn();
  render(
    <SearchableSelect
      label="GPU"
      value=""
      placeholder="Select your GPU..."
      options={options}
      isLoading={false}
      onSearch={vi.fn()}
      onSelect={onSelect}
    />,
  );
  return { onSelect };
};

// user-event v13: synchronous API. The trigger is named by its <label> ("GPU").
const openDropdown = () => {
  userEvent.click(screen.getByRole('button', { name: 'GPU' }));
  return screen.getByRole('combobox', { name: /search gpu/i });
};

describe('SearchableSelect', () => {
  it('opens the listbox when the trigger is clicked', () => {
    renderSelect();
    openDropdown();
    expect(
      screen.getByRole('listbox', { name: 'GPU results' }),
    ).toBeInTheDocument();
  });

  it('moves aria-activedescendant with ArrowDown', () => {
    renderSelect();
    const input = openDropdown();
    const first = screen.getByRole('option', { name: /RTX 4090/ });
    const second = screen.getByRole('option', { name: /RX 7900 XTX/ });

    expect(input).toHaveAttribute('aria-activedescendant', first.id);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', second.id);
  });

  it('calls onSelect with the active option id as a string on Enter', () => {
    const { onSelect } = renderSelect();
    const input = openDropdown();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith('2');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
