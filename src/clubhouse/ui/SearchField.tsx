'use client';

import { Search, X } from 'lucide-react';
import { Icon } from './Icon';

/**
 * A search box: the magnifier, the field, and a clear key once there is text (Esc clears it too). On the phone it is
 * drawn 36px tall and reaches 44px to the finger, its input and clear key taking their own taps, and its text is 16px
 * so iOS doesn't zoom the page when it takes focus (CH-1815, controls.css): a page needs no reach of its own.
 */
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
