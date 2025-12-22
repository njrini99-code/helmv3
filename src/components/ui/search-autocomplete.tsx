'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { IconSearch, IconX } from '@/components/icons';
import { Avatar } from '@/components/ui/avatar';
import type { Player } from '@/lib/types';

interface SearchAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (player: Player) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  className?: string;
}

interface SearchResult extends Player {
  // Extend if needed
}

export function SearchAutocomplete({
  value,
  onChange,
  onSelect,
  onSubmit,
  placeholder = 'Search players...',
  className = '',
}: SearchAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Debounced search function
  const searchPlayers = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from('players')
      .select(`
        id,
        first_name,
        last_name,
        avatar_url,
        high_school_name,
        primary_position,
        grad_year,
        state,
        city
      `)
      .eq('recruiting_activated', true)
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,high_school_name.ilike.%${query}%`)
      .order('updated_at', { ascending: false })
      .limit(8);

    setSuggestions((data || []) as SearchResult[]);
    setIsOpen(true);
    setLoading(false);
  }, []);

  // Handle input change with debouncing
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setSelectedIndex(-1);

    // Clear existing timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Set new timer
    debounceTimer.current = setTimeout(() => {
      searchPlayers(newValue);
    }, 300); // 300ms debounce
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'Enter' && onSubmit) {
        onSubmit(value);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          const selectedSuggestion = suggestions[selectedIndex];
          if (selectedSuggestion) {
            handleSelectSuggestion(selectedSuggestion);
          }
        } else if (onSubmit) {
          onSubmit(value);
          setIsOpen(false);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
    }
  };

  // Handle suggestion selection
  const handleSelectSuggestion = (player: SearchResult) => {
    const fullName = `${player.first_name} ${player.last_name}`;
    onChange(fullName);
    if (onSelect) {
      onSelect(player);
    }
    if (onSubmit) {
      onSubmit(fullName);
    }
    setIsOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.blur();
  };

  // Handle clear button
  const handleClear = () => {
    onChange('');
    setSuggestions([]);
    setIsOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) {
              setIsOpen(true);
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full pl-9 pr-10 py-2 rounded-lg border border-slate-200
                     focus:border-green-500 focus:ring-2 focus:ring-green-100
                     text-sm text-slate-900 placeholder:text-slate-400
                     transition-colors"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="animate-spin h-4 w-4 border-2 border-green-600 border-t-transparent rounded-full" />
          </div>
        )}
        {value && !loading && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <IconX size={16} />
          </button>
        )}
      </div>

      {/* Suggestions Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-2 bg-white rounded-lg border border-slate-200 shadow-lg overflow-hidden"
        >
          <div className="max-h-80 overflow-y-auto">
            {suggestions.map((player, index) => {
              const fullName = `${player.first_name} ${player.last_name}`;
              const location = [player.city, player.state].filter(Boolean).join(', ');

              return (
                <button
                  key={player.id}
                  onClick={() => handleSelectSuggestion(player)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                    ${index === selectedIndex
                      ? 'bg-green-50'
                      : 'hover:bg-slate-50'
                    }
                    ${index !== suggestions.length - 1 ? 'border-b border-slate-100' : ''}
                  `}
                >
                  <Avatar
                    src={player.avatar_url}
                    name={fullName}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {fullName}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      {player.primary_position && (
                        <span className="font-medium">{player.primary_position}</span>
                      )}
                      {player.grad_year && (
                        <>
                          <span>•</span>
                          <span>{player.grad_year}</span>
                        </>
                      )}
                    </div>
                    {(player.high_school_name || location) && (
                      <p className="text-xs text-slate-400 truncate mt-0.5">
                        {player.high_school_name || location}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Press <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-medium">Enter</kbd> to search all results
            </p>
          </div>
        </div>
      )}

      {/* No results */}
      {isOpen && !loading && suggestions.length === 0 && value.length >= 2 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-2 bg-white rounded-lg border border-slate-200 shadow-lg p-4"
        >
          <p className="text-sm leading-relaxed text-slate-500 text-center">
            No players found matching &quot;{value}&quot;
          </p>
        </div>
      )}
    </div>
  );
}
