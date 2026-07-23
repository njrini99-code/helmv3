/**
 * Route-level loading fallback for /golf/welcome. Mirrors the real page's
 * shell exactly — full-height (100svh) warm gradient, vertically centered,
 * no form/card chrome — plus a small centered shimmer bar standing in for
 * the greeting headline, so there's no top-anchored form-shaped skeleton
 * swap on hard navigation. Matches the inline Suspense fallback already in
 * page.tsx (GolfWelcomePage), which covers the same shell once the client
 * bundle has streamed in.
 */
export default function Loading() {
  return (
    <main
      role="status"
      aria-label="Loading greeting"
      className="flex items-center justify-center"
      style={{
        height: '100svh',
        background: 'linear-gradient(180deg, #FFFEFA 0%, #FFF7E0 55%, #FDEAC0 100%)',
      }}
    >
      <div className="h-3 w-40 animate-pulse rounded-full bg-black/5" />
    </main>
  );
}
