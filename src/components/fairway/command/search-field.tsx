'use client';

/**
 * ============================================================================
 * Fairway · command · SearchField (keyboard-first search input)
 * ----------------------------------------------------------------------------
 * The canonical warm-matte search input — the inline half of the
 * find-and-act pair (DESIGN-SYSTEM.md §6 "SearchField / CommandMenu":
 * "`surface-sunken` search track + `⌘K` hint").
 *
 * Why a native <input>: a text field's correct "headless behavior" IS the
 * platform element — it gives us caret, IME/composition, selection, type-ahead,
 * a11y name/role, and form semantics for free. We layer the warm Fairway skin,
 * a leading search affordance, an optional ⌘K hint (when this field is the entry
 * point to the palette), a clearable affordance, and a loading shimmer on top.
 *
 * Surfaces / tokens used (all Fairway):
 *  - track:    bg-inset (surface-sunken), border-border-subtle, rounded-fw-sm
 *  - text:     text-text-primary; placeholder text-text-tertiary
 *  - focus:    visible green ring via border-focus (survives cream) + accent border
 *  - hover:    border-border-strong, subtle warmth
 *  - active:   translate-y-[0.5px]
 *  - disabled: opacity-50, no hover
 *  - font:     font-fw-sans body; label size for the control text
 *
 * States covered: default / hover / focus-visible / active / disabled / loading
 * / empty (placeholder) / value (clear affordance appears).
 * ============================================================================
 */

