'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { IconSearch, IconClock, IconTrendingUp } from '@/components/icons';

interface SearchSuggestion {
  id: string;
  text: string;
  type: 'recent' | 'suggestion' | 'trending';
  url?: string;
}

interface SearchInputProps {
  placeholder?: string;
  className?: string;
  onSearch?: (query: string) => void;
  suggestions?: SearchSuggestion[];
  showTrending?: boolean;
}

export function SearchInput({
  placeholder = 'Search players, schools...',
  className,
  onSearch,
  suggestions = [],
  showTrending = true
}: SearchInputProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Load recent searches from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('recentSearches');
    if (stored) {
      setRecentSearches(JSON.parse(stored));
    }
  }, []);

  // Save to recent searches
  const saveToRecent = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) return;

    const updated = [
      searchQuery,
      ...recentSearches.filter(s => s !== searchQuery)
    ].slice(0, 5);

    setRecentSearches(updated);
    localStorage.setItem('recentSearches', JSON.stringify(updated));
  }, [recentSearches]);

  // Mock suggestions based on query
  const getFilteredSuggestions = useCallback((): SearchSuggestion[] => {
    if (!query.trim()) return [];

    const mockSuggestions: SearchSuggestion[] = [
      { id: '1', text: `${query} in California`, type: 'suggestion', url: `/dashboard/discover?q=${query}&state=CA` },
      { id: '2', text: `${query} pitchers`, type: 'suggestion', url: `/dashboard/discover?q=${query}&position=P` },
      { id: '3', text: `${query} 2025`, type: 'suggestion', url: `/dashboard/discover?q=${query}&year=2025` },
    ];

    return [...suggestions, ...mockSuggestions].slice(0, 5);
  }, [query, suggestions]);

  const allSuggestions = getFilteredSuggestions();
  const showRecent = !query.trim() && recentSearches.length > 0;
  const showDropdown = isOpen && (showRecent || allSuggestions.length > 0);

  // Handle search execution
  const executeSearch = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) return;

    saveToRecent(searchQuery);
    setIsOpen(false);
    setQuery(searchQuery);

    if (onSearch) {
      onSearch(searchQuery);
    } else {
      router.push(`/dashboard/discover?q=${encodeURIComponent(searchQuery)}`);
    }
  }, [saveToRecent, onSearch, router]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) {
      if (e.key === 'Enter') {
        executeSearch(query);
      }
      return;
    }

    const items = showRecent ? recentSearches : allSuggestions;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev < items.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          if (showRecent) {
            const selectedSearch = recentSearches[selectedIndex];
            if (selectedSearch) executeSearch(selectedSearch);
          } else {
            const suggestion = allSuggestions[selectedIndex];
            if (suggestion && suggestion.url) {
              router.push(suggestion.url);
            } else if (suggestion) {
              executeSearch(suggestion.text);
            }
          }
        } else {
          executeSearch(query);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        inputRef.current?.blur();
        break;
    }
  };

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset selected index when suggestions change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [query, isOpen]);

  const clearRecent = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRecentSearches([]);
    localStorage.removeItem('recentSearches');
  };

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <IconSearch size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className={cn(
            'w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-transparent rounded-lg',
            'placeholder:text-slate-400 transition-all',
            'focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none',
            'hover:bg-slate-100 hover:border-slate-200'
          )}
        />
      </div>

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-2 bg-white border border-border rounded-lg shadow-elevation-3 overflow-hidden animate-fade-in z-50"
        >
          {showRecent ? (
            <div className="py-2">
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Recent Searches</span>
                <button
                  onClick={clearRecent}
                  className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Clear
                </button>
              </div>
              {recentSearches.map((item, index) => (
                <button
                  key={index}
                  onClick={() => executeSearch(item)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors',
                    selectedIndex === index
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-700 hover:bg-slate-50'
                  )}
                >
                  <IconClock size={16} className="text-slate-400 flex-shrink-0" />
                  <span className="truncate">{item}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-2">
              <div className="px-4 py-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Suggestions</span>
              </div>
              {allSuggestions.map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.url) {
                      router.push(item.url);
                    } else {
                      executeSearch(item.text);
                    }
                    setIsOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors',
                    selectedIndex === index
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-700 hover:bg-slate-50'
                  )}
                >
                  {item.type === 'trending' ? (
                    <IconTrendingUp size={16} className="text-brand-500 flex-shrink-0" />
                  ) : (
                    <IconSearch size={16} className="text-slate-400 flex-shrink-0" />
                  )}
                  <span className="truncate">{item.text}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
