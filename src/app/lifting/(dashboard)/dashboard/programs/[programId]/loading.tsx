// =============================================================================
// src/app/lifting/(dashboard)/dashboard/programs/[programId]/loading.tsx
//
// Skeleton loader for the program editor — shown while the server fetches
// the full program tree. Mirrors the editor layout (left rail + right pane)
// with animated pulse skeletons.
// =============================================================================

export default function ProgramEditorLoading() {
  return (
    <div className="flex h-full min-h-[600px] gap-6 p-6 animate-pulse">
      {/* Left rail — week/day tree skeleton */}
      <div className="w-72 shrink-0 space-y-3">
        <div className="h-8 w-40 rounded-lg bg-warm-200" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, wi) => (
            <div key={wi} className="rounded-xl border border-warm-100 bg-white/70 p-3 space-y-2">
              <div className="h-4 w-24 rounded bg-warm-200" />
              <div className="ml-3 space-y-1.5">
                {Array.from({ length: 3 }).map((_, di) => (
                  <div key={di} className="h-3 w-32 rounded bg-warm-100" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right pane — day editor skeleton */}
      <div className="flex-1 space-y-4">
        <div className="h-10 w-64 rounded-xl bg-warm-200" />
        <div className="rounded-2xl border border-white/20 bg-white/70 backdrop-blur-xl p-6 space-y-4">
          <div className="h-5 w-32 rounded bg-warm-200" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-warm-100 bg-warm-50 p-4 space-y-2">
              <div className="h-4 w-48 rounded bg-warm-200" />
              <div className="h-3 w-full rounded bg-warm-100" />
              <div className="h-3 w-3/4 rounded bg-warm-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
