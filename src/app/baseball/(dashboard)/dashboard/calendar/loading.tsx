import { PaperCard } from '@/components/baseball/living-annual';

// Mirrors CalendarFairway's own isCoach-aware shell-height formula (its
// `SHELL_COACH` constant — see CalendarFairway.tsx's shell-height regression
// test) instead of a flat `100dvh-64px` guess. This Suspense fallback can't
// know the viewer's role before the real page's data resolves, so it uses
// the coach variant (the larger subtraction / shorter height) as the safe
// default: a player only sees a small height GROWTH once the real, taller
// player shell mounts, instead of the previous much larger shrink for every
// viewer. Two full literal strings (not template-built) so Tailwind's
// static class scanner can generate both.
const SHELL_HEIGHT_MOBILE = 'h-[calc(100dvh-var(--golf-mobile-header-offset)-45px-(2rem+56px+env(safe-area-inset-bottom,0px)))]';
const SHELL_HEIGHT_DESKTOP = 'md:h-[calc(100dvh-var(--golf-mobile-header-offset)-45px-(2rem+env(safe-area-inset-bottom,0px)))]';

export default function CalendarLoading() {
  return (
    <div className={`${SHELL_HEIGHT_MOBILE} ${SHELL_HEIGHT_DESKTOP} p-6`} style={{
      background: 'linear-gradient(180deg, #F7F5F2 0%, #F4EFE6 33%, #F1ECE0 66%, #ECE5D6 100%)',
    }}>
      <PaperCard className="h-full animate-pulse" grain={false}>
        {/* Calendar header skeleton */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100/50">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-warm-200" />
            <div className="h-5 w-32 rounded bg-warm-200" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-20 rounded-lg bg-warm-200" />
            <div className="h-9 w-9 rounded-lg bg-warm-200" />
            <div className="h-9 w-9 rounded-lg bg-warm-200" />
          </div>
        </div>

        {/* Calendar grid skeleton */}
        <div className="p-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((_day, i) => (
              <div key={i} className="text-center py-2">
                <div className="h-3 w-6 rounded bg-warm-200 mx-auto" />
              </div>
            ))}
          </div>

          {/* Calendar rows */}
          {Array.from({ length: 5 }).map((_, rowIndex) => (
            <div key={rowIndex} className="grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }).map((_, colIndex) => (
                <div
                  key={colIndex}
                  className="aspect-square rounded-lg p-2"
                >
                  <div className="h-4 w-6 rounded bg-warm-100 mb-1" />
                  {(rowIndex === 1 && colIndex === 2) || (rowIndex === 2 && colIndex === 4) || (rowIndex === 3 && colIndex === 1) ? (
                    <div className="h-3 w-full rounded bg-primary-100 mt-1" />
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      </PaperCard>
    </div>
  );
}
