import { Skeleton } from '@/clubhouse/ui/States';
import '@/clubhouse/styles/live.css';

/** Keep the Live page's heading and lane geometry while the session and first snapshot load. */
export default function Loading() {
  return (
    <main className="ch-lv" aria-busy="true" aria-label="Loading live rounds">
      <div aria-hidden="true">
        <Skeleton width={96} height={34} />
        {[0, 1, 2].map((lane) => (
          <div key={lane} className="ch-lv-group">
            <Skeleton width="100%" height={72} />
          </div>
        ))}
      </div>
    </main>
  );
}
