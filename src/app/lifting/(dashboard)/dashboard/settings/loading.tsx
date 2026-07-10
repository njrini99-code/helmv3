// =============================================================================
// src/app/lifting/(dashboard)/dashboard/settings/loading.tsx
//
// Skeleton for the Lift Lab settings page — shown while the server resolves
// the coach/viewer row, then (for coaches) the assignment rows, org row, and
// pending invites. Mirrors settings-client.tsx's shape: page header, then the
// "Coach profile" and "Team assignments" `Section` cards (icon-box + title,
// same glass-standard/rounded-2xl chrome as the real `Section` primitive).
// =============================================================================

import { Skeleton } from '@/components/ui/skeleton';

function SectionSkeleton({
  titleWidth,
  children,
}: {
  titleWidth: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-standard border border-white/20 rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-2.5 mb-6">
        <Skeleton variant="circular" className="h-8 w-8 rounded-xl" />
        <Skeleton className={`h-4 ${titleWidth} rounded-full`} />
      </div>
      {children}
    </div>
  );
}

export default function SettingsLoading() {
  return (
    <div className="space-y-6 max-w-2xl" aria-busy="true" aria-label="Loading settings">
      {/* Page header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-32 rounded-xl" />
        <Skeleton className="h-3.5 w-64 rounded-full" />
      </div>

      {/* Coach profile */}
      <SectionSkeleton titleWidth="w-32">
        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3.5 w-20 rounded-full" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-24 rounded-full" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
          <div className="flex justify-end pt-2">
            <Skeleton className="h-10 w-32 rounded-xl" />
          </div>
        </div>
      </SectionSkeleton>

      {/* Team assignments */}
      <SectionSkeleton titleWidth="w-36">
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 glass-standard rounded-xl border border-white/20">
              <Skeleton className="h-4 w-4 rounded" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-28 rounded-full" />
                <Skeleton className="h-3 w-16 rounded-full" />
              </div>
              <Skeleton className="h-7 w-16 rounded-lg shrink-0" />
            </div>
          ))}
        </div>
      </SectionSkeleton>
    </div>
  );
}
