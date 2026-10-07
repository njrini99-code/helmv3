import { cn } from '@/lib/utils';

/**
 * An inline (span) loading block with the Skeleton sweep, for places a block
 * `Skeleton` (a div) would be invalid: inside the index's value token and
 * inside ViewHeader's description paragraph.
 */
export function InlineSkeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative isolate inline-block h-3.5 w-20 overflow-hidden rounded-fw-sm bg-skeleton align-middle',
        'before:absolute before:inset-0 before:bg-shimmer before:bg-[length:200%_100%] before:animate-shimmer before:content-[""]',
        'motion-reduce:before:hidden motion-reduce:before:animate-none',
        className,
      )}
    />
  );
}
