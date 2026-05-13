'use client';

/**
 * Drawer — vaul-backed responsive sheet styled to the California-modern
 * recipe.
 *
 * On mobile: iOS-grade bottom sheet with rubber-band drag, handle bar,
 * and momentum dismiss. On desktop: vaul still wraps it, so we get the
 * same focus-trap + scroll-lock behavior but rendered as a centered
 * matte panel (caller controls width via `className`).
 *
 * Use this instead of hand-rolled fixed-position dialogs for any
 * surface that benefits from drag-to-dismiss or feels like a "sheet"
 * conceptually (forms, detail views, multi-step flows, drill cards).
 */

import * as React from 'react';
import { Drawer as VaulDrawer } from 'vaul';
import { cn } from '@/lib/utils';

const Drawer = ({
  shouldScaleBackground = true,
  ...props
}: React.ComponentProps<typeof VaulDrawer.Root>) => (
  <VaulDrawer.Root shouldScaleBackground={shouldScaleBackground} {...props} />
);
Drawer.displayName = 'Drawer';

const DrawerTrigger = VaulDrawer.Trigger;
const DrawerPortal = VaulDrawer.Portal;
const DrawerClose = VaulDrawer.Close;

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Overlay>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Overlay>
>(({ className, ...props }, ref) => (
  <VaulDrawer.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-warm-900/35 backdrop-blur-[2px]', className)}
    {...props}
  />
));
DrawerOverlay.displayName = VaulDrawer.Overlay.displayName;

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Content>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Content>
>(({ className, children, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <VaulDrawer.Content
      ref={ref}
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto max-h-[92vh] flex-col rounded-t-3xl',
        'surface-stone',
        // Desktop center-mode: when the parent uses Drawer.Root with
        // direction="bottom" (default) on desktop, callers can override
        // via className with sm:* utilities (e.g. sm:rounded-3xl
        // sm:max-w-2xl sm:mx-auto sm:bottom-1/2 sm:tranwarm-y-1/2)
        className,
      )}
      {...props}
    >
      {/* Handle bar — iOS sheet motif */}
      <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-warm-300/65" aria-hidden />
      {children}
    </VaulDrawer.Content>
  </DrawerPortal>
));
DrawerContent.displayName = 'DrawerContent';

const DrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col gap-1.5 px-6 pt-5 pb-4 text-left', className)}
    {...props}
  />
);
DrawerHeader.displayName = 'DrawerHeader';

const DrawerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('mt-auto flex flex-col gap-2 px-6 py-4', className)}
    {...props}
  />
);
DrawerFooter.displayName = 'DrawerFooter';

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Title>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Title>
>(({ className, ...props }, ref) => (
  <VaulDrawer.Title
    ref={ref}
    className={cn(
      'text-[22px] md:text-[26px] font-medium tracking-[-0.022em] text-warm-900',
      className,
    )}
    {...props}
  />
));
DrawerTitle.displayName = VaulDrawer.Title.displayName;

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Description>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Description>
>(({ className, ...props }, ref) => (
  <VaulDrawer.Description
    ref={ref}
    className={cn('text-[13px] text-warm-500 leading-relaxed', className)}
    {...props}
  />
));
DrawerDescription.displayName = VaulDrawer.Description.displayName;

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
