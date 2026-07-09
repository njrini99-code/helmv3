import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading skeleton for Academics (Lane 3 · THE PRESSBOX, team
 * ink). Mirrors AcademicsClient's masthead + stat row + student table so
 * there is no legacy chrome flash on navigation.
 */
export default function AcademicsLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width={180} height={11} />
        <Skeleton variant="text" width={140} height={36} />
        <Skeleton className="h-[3px] w-16 rounded-full" />
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-7 lg:grid-cols-4 lg:gap-x-8">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton variant="text" width="60%" height={11} />
            <Skeleton variant="text" width="40%" height={22} />
          </div>
        ))}
      </div>

      <div className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-4">
        <Skeleton variant="text" width={160} height={18} className="mb-4" />
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton variant="circular" width={36} height={36} />
              <div className="flex-1 space-y-1.5">
                <Skeleton variant="text" width="30%" height={14} />
                <Skeleton variant="text" width="20%" height={11} />
              </div>
              <Skeleton variant="text" width={48} height={14} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
