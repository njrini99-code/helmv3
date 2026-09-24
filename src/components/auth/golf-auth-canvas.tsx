'use client';

/**
 * GolfHelm auth canvas: the flat, iOS-native sign-in treatment (2026-09 redesign).
 *
 * Used by /golf/login, /golf/forgot-password and /golf/reset-password
 * (AUTH-02). The painted course scene stays behind an opaque card (OD-15).
 *
 *   AuthCanvas         the course scene, an optional top bar, the app mark,
 *                      ONE card holding the title and content, and a footer
 *                      pinned above the home indicator. It sits in normal document flow
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
import { CourseScene } from '@/components/golf/scenes/CourseScene';
import { CoastalScene } from '@/components/golf/scenes/CoastalScene';
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
        'relative isolate flex min-h-[100dvh] flex-col font-fw-sans text-text-primary antialiased',
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
      <AuthScene />

      <div className="flex h-11 shrink-0 items-center">{topBar}</div>

      <main
        id={contentId}
        aria-label={contentLabel}
        className="mx-auto flex w-full max-w-[400px] flex-col pt-[clamp(8px,5vh,56px)]"
      >
        {/* The mark sits on the scene's pale sky; everything that has to be
            read sits on the opaque card (OD-15: keep the illustration, make
            the card better). */}
        <HelmMark
          sport="golf"
          size={56}
          className="mx-auto h-14 w-14 drop-shadow-[0_2px_6px_rgb(60_40_20/0.22)]"
          priority
        />
        <div
          className={cn(
            'mt-5 rounded-3xl border border-border-subtle bg-elevated px-5 pb-6 pt-6',
            'shadow-[0_24px_48px_-12px_rgb(40_30_15/0.28),0_4px_12px_rgb(40_30_15/0.08)]',
          )}
        >
          <header className="flex flex-col items-center text-center">
            <h1 className="text-title-1 font-semibold text-text-primary">{title}</h1>
            {subtitle ? <p className="mt-1.5 text-body text-text-secondary">{subtitle}</p> : null}
          </header>

          <div className="mt-6">{children}</div>
        </div>
      </main>

      {footer ? (
        <footer className="mx-auto mt-auto flex w-full max-w-[400px] flex-col items-center pt-8">
          <div className="flex w-full flex-col items-center rounded-2xl bg-elevated px-4 py-3 shadow-[0_8px_24px_-8px_rgb(40_30_15/0.22)]">
            {footer}
          </div>
        </footer>
      ) : null}
    </div>
  );
}

/**
 * The painted course behind the card. Both scenes are server-rendered and CSS
 * picks one per breakpoint, so there is no post-hydration swap (the old
 * GolfAuthShell swapped on a media query). In dark mode a canvas scrim keeps
 * the scene as a quiet backdrop instead of a bright cream panel.
 */
function AuthScene() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-canvas">
      <CourseScene idSuffix="auth-course" className="md:hidden" />
      <CoastalScene idSuffix="auth-coastal" className="hidden md:block" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-canvas/40 dark:from-canvas/80 dark:via-canvas/85 dark:to-canvas/95" />
    </div>
  );
}

/* ── Inset-grouped fields ───────────────────────────────────────────────── */

export function GroupedFields({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl bg-surface ring-1 ring-inset ring-border-control',
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
        // An inset rounded outline, not a box-shadow, so it isn't clipped by the
        // group's overflow-hidden corners.
        'rounded-xl [@media(pointer:fine)]:focus-within:outline [@media(pointer:fine)]:focus-within:outline-2',
        '[@media(pointer:fine)]:focus-within:-outline-offset-2 [@media(pointer:fine)]:focus-within:outline-accent-600',
        !trailing && 'pr-4',
      )}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      {/* eslint-disable-next-line helm/no-raw-input -- grouped-field primitive: hairline-separated rows inside one container; <Input> brings its own border and radius */}
      <input
        ref={ref}
        id={id}
        className={cn(
          // 17px (iOS body) stays over 16px, so iOS Safari never zooms on focus.
          'h-full min-w-0 flex-1 bg-transparent text-body-lg text-text-primary caret-accent-600',
          // The ROW draws the focus indicator. Suppress the global input ring
          // (globals.css), which the group's rounded clip cut into two bars.
          'placeholder:text-text-tertiary focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
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
    <p
      id={id}
      role="alert"
      // A short shake when the error appears (MOT-18); none under reduced motion.
      className="mt-2.5 px-4 text-body-sm text-fw-danger-ink motion-safe:animate-[fw-shake_240ms_cubic-bezier(0.2,0,0,1)]"
    >
      {children}
    </p>
  );
}

/* ── Submit button ──────────────────────────────────────────────────────── */

/** The primary-action look, shared by AuthSubmitButton and link-styled primaries. */
export const authPrimaryButtonClass = cn(
  'relative flex h-[50px] w-full select-none items-center justify-center gap-2 rounded-xl',
  // The primary-action role fill (green is the contrasting colour).
  'bg-accent-fill text-body-lg font-semibold text-text-on-accent-fill',
  '[@media(hover:hover)]:hover:bg-accent-fill-hover active:bg-accent-fill-hover',
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
    // eslint-disable-next-line helm/no-raw-button -- the auth canvas primary button: full-bleed 50pt solid button with its own pending state; <Button> sizing does not fit the grouped auth form
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
  // Inline-flex with a 44px hit area; -mx-1/px-1 keeps it sitting in running text.
  'inline-flex min-h-[44px] items-center rounded-lg px-1 -mx-1 align-middle text-body text-accent-700 ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-accent-600 [@media(hover:hover)]:hover:underline active:opacity-60';
