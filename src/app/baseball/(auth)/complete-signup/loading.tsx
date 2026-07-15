// Narrow centered `baseball-auth-field` card, matching this page's own
// BaseballAuthShell + AuthCard chrome (same as login/loading.tsx) — but
// shaped for THIS page's content (a checkmark badge, a heading, and a 2-up
// role-select grid) rather than a stacked-inputs form, instead of the
// generic dashboard-card PageLoading skeleton (mobile findings,
// onboarding-auth group).
export default function Loading() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center baseball-auth-field p-4">
      <div className="w-full max-w-md p-8 animate-pulse">
        <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-warm-200" />
        <div className="h-6 w-40 bg-warm-200 rounded mb-8 mx-auto" />
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="h-16 bg-warm-200 rounded-xl" />
          <div className="h-16 bg-warm-200 rounded-xl" />
        </div>
        <div className="h-12 bg-warm-200 rounded-lg" />
      </div>
    </div>
  );
}
