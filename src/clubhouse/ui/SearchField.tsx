'use client';

import { Search, X } from 'lucide-react';
import { Icon } from './Icon';
import { Tooltip } from './Tooltip';

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
    // The whole pill is the field's label, so a tap on the glass focuses it; the label holds its words (MAC-20: a label
    // that wrapped only the icon and the field held no text), hidden, as the placeholder already shows the prompt.
    <label className={'ch-search' + (className ? ` ${className}` : '')}>
      <span className="ch-sr-only">{label}</span>
      <Icon icon={Search} size={14} />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation();
            onChange('');
          }
          // The Search key puts the keyboard away, so the results can be read.
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        enterKeyHint="search"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="off"
      />
      {value && (
        <Tooltip>
          <button data-ctl="CTL-P000-038" type="button" className="ch-search__x" aria-label="Clear search" onClick={() => onChange('')}>
            <Icon icon={X} size={13} />
          </button>
        </Tooltip>
      )}
    </label>
  );
}
