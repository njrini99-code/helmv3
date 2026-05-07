'use client';

/**
 * PageHeader + Eyebrow — the editorial "magazine cover" pattern.
 *
 * The brief calls for a Fraunces serif eyebrow above a Geist sans
 * display title — Rivian and NEO both use this composition to anchor
 * a hero section. Used at the top of CoachHelm command center, Player
 * Hub, Round Review, and any page that earns a true hero treatment.
 *
 * Composition:
 *   <Eyebrow>Today's CoachHelm</Eyebrow>
 *   <PageTitle>Three players need attention before practice.</PageTitle>
 *   <PageSubtitle>Tap the player to open the prescribed plan.</PageSubtitle>
 *
 * Or use the convenience compound:
 *   <PageHeader eyebrow="Today's CoachHelm" title="…" subtitle="…" />
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

interface EyebrowProps extends React.HTMLAttributes<HTMLParagraphElement> {
  /** Optional accent dot color before the eyebrow text. Use semantic tokens. */
  accent?: 'primary' | 'sage' | 'amber' | 'rose' | 'none';
}

/**
 * Editorial eyebrow — Fraunces serif, uppercase, 11px, 0.16em tracking.
 * The serif companion is the only legitimate place serifs appear in the
 * product chrome; everything else is Geist.
 */
export const Eyebrow = React.forwardRef<HTMLParagraphElement, EyebrowProps>(
  ({ className, accent = 'none', children, ...props }, ref) => (
    <p
      ref={ref}
      className={cn(
        'font-serif text-[11px] uppercase tracking-[0.16em] text-warm-500',
        'inline-flex items-center gap-2',
        className,
      )}
      {...props}
    >
      {accent !== 'none' && (
        <span
          aria-hidden
          className={cn(
            'h-1 w-1 rounded-full',
            accent === 'primary' && 'bg-primary-500',
            accent === 'sage' && 'bg-sage-600',
            accent === 'amber' && 'bg-helm-amber',
            accent === 'rose' && 'bg-rose-500',
          )}
        />
      )}
      {children}
    </p>
  ),
);
Eyebrow.displayName = 'Eyebrow';

/**
 * Display-grade page title. Geist Sans, weight 500, large + airy.
 * Letter-spacing tightens at this size to keep the editorial feel.
 */
export const PageTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h1
      ref={ref}
      className={cn(
        'font-display text-[34px] sm:text-[40px] md:text-[48px] font-medium leading-[1.05] tracking-[-0.022em] text-warm-900',
        'max-w-[28ch]',
        className,
      )}
      {...props}
    />
  ),
);
PageTitle.displayName = 'PageTitle';

/**
 * Subtitle below the page title. Warm-500, 16-18px, generous line height.
 */
export const PageSubtitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn(
        'text-[16px] sm:text-[17px] leading-[1.55] text-warm-500',
        'max-w-[52ch]',
        className,
      )}
      {...props}
    />
  ),
);
PageSubtitle.displayName = 'PageSubtitle';

interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  eyebrow?: string;
  eyebrowAccent?: EyebrowProps['accent'];
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Optional right-rail content (CTA, metadata pills) — desktop only on md+ */
  actions?: React.ReactNode;
}

/**
 * Convenience compound for the most common hero pattern. Spaces the
 * eyebrow + title + subtitle on the brief's exaggerated rhythm
 * (eyebrow → 16px → title → 12px → subtitle).
 */
export const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(
  ({ className, eyebrow, eyebrowAccent, title, subtitle, actions, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6',
        className,
      )}
      {...props}
    >
      <div className="flex flex-col gap-3">
        {eyebrow && <Eyebrow accent={eyebrowAccent}>{eyebrow}</Eyebrow>}
        <PageTitle>{title}</PageTitle>
        {subtitle && <PageSubtitle>{subtitle}</PageSubtitle>}
      </div>
      {actions && <div className="flex items-center gap-2 md:flex-shrink-0">{actions}</div>}
    </div>
  ),
);
PageHeader.displayName = 'PageHeader';
