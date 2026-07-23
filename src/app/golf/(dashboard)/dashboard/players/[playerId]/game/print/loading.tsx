/**
 * Route-level loading fallback for the print-optimized Player Game
 * Fingerprint report (`page.tsx`).
 *
 * The real page is a flat, single-column `max-w-[680px]` report on the
 * legacy `warm-*` tokens (not the Fairway `.fairway-ds` scope — this route
 * never opts into it) with a header block (eyebrow, name, meta line,
 * "Generated" line) followed by 6 bordered section cards
 * (`FINGERPRINT_SECTION_ORDER`) — no sidebar, no 2-column grid. This mirrors
 * that exact shape instead of the generic 2-column `DetailPageSkeleton`.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="max-w-[680px] mx-auto p-8"
    >
      <span className="sr-only">Loading scouting report…</span>

      {/* Header block */}
      <div>
        <div className="h-3 w-40 rounded bg-warm-100 animate-pulse" />
        <div className="mt-2 h-8 w-56 rounded bg-warm-100 animate-pulse" />
        <div className="mt-2 h-4 w-64 rounded bg-warm-100 animate-pulse" />
        <div className="mt-1 h-3 w-44 rounded bg-warm-100 animate-pulse" />
      </div>

      {/* Sections — 6 bordered cards, mirroring FINGERPRINT_SECTION_ORDER */}
      <div className="space-y-5 mt-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-warm-200 p-5">
            <div className="mb-3">
              <div className="h-3 w-6 rounded bg-warm-100 animate-pulse" />
              <div className="mt-1.5 h-4 w-40 rounded bg-warm-100 animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full rounded bg-warm-100 animate-pulse" />
              <div className="h-3 w-4/5 rounded bg-warm-100 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
