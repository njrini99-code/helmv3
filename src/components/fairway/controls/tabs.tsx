'use client';

/**
 * ============================================================================
 * Fairway · Tabs
 * ----------------------------------------------------------------------------
 * The underline-tabs primitive — the persistent sub-nav pattern the design
 * system specifies for CoachHelm (Brief / Signals / Players / Effectiveness /
 * Ask). Distinct from Segmented: Tabs is for top-level page section navigation
 * with associated panels; Segmented is a compact inline single-select control.
 *
 * Engine: @radix-ui/react-tabs (roving focus, arrow-key nav, aria wiring,
 * panel association). The active underline is a framer-motion `layoutId` bar
 * that glides between triggers (snaps under prefers-reduced-motion).
 *
 * Composition mirrors Radix: <Tabs> · <TabsList> · <TabsTrigger> · <TabsContent>.
 * Controlled (value/onValueChange) or uncontrolled (defaultValue).
 * ========================================================================== */

import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  createContext,
  forwardRef,
  useContext,
  useId,
} from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { fwFocusRing, fwTransition } from './_internal';

/** Shares the per-Tabs layoutId so each instance animates its own indicator. */
const TabsCtx = createContext<{ indicatorId: string; reduceMotion: boolean }>({
  indicatorId: 'fw-tabs',
  reduceMotion: false,
});

export interface TabsProps extends ComponentPropsWithoutRef<typeof RadixTabs.Root> {
  children: ReactNode;
}

export const Tabs = forwardRef<HTMLDivElement, TabsProps>(function Tabs(
  { className, children, ...props },
  ref,
) {
  const indicatorId = useId();
  const reduceMotion = useReducedMotion() ?? false;
  return (
    <TabsCtx.Provider value={{ indicatorId, reduceMotion }}>
      <RadixTabs.Root ref={ref} className={cn('flex flex-col gap-6', className)} data-slot="fw-tabs" {...props}>
        {children}
      </RadixTabs.Root>
    </TabsCtx.Provider>
  );
});

export const TabsList = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RadixTabs.List>
>(function TabsList({ className, ...props }, ref) {
  return (
    <RadixTabs.List
      ref={ref}
      data-slot="fw-tabs-list"
      className={cn(
        'relative flex items-center gap-1 border-b border-border-subtle',
        // horizontal scroll on overflow without a visible scrollbar (mobile-safe)
        'overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
      {...props}
    />
  );
});

export interface TabsTriggerProps extends ComponentPropsWithoutRef<typeof RadixTabs.Trigger> {
  children: ReactNode;
}

export const TabsTrigger = forwardRef<HTMLButtonElement, TabsTriggerProps>(function TabsTrigger(
  { className, children, value, ...props },
  ref,
) {
  const { indicatorId, reduceMotion } = useContext(TabsCtx);
  return (
    <RadixTabs.Trigger
      ref={ref}
      value={value}
      data-slot="fw-tabs-trigger"
      className={cn(
        'group relative -mb-px inline-flex select-none items-center gap-2 whitespace-nowrap',
        'px-3.5 pb-3 pt-2 font-fw-sans text-[13px] font-medium leading-4',
        'text-text-secondary hover:text-text-primary',
        // active state via Radix data-attr
        'data-[state=active]:text-text-primary',
        fwTransition,
        fwFocusRing,
        'focus-visible:rounded-fw-sm',
        'disabled:opacity-40 disabled:pointer-events-none',
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      {/* Active underline indicator — glides between triggers. The data-state
          selector renders it only under the active trigger; layoutId makes the
          single bar appear to slide. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-2 bottom-0 hidden h-[2px] group-data-[state=active]:block"
      >
        <motion.span
          layoutId={reduceMotion ? undefined : `fw-tab-indicator-${indicatorId}`}
          className="absolute inset-0 rounded-full bg-accent-500"
          transition={
            reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 38, mass: 0.6 }
          }
        />
      </span>
    </RadixTabs.Trigger>
  );
});

export const TabsContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RadixTabs.Content>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <RadixTabs.Content
      ref={ref}
      data-slot="fw-tabs-content"
      className={cn(
        'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:rounded-card',
        // gentle crossfade in (opacity only — never AnimatePresence mode="wait")
        'data-[state=active]:animate-fade-in motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
});
