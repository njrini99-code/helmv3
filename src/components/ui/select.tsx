'use client';

import { useState, useRef, useEffect, useCallback, useId, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { IconChevronDown, IconCheck } from '@/components/icons';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared portal-positioning helpers for Select + MultiSelect below. Both
// dropdowns render via createPortal(document.body) instead of in normal flow
// so they escape any overflow-hidden/transformed ancestor (the settings-page
// clipping bug) — `position: fixed` + a rect computed from the trigger's
// getBoundingClientRect() replaces the old "absolute inside a relative
// wrapper" trick, with a viewport-aware flip so the dropdown opens upward
// when there isn't room below.
// ─────────────────────────────────────────────────────────────────────────────
interface DropdownRect {
  left: number;
  width: number;
  placement: 'bottom' | 'top';
  top?: number;
  bottom?: number;
}

const DROPDOWN_GAP = 4;
// max-h-60 (240px) list + search row/padding headroom for the flip decision.
const DROPDOWN_EST_HEIGHT = 260;

function computeDropdownRect(trigger: HTMLElement): DropdownRect {
  const rect = trigger.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const spaceBelow = viewportHeight - rect.bottom;
  const spaceAbove = rect.top;
  const placement: 'bottom' | 'top' =
    spaceBelow < DROPDOWN_EST_HEIGHT && spaceAbove > spaceBelow ? 'top' : 'bottom';
  return placement === 'bottom'
    ? { left: rect.left, width: rect.width, placement, top: rect.bottom + DROPDOWN_GAP }
    : { left: rect.left, width: rect.width, placement, bottom: viewportHeight - rect.top + DROPDOWN_GAP };
}

function dropdownRectStyle(rect: DropdownRect): React.CSSProperties {
  return {
    left: rect.left,
    width: rect.width,
    top: rect.placement === 'bottom' ? rect.top : undefined,
    bottom: rect.placement === 'top' ? rect.bottom : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The caller's `className` is forwarded to the trigger button in full (as it
// always was, pre-portal-fix) *and* — as a subset — to the outer wrapper div,
// which is the actual flex/grid participant in a consumer's row layout. Only
// this subset goes to the wrapper: utilities describing how much horizontal
// space the Select occupies (width, min/max-width, flex-basis/grow/shrink).
// Everything else (padding, background, border-radius, text size, focus
// rings, etc.) stays scoped to the button only, exactly as before the
// wrapper started receiving any className at all — otherwise a utility meant
// for the button's own visual treatment (e.g. DiscoverView's compact
// `min-h-0 px-3 py-1.5` "Sort:" select, or Fairway's `fwInputCls` recipe)
// leaks onto the wrapper as unwanted padding/background around the whole
// label + trigger + hint/error stack. See select.test.tsx for the regression
// guard.
// ─────────────────────────────────────────────────────────────────────────────
const WIDTH_SIZING_PREFIXES = ['w-', 'min-w-', 'max-w-', 'basis-', 'flex-', 'grow-', 'shrink-'];
const WIDTH_SIZING_EXACT = new Set(['grow', 'shrink']);

function isWidthSizingClass(token: string): boolean {
  // Strip a responsive/state variant (e.g. `sm:`, `hover:`) before matching.
  const base = token.includes(':') ? token.slice(token.lastIndexOf(':') + 1) : token;
  return WIDTH_SIZING_EXACT.has(base) || WIDTH_SIZING_PREFIXES.some((prefix) => base.startsWith(prefix));
}

function widthSizingClasses(className?: string): string {
  if (!className) return '';
  return className
    .split(/\s+/)
    .filter((token) => token && isWidthSizingClass(token))
    .join(' ');
}

interface SelectProps {
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
  searchable?: boolean;
  clearable?: boolean;
}

export function Select({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  label,
  error,
  hint,
  disabled = false,
  className,
  searchable = false,
  clearable = false,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dropdownRect, setDropdownRect] = useState<DropdownRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerId = useId();
  const listboxId = `${triggerId}-listbox`;

  const selectedOption = options.find((opt) => opt.value === value);

  const filteredOptions = searchable && searchQuery
    ? options.filter((opt) =>
        opt.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : options;

  const updateDropdownRect = useCallback(() => {
    if (triggerRef.current) setDropdownRect(computeDropdownRect(triggerRef.current));
  }, []);

  // Handle open/close with animation
  const openDropdown = useCallback(() => {
    updateDropdownRect();
    setIsOpen(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsAnimating(true));
    });
  }, [updateDropdownRect]);

  // Track the close-animation timeout so unmount can cancel it — the previous
  // `return () => clearTimeout(timer)` from inside the useCallback body was a
  // no-op (nothing consumed the returned cleanup), so unmounting mid-close
  // fired setState after teardown (jsdom: "window is not defined").
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeDropdown = useCallback(() => {
    setIsAnimating(false);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setIsOpen(false);
      setSearchQuery('');
      setDropdownRect(null);
    }, 150);
  }, []);
  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  // Close on outside click — must also check the portaled dropdown, which
  // lives outside containerRef in the DOM once mounted at document.body.
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideTrigger = containerRef.current?.contains(target);
      const insideDropdown = dropdownRef.current?.contains(target);
      if (!insideTrigger && !insideDropdown) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeDropdown]);

  // Keep the portaled dropdown anchored to the trigger while open — fixed
  // positioning doesn't track the trigger automatically the way the old
  // absolute-in-normal-flow dropdown did. Capture-phase scroll so it also
  // catches scrolling inside an ancestor card, not just the window.
  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('scroll', updateDropdownRect, true);
    window.addEventListener('resize', updateDropdownRect);
    return () => {
      window.removeEventListener('scroll', updateDropdownRect, true);
      window.removeEventListener('resize', updateDropdownRect);
    };
  }, [isOpen, updateDropdownRect]);

  // Reset highlighted index when filtered options change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredOptions.length]);

  // Focus input when opened in searchable mode
  useEffect(() => {
    if (isOpen && searchable && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, searchable]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlighted = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlighted) {
        highlighted.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (disabled) return;

      switch (event.key) {
        case 'Enter':
        case ' ':
          event.preventDefault();
          if (!isOpen) {
            openDropdown();
          } else if (filteredOptions[highlightedIndex] && !filteredOptions[highlightedIndex].disabled) {
            onChange?.(filteredOptions[highlightedIndex].value);
            closeDropdown();
          }
          break;
        case 'ArrowDown':
          event.preventDefault();
          if (!isOpen) {
            openDropdown();
          } else {
            setHighlightedIndex((prev) =>
              prev < filteredOptions.length - 1 ? prev + 1 : prev
            );
          }
          break;
        case 'ArrowUp':
          event.preventDefault();
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case 'Escape':
          closeDropdown();
          break;
        case 'Tab':
          closeDropdown();
          break;
      }
    },
    [disabled, isOpen, filteredOptions, highlightedIndex, onChange, openDropdown, closeDropdown]
  );

  const handleOptionClick = (option: SelectOption) => {
    if (option.disabled) return;
    onChange?.(option.value);
    closeDropdown();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.('');
  };

  /**
   * `!disabled` is load-bearing, not tidying.
   *
   * The clear control used to render INSIDE the trigger <button>. Browsers
   * suppress pointer events on the entire subtree of a disabled button, so a
   * disabled select's clear affordance was unclickable for free. Now that the
   * control is a sibling of the trigger (it has to be — interactive content
   * cannot nest inside a button), nothing suppresses it, and a disabled select
   * would have become clearable. This restores the previous behaviour.
   */
  const showClear = Boolean(clearable && value && !disabled);

  return (
    <div className={cn('w-full', widthSizingClasses(className))} ref={containerRef}>
      {label && (
        <label htmlFor={triggerId} className="block text-sm font-medium text-warm-700 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          id={triggerId}
          onClick={() => !disabled && (isOpen ? closeDropdown() : openDropdown())}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          className={cn(
            'w-full min-h-[48px] [@media(pointer:coarse)]:min-h-[44px] px-4 rounded-xl border bg-cream-50/92 text-base lg:text-sm text-left',
            'flex items-center justify-between gap-2',
            'transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500',
            'focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-2',
            'disabled:bg-warm-50 disabled:text-warm-400 disabled:cursor-not-allowed',
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
              : 'border-warm-200 hover:border-warm-300',
            isOpen && !error && 'ring-2 ring-primary-500/30 border-primary-500',
            // Reserve room for the clear control, which is a SIBLING of this
            // button rather than a child — see the note below it.
            showClear && 'pr-11',
            className
          )}
        >
          <span className={cn(
            'truncate flex items-center gap-2',
            selectedOption ? 'text-warm-900' : 'text-warm-400'
          )}>
            {selectedOption?.icon && <span className="flex-shrink-0">{selectedOption.icon}</span>}
            {selectedOption?.label || placeholder}
          </span>
          <div className="flex items-center gap-1">
            <IconChevronDown
              size={16}
              className={cn(
                'text-warm-400 transition-transform duration-200 flex-shrink-0',
                isOpen && 'rotate-180'
              )}
            />
          </div>
        </button>

        {/*
          The clear control is a SIBLING of the trigger, not a child of it.
          It used to be rendered inside the trigger <button>, which is invalid
          HTML — interactive content may not nest inside a <button>. That is
          not a lint nitpick: during SSR the browser's parser SPLITS the outer
          button when it meets the inner one, so the DOM it builds differs from
          the tree React expects, and hydration mismatches (#418/#425).
          Positioned absolutely over the trigger's right edge, just inside the
          chevron, with `pr-11` above reserving the space so long labels do not
          run underneath it.

          `stopPropagation` is still required: the control sits visually on top
          of the trigger, and without it a click would also toggle the dropdown.
        */}
        {showClear && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-9 top-1/2 z-[1] -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-warm-400 hover:text-warm-600 hover:bg-warm-100 transition-colors cursor-pointer bg-transparent border-0 p-0"
            aria-label="Clear selection"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Dropdown — portaled to document.body so it always escapes any
            overflow-hidden/transformed ancestor (e.g. a settings-page card)
            instead of being clipped in place. */}
        {isOpen && dropdownRect && createPortal(
          <div
            ref={dropdownRef}
            id={listboxId}
            className={cn(
              'fixed z-50 bg-white rounded-[14px] border border-warm-200 shadow-lg overflow-hidden',
              'transition-[opacity,transform] duration-150 ease-out',
              dropdownRect.placement === 'top' ? 'origin-bottom' : 'origin-top',
              isAnimating
                ? 'opacity-100 scale-y-100 translate-y-0'
                : dropdownRect.placement === 'top'
                  ? 'opacity-0 scale-y-95 translate-y-1'
                  : 'opacity-0 scale-y-95 -translate-y-1'
            )}
            style={dropdownRectStyle(dropdownRect)}
          >
            {searchable && (
              <div className="p-2 border-b border-warm-100">
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search..."
                  className="w-full h-10 px-3 rounded-lg border border-warm-200 text-base lg:text-sm
                             focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30
                             focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-2
                             transition-colors duration-200"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="search"
                />
              </div>
            )}
            <div ref={listRef} className="max-h-60 overflow-y-auto py-1" role="listbox">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-6 text-sm text-warm-400 text-center">
                  No options found
                </div>
              ) : (
                filteredOptions.map((option, index) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    onClick={() => handleOptionClick(option)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    disabled={option.disabled}
                    className={cn(
                      'w-full min-h-[44px] px-3 py-2 text-base lg:text-sm text-left flex items-center justify-between gap-2',
                      'transition-colors duration-100',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-2',
                      option.disabled
                        ? 'text-warm-300 cursor-not-allowed'
                        : 'text-warm-700',
                      highlightedIndex === index && !option.disabled && 'bg-warm-50',
                      option.value === value && 'text-primary-600 font-medium bg-primary-50/50'
                    )}
                  >
                    <span className="truncate flex items-center gap-2">
                      {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
                      {option.label}
                    </span>
                    {option.value === value && (
                      <span className="flex-shrink-0 animate-scale-in">
                        <IconCheck size={16} className="text-primary-600" />
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
      </div>
      {hint && !error && (
        <p className="mt-1.5 text-xs text-warm-500">{hint}</p>
      )}
      {error && (
        <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1 animate-fade-in">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

// Multi-select variant
interface MultiSelectProps {
  options: SelectOption[];
  value?: string[];
  onChange?: (value: string[]) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
  maxDisplayed?: number;
}

export function MultiSelect({
  options,
  value = [],
  onChange,
  placeholder = 'Select options',
  label,
  error,
  hint,
  disabled = false,
  className,
  maxDisplayed = 2,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<DropdownRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerId = useId();
  const listboxId = `${triggerId}-listbox`;

  const selectedOptions = options.filter((opt) => value.includes(opt.value));

  const updateDropdownRect = useCallback(() => {
    if (triggerRef.current) setDropdownRect(computeDropdownRect(triggerRef.current));
  }, []);

  const openDropdown = useCallback(() => {
    updateDropdownRect();
    setIsOpen(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsAnimating(true));
    });
  }, [updateDropdownRect]);

  const closeDropdown = useCallback(() => {
    setIsAnimating(false);
    const timer = setTimeout(() => {
      setIsOpen(false);
      setDropdownRect(null);
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // Close on outside click — must also check the portaled dropdown, which
  // lives outside containerRef in the DOM once mounted at document.body.
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideTrigger = containerRef.current?.contains(target);
      const insideDropdown = dropdownRef.current?.contains(target);
      if (!insideTrigger && !insideDropdown) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeDropdown]);

  // Keep the portaled dropdown anchored to the trigger while open (see the
  // matching effect + comment in Select above).
  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('scroll', updateDropdownRect, true);
    window.addEventListener('resize', updateDropdownRect);
    return () => {
      window.removeEventListener('scroll', updateDropdownRect, true);
      window.removeEventListener('resize', updateDropdownRect);
    };
  }, [isOpen, updateDropdownRect]);

  const handleToggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange?.(value.filter((v) => v !== optionValue));
    } else {
      onChange?.([...value, optionValue]);
    }
  };

  const displayText = () => {
    if (selectedOptions.length === 0) return placeholder;
    if (selectedOptions.length <= maxDisplayed) {
      return selectedOptions.map((o) => o.label).join(', ');
    }
    return `${selectedOptions.slice(0, maxDisplayed).map((o) => o.label).join(', ')} +${selectedOptions.length - maxDisplayed}`;
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.([]);
  };

  /** Sibling-not-child, and `!disabled` for the same reasons as Select above. */
  const showClearAll = value.length > 0 && !disabled;

  return (
    <div className={cn('w-full', widthSizingClasses(className))} ref={containerRef}>
      {label && (
        <label htmlFor={triggerId} className="block text-sm font-medium text-warm-700 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          id={triggerId}
          onClick={() => !disabled && (isOpen ? closeDropdown() : openDropdown())}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          className={cn(
            'w-full min-h-[48px] [@media(pointer:coarse)]:min-h-[44px] px-4 rounded-xl border bg-cream-50/92 text-base lg:text-sm text-left',
            'flex items-center justify-between gap-2',
            'transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500',
            'focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-2',
            'disabled:bg-warm-50 disabled:text-warm-400 disabled:cursor-not-allowed',
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
              : 'border-warm-200 hover:border-warm-300',
            isOpen && !error && 'ring-2 ring-primary-500/30 border-primary-500',
            showClearAll && 'pr-11',
            className
          )}
        >
          <span className={cn(
            'truncate',
            selectedOptions.length > 0 ? 'text-warm-900' : 'text-warm-400'
          )}>
            {displayText()}
          </span>
          <div className="flex items-center gap-1">
            <IconChevronDown
              size={16}
              className={cn(
                'text-warm-400 transition-transform duration-200 flex-shrink-0',
                isOpen && 'rotate-180'
              )}
            />
          </div>
        </button>

        {/* Sibling, not child — see the note on Select's clear control above. */}
        {showClearAll && (
          <button
            type="button"
            onClick={handleClearAll}
            className="absolute right-9 top-1/2 z-[1] -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-warm-400 hover:text-warm-600 hover:bg-warm-100 transition-colors cursor-pointer bg-transparent border-0 p-0"
            aria-label="Clear all selections"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Dropdown — portaled to document.body (see the matching comment
            in Select above). */}
        {isOpen && dropdownRect && createPortal(
          <div
            ref={dropdownRef}
            id={listboxId}
            className={cn(
              'fixed z-50 bg-white rounded-[14px] border border-warm-200 shadow-lg overflow-hidden',
              'transition-[opacity,transform] duration-150 ease-out',
              dropdownRect.placement === 'top' ? 'origin-bottom' : 'origin-top',
              isAnimating
                ? 'opacity-100 scale-y-100 translate-y-0'
                : dropdownRect.placement === 'top'
                  ? 'opacity-0 scale-y-95 translate-y-1'
                  : 'opacity-0 scale-y-95 -translate-y-1'
            )}
            style={dropdownRectStyle(dropdownRect)}
          >
            <div className="max-h-60 overflow-y-auto py-1" role="listbox" aria-multiselectable="true">
              {options.map((option) => {
                const isSelected = value.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleToggle(option.value)}
                    disabled={option.disabled}
                    className={cn(
                      'w-full min-h-[44px] px-3 py-2 text-base lg:text-sm text-left flex items-center gap-3',
                      'transition-colors duration-100',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-2',
                      option.disabled
                        ? 'text-warm-300 cursor-not-allowed'
                        : 'text-warm-700 hover:bg-warm-50',
                      isSelected && 'bg-primary-50/30'
                    )}
                  >
                    <div className={cn(
                      'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors duration-200',
                      isSelected
                        ? 'bg-primary-600 border-primary-600 scale-100'
                        : 'border-warm-300 scale-100 hover:border-warm-400'
                    )}
                    style={{
                      transition: 'all 200ms cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                    }}
                    >
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M4 10l3 3 8-8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span className="truncate">{option.label}</span>
                  </button>
                );
              })}
            </div>
            {value.length > 0 && (
              <div className="border-t border-warm-100 px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-warm-500">{value.length} selected</span>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-2"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
      </div>
      {hint && !error && (
        <p className="mt-1.5 text-xs text-warm-500">{hint}</p>
      )}
      {error && (
        <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1 animate-fade-in">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

// Native select for simple cases (backwards compatibility)
interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, label, error, hint, options, placeholder, children, id, ...props }, ref) => {
  const generatedId = useId();
  const selectId = id || generatedId;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-warm-700 mb-1.5">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={cn(
          'w-full min-h-[48px] px-4 rounded-xl border bg-cream-50/92 text-warm-900 text-base lg:text-sm',
          'transition-all duration-200 appearance-none cursor-pointer',
          'focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500',
          'focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-2',
          'disabled:bg-warm-50 disabled:text-warm-400 disabled:cursor-not-allowed',
          error
            ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
            : 'border-warm-200 hover:border-warm-300',
          className
        )}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23a8a29e' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
          backgroundPosition: 'right 0.5rem center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '1.5em 1.5em',
          paddingRight: '2.5rem',
        }}
        {...props}
      >
        {placeholder && (
          <option value="" className="text-warm-400">
            {placeholder}
          </option>
        )}
        {options
          ? options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))
          : children}
      </select>
      {hint && !error && (
        <p className="mt-1.5 text-xs text-warm-500">{hint}</p>
      )}
      {error && (
        <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1 animate-fade-in">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
  }
);
NativeSelect.displayName = 'NativeSelect';
