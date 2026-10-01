'use client';

import { Search, X } from 'lucide-react';
import { Icon } from './Icon';

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <label className={'ch-search' + (className ? ` ${className}` : '')}>
      <Icon icon={Search} size={14} />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && value && (e.stopPropagation(), onChange(''))}
        enterKeyHint="search"
        autoComplete="off"
      />
      {value && (
        <button type="button" className="ch-search__x" aria-label="Clear search" onClick={() => onChange('')}>
          <Icon icon={X} size={13} />
        </button>
      )}
    </label>
  );
}
