'use client';

/**
 * GolfHelm auth canvas: the flat, iOS-native sign-in treatment (2026-09 redesign).
 *
 * This replaces the old card-on-an-illustrated-scene look (GolfAuthShell) for
 * /golf/login and /golf/forgot-password. Reset-password still uses
 * GolfAuthShell until it is migrated.
 *
 *   AuthCanvas         flat `bg-canvas` page: optional top bar, app mark and
 *                      ONE title, content, and a footer pinned above the home
 *                      indicator. It sits in normal document flow
 *                      (min-height, not a fixed height with overflow hidden),
 *                      so the page can scroll when the keyboard opens.
 *   GroupedFields      iOS inset-grouped container: one radius-12 surface with
 *   GroupedFieldRow    hairline separators between 52pt rows.
 *   AuthSubmitButton   50pt, radius-12 solid accent button. It has a disabled
 *                      state and a pending state with the spinner inside the
 *                      label, and scales to 0.98 on press over 120ms.
 *   AuthFieldError     inline danger message under the group (role="alert").
 *
 * Tokens only, with no hex values, so the page follows `.dark` wherever an
 * ancestor sets it. The grouped-field pieces don't depend on auth and can be
 * promoted to `src/components/fairway/controls` as they are.
 */

import { forwardRef, type ReactNode, type InputHTMLAttributes, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { HelmMark } from '@/components/brand/HelmMark';
import { cn } from '@/lib/utils';

/* ── Canvas ─────────────────────────────────────────────────────────────── */

interface AuthCanvasProps {
  /** The single title, e.g. "Sign in". */
  title: ReactNode;
  /** Optional one-line subhead in the secondary colour. */
  subtitle?: ReactNode;
  /** Top-left slot (a quiet "Home" back link on web). */
  topBar?: ReactNode;
  /** Main content: banners, form, secondary links. */
  children: ReactNode;
  /** Pinned to the bottom above the home indicator (sign-up line and legal links). */
  footer?: ReactNode;
  /** id for the content region; the skip link targets it. */
  contentId?: string;
  /** Accessible name for the content region. */
  contentLabel?: string;
}

export function AuthCanvas({ title, subtitle, topBar, children, footer, contentId, contentLabel }: AuthCanvasProps) {
  return (
    <div
      className={cn(
        // Normal flow and min-height: when the keyboard opens, the document
        // grows (body.keyboard-open pads by --keyboard-height in native) and
        // scrolls instead of clipping the submit button under the keyboard.
        'flex min-h-[100dvh] flex-col bg-canvas font-fw-sans text-text-primary antialiased',
        // At most a 150ms fade of the whole view on first load. It is a CSS
        // keyframe, so the server-rendered HTML is visible without waiting on
        // hydration. It is removed entirely under reduced motion.
        'animate-[fade-in_150ms_ease-out] motion-reduce:animate-none',
      )}
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
        paddingRight: 'max(16px, env(safe-area-inset-right))',
      }}
    >
      <div className="flex h-11 shrink-0 items-center">{topBar}</div>

      <main
        id={contentId}
        aria-label={contentLabel}
        className="mx-auto flex w-full max-w-[400px] flex-col pt-[clamp(16px,9vh,88px)]"
      >
        <header className="flex flex-col items-center text-center">
          <HelmMark sport="golf" size={60} className="h-[60px] w-[60px]" priority />
          <h1 className="mt-5 text-title-1 font-semibold text-text-primary">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1.5 text-body text-text-secondary">{subtitle}</p>
          ) : null}
        </header>

        <div className="mt-8">{children}</div>
      </main>

      {footer ? (
        <footer className="mx-auto mt-auto flex w-full max-w-[400px] flex-col items-center pt-10">
          {footer}
        </footer>
      ) : null}
    </div>
  );
}

/* ── Inset-grouped fields ───────────────────────────────────────────────── */

export function GroupedFields({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl bg-surface',
        // Hairline separators between rows, inset from the leading edge the
        // way UITableView insets them.
        '[&>*+*]:relative [&>*+*]:before:absolute [&>*+*]:before:left-4 [&>*+*]:before:right-0 [&>*+*]:before:top-0',
        '[&>*+*]:before:h-px [&>*+*]:before:origin-top [&>*+*]:before:scale-y-50 [&>*+*]:before:bg-border-strong',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface GroupedFieldRowProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  id: string;
  /** Accessible label. It is visually hidden: the placeholder carries the visible name. */
  label: string;
  /** Trailing accessory, e.g. a show/hide password button. */
  trailing?: ReactNode;
}

export const GroupedFieldRow = forwardRef<HTMLInputElement, GroupedFieldRowProps>(function GroupedFieldRow(
  { id, label, trailing, ...inputProps },
  ref,
) {
  return (
    <div
      className={cn(
        'flex h-[52px] items-center gap-2 pl-4 pr-1.5',
        // Keyboard users on a pointer device get a visible focus indicator.
        // On touch the caret is the indicator, as it is in iOS.
        '[@media(pointer:fine)]:focus-within:[box-shadow:inset_0_0_0_2px_var(--fw-color-border-focus)]',
        !trailing && 'pr-4',
      )}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        className={cn(
          // 17px (iOS body) stays over 16px, so iOS Safari never zooms on focus.
          'h-full min-w-0 flex-1 bg-transparent text-body-lg text-text-primary caret-accent-600',
          'placeholder:text-text-tertiary focus:outline-none',
          'aria-[invalid=true]:placeholder:text-fw-danger',
        )}
        {...inputProps}
      />
      {trailing}
    </div>
  );
});

/* ── Inline error ───────────────────────────────────────────────────────── */

export function AuthFieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-2.5 px-4 text-body-sm text-fw-danger">
      {children}
    </p>
  );
}

/* ── Submit button ──────────────────────────────────────────────────────── */

/** The primary-action look, shared by AuthSubmitButton and link-styled primaries. */
export const authPrimaryButtonClass = cn(
  'relative flex h-[50px] w-full select-none items-center justify-center gap-2 rounded-xl',
  // accent-650/750 are the fills that DON'T flip in dark (see design-tokens.css).
  'bg-accent-650 text-body-lg font-semibold text-text-on-accent',
  '[@media(hover:hover)]:hover:bg-accent-750 active:bg-accent-750',
  'transition-transform duration-[120ms] ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100',
  'outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
);

interface AuthSubmitButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pending?: boolean;
  pendingLabel?: string;
  children: ReactNode;
}

export const AuthSubmitButton = forwardRef<HTMLButtonElement, AuthSubmitButtonProps>(function AuthSubmitButton(
  { pending = false, pendingLabel, disabled, children, className, type = 'submit', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      className={cn(
        authPrimaryButtonClass,
        'disabled:cursor-not-allowed disabled:active:scale-100',
        // Disabled because the form is incomplete: dimmed. Pending: stays solid.
        pending ? 'disabled:cursor-progress' : 'disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      {pending ? (
        <>
          <Loader2 className="h-[18px] w-[18px] animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <span>{pendingLabel ?? children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
});

/* ── Quiet text link styling (Forgot password?, Create an account) ─────────── */

export const authTextLinkClass =
  'inline-flex min-h-[44px] items-center rounded-lg px-2 text-body text-accent-700 ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-accent-600 [@media(hover:hover)]:hover:underline active:opacity-60';
