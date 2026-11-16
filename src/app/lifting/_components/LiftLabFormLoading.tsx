import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading state for Lift Lab's sign-in, onboarding and join pages (GAP-R-18). Each of them is one centred form card
 * on a full-height page, so this holds that shape: a heading, two fields and the button.
 */
export function LiftLabFormLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="flex min-h-dvh items-center justify-center p-4 sm:p-6">
      <span className="sr-only">{label}</span>
      <div className="flex w-full max-w-md flex-col gap-4">
        <Skeleton className="mx-auto h-12 w-12 rounded-2xl" />
        <Skeleton className="mx-auto h-7 w-48 rounded-xl" />
        <Skeleton className="mx-auto h-4 w-64 rounded-full" />
        <Skeleton className="mt-4 h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="mt-2 h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}
