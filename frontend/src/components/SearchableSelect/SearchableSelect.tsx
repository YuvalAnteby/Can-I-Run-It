import { ChevronDown, Search, X, Loader2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

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
  disabled?: boolean;
  error?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  label,
  value,
  selectedName,
  placeholder,
  options,
  isLoading,
  onSearch,
  onSelect,
  disabled = false,
  error = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

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

  const handleToggle = () => {
    if (disabled) return;
    const nextState = !isOpen;
    setIsOpen(nextState);

    // Clear search and reset results when opening or closing
    if (nextState) {
      setSearchQuery('');
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
  };

  return (
    <div className="relative mb-4" ref={wrapperRef}>
      {/* Field Label */}
      <div className="flex justify-between items-center mb-1.5">
        <label className="block text-[0.75rem] text-gray-400 uppercase tracking-wider font-bold">
          {label}
        </label>
        {error && (
          <span className="text-red-500 text-[0.65rem] font-bold uppercase tracking-tight animate-pulse">
            Required
          </span>
        )}
      </div>

      {/* Main Trigger Button */}
      <div
        className={`relative w-full bg-[#0f0f13] border rounded-md text-[#e8e8e8] transition-all cursor-pointer ${
          isOpen
            ? 'border-blue-500 ring-1 ring-blue-500/20'
            : error
              ? 'border-red-500/50 ring-1 ring-red-500/10'
              : 'border-[#2a2a3a] hover:border-[#3a3a4a]'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={handleToggle}
      >
        <div className="flex items-center justify-between p-2.5 min-h-[42px]">
          <span
            className={`text-sm truncate font-medium ${!displayValue ? 'text-gray-500' : 'text-white'}`}
          >
            {displayValue || placeholder}
          </span>
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-[110] mt-1 bg-[#13131a] border border-[#2a2a3a] rounded-md shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Search Input Field */}
          <div className="p-2 border-b border-[#2a2a3a] flex items-center gap-2 bg-[#1a1a24]">
            <Search size={14} className="text-gray-400" />
            <input
              autoFocus
              className="flex-1 bg-transparent border-none text-sm text-white outline-none placeholder:text-gray-600"
              placeholder="Search model..."
              value={searchQuery}
              onChange={handleInputChange}
              onClick={(e) => e.stopPropagation()}
            />
            {isLoading ? (
              <Loader2 size={14} className="text-blue-500 animate-spin" />
            ) : (
              searchQuery && (
                <X
                  size={14}
                  className="text-gray-400 cursor-pointer hover:text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSearchQuery('');
                    onSearch('');
                  }}
                />
              )
            )}
          </div>

          {/* Results List */}
          <ul className="max-h-[240px] overflow-y-auto py-1 custom-scrollbar bg-[#13131a]">
            {!isLoading && options.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-gray-400 font-medium">
                No matching hardware found
              </li>
            )}

            {options.map((option) => (
              <li
                key={option.id}
                className={`px-3 py-2 text-sm cursor-pointer transition-colors flex flex-col ${
                  value === option.id.toString()
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'text-gray-300 hover:bg-[#1e1e2a] hover:text-white'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleOptionClick(option.id);
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{option.name}</span>
                  {value === option.id.toString() && (
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                  )}
                </div>
                {option.manufacturer && (
                  <span className="text-[0.65rem] text-gray-500 uppercase tracking-tighter font-bold">
                    {option.manufacturer}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
