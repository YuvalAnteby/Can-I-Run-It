import { ChevronDown, Search, X, Loader2 } from 'lucide-react';
import React, { useEffect, useId, useRef, useState } from 'react';

interface Option {
  id: string | number;
  name: string;
  manufacturer?: string;
}

interface SearchableSelectProps {
  label: string;
  value: string;
  selectedName?: string;
  placeholder: string;
  options: Option[];
  isLoading: boolean;
  onSearch: (query: string) => void;
  onSelect: (id: string) => void;
  error?: boolean;
}

const optionDomId = (listId: string, index: number) =>
  `${listId}-option-${index}`;

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  label,
  value,
  selectedName,
  placeholder,
  options,
  isLoading,
  onSearch,
  onSelect,
  error = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const triggerId = useId();
  const listId = useId();

  // Reset the highlighted option when the result list changes. Keyed by ids so a
  // re-created array with the same items keeps the highlight. Done during render
  // (React's "adjust state on prop change" pattern), not in an effect.
  const optionKey = options.map((o) => o.id).join('|');
  const [prevOptionKey, setPrevOptionKey] = useState(optionKey);
  if (optionKey !== prevOptionKey) {
    setPrevOptionKey(optionKey);
    setActiveIndex(options.length > 0 ? 0 : -1);
  }

  // Determine what to display in the main field when closed
  const selectedOption = options.find((o) => o.id.toString() === value);
  const displayValue = selectedOption
    ? selectedOption.name
    : selectedName || '';

  // Handle outside clicks to close the dropdown automatically
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keep the highlighted option visible while arrowing through a long list
  useEffect(() => {
    if (activeIndex < 0) return;
    document
      .getElementById(optionDomId(listId, activeIndex))
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, listId]);

  const handleToggle = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);

    // Clear search and reset results when opening or closing
    if (nextState) {
      setSearchQuery('');
      setActiveIndex(options.length > 0 ? 0 : -1);
      onSearch('');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    onSearch(val);
  };

  const handleOptionClick = (id: string | number) => {
    onSelect(id.toString());
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (options.length === 0) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((activeIndex + step + options.length) % options.length);
    } else if (e.key === 'Enter') {
      const option = options[activeIndex];
      if (!option) return;
      e.preventDefault();
      handleOptionClick(option.id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div
      className="relative mb-4"
      ref={wrapperRef}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && isOpen) setIsOpen(false);
      }}
    >
      {/* Field Label */}
      <div className="flex justify-between items-center mb-1.5">
        <label
          htmlFor={triggerId}
          className="block text-[0.75rem] text-gray-400 uppercase tracking-wider font-bold"
        >
          {label}
        </label>
        {error && (
          <span className="text-red-500 text-[0.65rem] font-bold uppercase tracking-tight animate-pulse motion-reduce:animate-none">
            Required
          </span>
        )}
      </div>

      {/* Main Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-invalid={error}
        className={`relative block w-full text-left p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 bg-page border rounded-md text-ink transition-all cursor-pointer ${
          isOpen
            ? 'border-blue-500 ring-1 ring-blue-500/20'
            : error
              ? 'border-red-500/50 ring-1 ring-red-500/10'
              : 'border-line hover:border-line-strong'
        }`}
        onClick={handleToggle}
      >
        <div className="flex items-center justify-between p-2.5 min-h-[42px]">
          <span
            className={`text-sm truncate font-medium ${!displayValue ? 'text-gray-400' : 'text-white'}`}
          >
            {displayValue || placeholder}
          </span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-[110] mt-1 bg-surface border border-line rounded-md shadow-2xl overflow-hidden animate-dropdown-fade motion-reduce:animate-none">
          {/* Search Input Field */}
          <div className="p-2 border-b border-line flex items-center gap-2 bg-surface-raised">
            <Search size={14} className="text-gray-400" aria-hidden="true" />
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={
                activeIndex >= 0 ? optionDomId(listId, activeIndex) : undefined
              }
              aria-label={`Search ${label}`}
              className="flex-1 bg-transparent border-none text-sm text-white outline-none placeholder:text-gray-600"
              placeholder="Search model..."
              value={searchQuery}
              onChange={handleInputChange}
              onKeyDown={handleSearchKeyDown}
              onClick={(e) => e.stopPropagation()}
            />
            {isLoading ? (
              <Loader2
                size={14}
                className="text-blue-500 animate-spin"
                aria-label="Loading"
              />
            ) : (
              searchQuery && (
                <button
                  type="button"
                  aria-label="Clear search"
                  className="bg-transparent border-0 p-0 text-gray-400 cursor-pointer hover:text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSearchQuery('');
                    onSearch('');
                  }}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )
            )}
          </div>

          {/* Results List */}
          <ul
            id={listId}
            role="listbox"
            aria-label={`${label} results`}
            className="max-h-[240px] overflow-y-auto py-1 bg-surface"
          >
            {!isLoading && options.length === 0 && (
              <li
                role="presentation"
                className="px-3 py-6 text-center text-xs text-gray-400 font-medium"
              >
                No matching hardware found
              </li>
            )}

            {options.map((option, index) => {
              const isSelected = value === option.id.toString();
              return (
                <li
                  key={option.id}
                  id={optionDomId(listId, index)}
                  role="option"
                  aria-selected={isSelected}
                  className={`w-full text-left px-3 py-2 text-sm cursor-pointer transition-colors flex flex-col ${
                    index === activeIndex
                      ? 'bg-surface-raised text-white'
                      : isSelected
                        ? 'bg-blue-500/15 text-blue-400'
                        : 'text-gray-300 hover:bg-surface-raised hover:text-white'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOptionClick(option.id);
                  }}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-semibold">{option.name}</span>
                    {isSelected && (
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                    )}
                  </div>
                  {option.manufacturer && (
                    <span className="text-[0.65rem] text-gray-400 uppercase tracking-tighter font-bold">
                      {option.manufacturer}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
