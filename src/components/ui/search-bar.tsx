'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { IconSearch, IconFilter, IconX } from '@/components/icons';

interface SearchBarProps {
  value?: string;
  onChange?: (value: string) => void;
  onSearch?: (value: string) => void;
  placeholder?: string;
  className?: string;
  showFilterButton?: boolean;
  filterCount?: number;
  onFilterClick?: () => void;
  autoFocus?: boolean;
  debounceMs?: number;
}

export function SearchBar({
  value: controlledValue,
  onChange,
  onSearch,
  placeholder = 'Search...',
  className,
  showFilterButton = false,
  filterCount = 0,
  onFilterClick,
  autoFocus = false,
  debounceMs = 300,
}: SearchBarProps) {
  const [internalValue, setInternalValue] = useState(controlledValue || '');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync with controlled value
  useEffect(() => {
    if (controlledValue !== undefined) {
      setInternalValue(controlledValue);
    }
  }, [controlledValue]);

  // Autofocus
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInternalValue(newValue);

    // Debounced onChange
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      onChange?.(newValue);
    }, debounceMs);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      onChange?.(internalValue);
      onSearch?.(internalValue);
    }
    if (e.key === 'Escape') {
      inputRef.current?.blur();
    }
  };

  const handleClear = () => {
    setInternalValue('');
    onChange?.('');
    inputRef.current?.focus();
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative flex-1 group">
        <IconSearch
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400
                     transition-colors group-focus-within:text-slate-600 pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={internalValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className={cn(
            'w-full h-10 pl-10 pr-10 rounded-xl border bg-white text-slate-900 text-sm',
            'placeholder:text-slate-400',
            'transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500',
            'border-slate-200 hover:border-slate-300'
          )}
        />
        {internalValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full
                       text-slate-400 hover:text-slate-600 hover:bg-slate-100
                       transition-colors"
          >
            <IconX size={14} />
          </button>
        )}
      </div>

      {showFilterButton && (
        <button
          type="button"
          onClick={onFilterClick}
          className={cn(
            'relative h-10 px-4 rounded-xl border text-sm font-medium',
            'flex items-center gap-2 transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-green-500/20',
            filterCount > 0
              ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
          )}
        >
          <IconFilter size={16} />
          <span>Filters</span>
          {filterCount > 0 && (
            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-green-600 text-white
                           text-xs font-medium flex items-center justify-center">
              {filterCount}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

// Compact variant for inline use
interface CompactSearchProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function CompactSearch({
  value,
  onChange,
  placeholder = 'Search...',
  className,
}: CompactSearchProps) {
  return (
    <div className={cn('relative', className)}>
      <IconSearch
        size={16}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className={cn(
          'w-full h-8 pl-8 pr-3 rounded-lg border bg-white text-slate-900 text-sm',
          'placeholder:text-slate-400',
          'transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500',
          'border-slate-200 hover:border-slate-300'
        )}
      />
    </div>
  );
}
