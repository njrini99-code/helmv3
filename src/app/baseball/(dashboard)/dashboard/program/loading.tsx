import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading skeleton for Program Profile (Lane 3 · THE PRESSBOX,
 * team ink). Mirrors ProgramClient's masthead + logo/form card so there is no
 * legacy chrome flash on navigation.
 */
export default function ProgramLoading() {
  return (
    <div className="mx-auto w-full max-w-[720px] space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width={170} height={11} />
        <Skeleton variant="text" width={200} height={36} />
        <Skeleton className="h-[3px] w-16 rounded-full" />
      </div>

      <div className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-6 space-y-6">
        <div className="flex items-center gap-6">
          <Skeleton variant="rectangular" width={96} height={96} className="rounded-xl" />
          <div className="space-y-2">
            <Skeleton variant="text" width={180} height={20} />
            <Skeleton variant="text" width={120} height={14} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton variant="text" width={96} height={14} />
              <Skeleton variant="rectangular" height={40} className="rounded-lg" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <Skeleton variant="text" width={96} height={14} />
          <Skeleton variant="rectangular" height={96} className="rounded-lg" />
        </div>
      </div>
    </div>
  );
}
