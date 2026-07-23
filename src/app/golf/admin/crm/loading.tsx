// Route-level Suspense fallback for /golf/admin/crm.
//
// The real page (page.tsx) renders its own persistent shell — a fixed dark
// mobile top bar (<lg), a fixed dark w-[260px] desktop sidebar (lg+, 8 nav
// items across Work/Automate/Admin sections), and a sticky glass top bar
// above the content area. None of that is optional chrome from a layout —
// crm/layout.tsx only renders {children} — so a generic light skeleton here
// previously caused the whole CRM chrome (dark sidebar + header) to pop in
// on mount instead of holding steady. This mirrors that shell exactly, plus
// a content-area placeholder shaped like the default "Today" work queue
// (template bar + ranked rows, matching TodayQueue's own internal loading
// skeleton) so there's no secondary shape jump once client data resolves.
export default function Loading() {
  return (
    <div className="min-h-dvh bg-cream-100 flex">
      {/* ═══════════════════ Mobile Header ═══════════════════ */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-warm-900/95 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center gap-2 px-3 h-12">
          <div className="flex-shrink-0 h-4 w-4 rounded bg-cream-50/10" />
          <div className="flex-1 h-3.5 w-24 rounded bg-cream-50/10 skeleton-shimmer" />
          <div className="flex-shrink-0 h-6 w-6 rounded-xl bg-cream-50/10" />
          <div className="flex-shrink-0 h-6 w-6 rounded-xl bg-cream-50/10" />
          <div className="flex-shrink-0 h-6 w-6 rounded-xl bg-primary-600/40" />
        </div>
      </div>

      {/* ═══════════════════ Desktop Sidebar ═══════════════════ */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 z-50 flex-col w-[260px] bg-warm-900 border-r border-white/5">
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16">
          <div className="w-9 h-9 rounded-md bg-gradient-to-br from-primary-500 to-primary-600" />
          <div className="h-4 w-24 rounded bg-cream-50/10 skeleton-shimmer" />
        </div>

        {/* Back to Dashboard */}
        <div className="px-3 mb-2">
          <div className="h-8 rounded-md bg-cream-50/5" />
        </div>

        <div className="mx-3 border-t border-white/10" />

        {/* Nav sections — Work (5), Automate (2), Admin (1), matching TABS */}
        <nav className="flex-1 px-3 py-2 space-y-4">
          {[5, 2, 1].map((count, sectionIdx) => (
            <div key={sectionIdx}>
              <div className="h-2.5 w-14 mb-1.5 mx-3 rounded bg-cream-50/5" />
              <div className="space-y-1">
                {Array.from({ length: count }).map((_, i) => (
                  <div key={i} className="h-9 rounded-md bg-cream-50/5 skeleton-shimmer" />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Action Buttons */}
        <div className="p-3 border-t border-white/10 space-y-2">
          <div className="h-10 rounded-md bg-cream-50/10" />
          <div className="flex gap-2">
            <div className="flex-1 h-8 rounded-md bg-cream-50/5" />
            <div className="flex-1 h-8 rounded-md bg-cream-50/5" />
          </div>
        </div>
      </aside>

      {/* ═══════════════════ Main Content ═══════════════════ */}
      <main className="flex-1 min-w-0 flex flex-col min-h-dvh pt-12 lg:pt-0 lg:ml-[260px]">
        {/* Top Bar */}
        <header className="sticky top-12 lg:top-0 z-30 glass-standard border-b-0 rounded-none px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <div className="h-5 w-16 rounded bg-warm-200/60 skeleton-shimmer" />
              <div className="hidden sm:block h-3.5 w-56 rounded bg-warm-100/60 skeleton-shimmer" />
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-7 w-20 rounded-full glass-standard shadow-glass-sm" />
              <div className="hidden sm:block h-7 w-24 rounded-full glass-standard shadow-glass-sm" />
            </div>
          </div>
        </header>

        {/* Content Area — default tab is "Today": template bar + ranked rows */}
        <div className="flex-1 overflow-auto p-3 sm:p-5 lg:p-6 bg-cream-100 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-6">
          <div className="space-y-4">
            <div className="h-11 rounded-2xl glass-standard" />
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl glass-standard p-3">
                  <div className="flex items-center gap-3">
                    <div className="h-7 w-7 flex-shrink-0 rounded-full bg-warm-200/60 skeleton-shimmer" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 w-40 rounded bg-warm-200/60 skeleton-shimmer" />
                      <div className="h-2.5 w-28 rounded bg-warm-100/60 skeleton-shimmer" />
                    </div>
                    <div className="h-8 w-20 rounded-xl bg-warm-100/60 skeleton-shimmer" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