import {
  forwardRef,
  useId,
  useRef,
  useImperativeHandle,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import { SearchGlyph } from './icons';

type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'size' | 'type' | 'prefix'
>;

export interface SearchFieldProps extends NativeInputProps {
  /** Visual size. `md` is the default inline field; `lg` for hero/toolbar; `sm` for dense rows. */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Show a trailing keyboard hint chip (e.g. the ⌘K affordance when this field
   * opens the CommandMenu). Pass `true` for the default "⌘K", or a node to
   * customize. Hidden once the field has focus or a value so it never clutters.
   */
  hint?: boolean | ReactNode;
  /** Replace the leading search glyph (decorative). */
  leadingIcon?: ReactNode;
  /** Loading state — shows a quiet track shimmer instead of a spinner. */
  loading?: boolean;
  /**
   * When the field has a value, render a clear (×) button. Requires a controlled
   * `value` + `onClear` to take effect. Default `true`.
   */
  clearable?: boolean;
  /** Called when the clear affordance is pressed; you own state, so you clear it. */
  onClear?: () => void;
  /** Accessible label when there is no visible label element. Default "Search". */
  'aria-label'?: string;
  /** Extra classes for the outer track wrapper (the input itself stays clean). */
  wrapperClassName?: string;
}

const SIZES = {
  sm: { track: 'h-9 gap-2 pl-2.5 pr-2', text: 'text-body-sm', icon: 'h-4 w-4' },
  md: { track: 'h-11 gap-2.5 pl-3 pr-2.5', text: 'text-body', icon: 'h-[18px] w-[18px]' },
  lg: { track: 'h-12 gap-3 pl-3.5 pr-3', text: 'text-body', icon: 'h-5 w-5' },
} as const;

/**
 * SearchField — warm matte keyboard-first search input. Forwards its ref to the
 * underlying <input> (focus/select/clear from a parent, e.g. a toolbar shortcut).
 */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(
  function SearchField(
    {
      size = 'md',
      hint = false,
      leadingIcon,
      loading = false,
      clearable = true,
      onClear,
      className,
      wrapperClassName,
      disabled,
      value,
      defaultValue,
      id,
      ...rest
    },
    forwardedRef,
  ) {
    const innerRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(forwardedRef, () => innerRef.current as HTMLInputElement, []);

    const autoId = useId();
    const inputId = id ?? `fw-search-${autoId}`;
    const s = SIZES[size];

    const hasValue =
      value !== undefined
        ? String(value).length > 0
        : defaultValue !== undefined
          ? String(defaultValue).length > 0
          : false;

    const showHint = hint !== false && !hasValue;
    const showClear = clearable && hasValue && !!onClear && !disabled;
    const ariaLabel = rest['aria-label'] ?? 'Search';

    const hintNode =
      hint === true ? (
        <kbd
          aria-hidden="true"
          className={cn(
            'pointer-events-none hidden select-none items-center gap-0.5 rounded-fw-sm border border-border-subtle',
            'bg-surface px-1.5 py-0.5 font-fw-mono text-eyebrow font-medium leading-none tracking-normal text-text-tertiary sm:inline-flex',
          )}
        >
          <span aria-hidden="true">⌘</span>K
        </kbd>
      ) : (
        hint
      );

    return (
      <div
        data-slot="search-field"
        data-loading={loading || undefined}
        data-disabled={disabled || undefined}
        className={cn(
          'group relative isolate flex items-center rounded-fw-sm',
          'bg-inset text-text-primary',
          'border border-border-subtle',
          'transition-[border-color,box-shadow,background-color,transform] [transition-duration:180ms] [transition-timing-function:cubic-bezier(0.22,0.61,0.36,1)]',
          // hover (no layout shift)
          'hover:border-border-strong',
          // focus-within = the visible green ring that survives cream (WCAG)
          'focus-within:border-border-focus focus-within:ring-2 focus-within:ring-border-focus focus-within:ring-offset-2 focus-within:ring-offset-canvas',
          // active press
          'has-[:active]:translate-y-[0.5px]',
          // disabled
          disabled && 'pointer-events-none opacity-50',
          s.track,
          wrapperClassName,
        )}
      >
        {/* Leading search affordance (decorative; input owns the name). */}
        <span
          aria-hidden="true"
          className={cn(
            'flex shrink-0 items-center justify-center text-text-tertiary',
            'transition-colors [transition-duration:180ms] group-focus-within:text-accent-600',
            s.icon,
          )}
        >
          {leadingIcon ?? <SearchGlyph className="h-full w-full" />}
        </span>

        {/* This primitive IS the canonical Fairway search input — it cannot
            consume the legacy `@/components/ui` Input without coupling to the
            old aesthetic it replaces. The native <input> is the correct
            headless element for a text field (caret/IME/selection/a11y free). */}
        {/* eslint-disable-next-line helm/no-raw-input */}
        <input
          ref={innerRef}
          id={inputId}
          type="search"
          inputMode="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          value={value}
          defaultValue={defaultValue}
          aria-label={ariaLabel}
          className={cn(
            'peer min-w-0 flex-1 bg-transparent font-fw-sans text-text-primary',
            'placeholder:text-text-tertiary',
            'outline-none focus:outline-none focus-visible:outline-none',
            // strip the native search clear/cancel decorations (we provide our own)
            '[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none',
            s.text,
            className,
          )}
          {...rest}
        />

        {/* Clear affordance — appears once there's a value (controlled). A tiny
            tabIndex={-1} in-field affordance; the heavy legacy Button would be
            wrong inside an input track, so a raw <button> is intentional. */}
        {showClear ? (
          // eslint-disable-next-line helm/no-raw-button
          <button
            type="button"
            tabIndex={-1}
            aria-label="Clear search"
            onClick={() => {
              onClear?.();
              innerRef.current?.focus();
            }}
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-tertiary',
              'transition-colors [transition-duration:180ms] hover:bg-surface hover:text-text-secondary',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
              'active:translate-y-[0.5px]',
            )}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        ) : null}

        {/* Keyboard hint chip — hidden on focus/value so it never clutters. */}
        {showHint ? <span className="shrink-0">{hintNode}</span> : null}

        {/* Loading shimmer — quiet track sweep, NOT a spinner (per §7.3). */}
        {loading ? (
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-0 overflow-hidden rounded-fw-sm',
              'motion-reduce:hidden',
            )}
          >
            <span className="absolute inset-y-0 -left-1/2 w-1/2 animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-accent-100/40 to-transparent" />
          </span>
        ) : null}
      </div>
    );
  },
);
