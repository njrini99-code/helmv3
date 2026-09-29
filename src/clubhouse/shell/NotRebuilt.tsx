import Link from 'next/link';

/** Shown for any route the Clubhouse rebuild hasn't reached yet. */
export function NotRebuilt({ label }: { label: string }) {
  return (
    <main className="ch-notyet">
      <div className="ch-notyet__card ch-sheet">
        <h1 className="ch-notyet__title ch-display">{label} hasn&rsquo;t been rebuilt yet.</h1>
        <p className="ch-notyet__body">
          It&rsquo;s on the list for the new GolfHelm design. Home is ready now, and each screen joins it as it&rsquo;s finished.
        </p>
        <Link href="/golf/dashboard" className="ch-btn ch-btn--secondary">
          Back to Home
        </Link>
      </div>
    </main>
  );
}
