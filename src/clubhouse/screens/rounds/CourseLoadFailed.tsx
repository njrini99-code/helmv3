'use client';

import { useRefresh } from '../../lib/use-refresh';
import { FAILURE_COPY, InlineNotice } from '../../ui/Notices';

/** CH-11421: the course history didn't load. Offline says so; Try again asks the server again. */
export function CourseLoadFailed() {
  const { refresh, refreshing } = useRefresh();
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return (
    <main className="ch-ch" aria-label="Course history">
      <InlineNotice
        code="CH-11421"
        title="Your history here didn’t load"
        body={offline ? FAILURE_COPY.offline : FAILURE_COPY.page}
        onRetry={refresh}
        retrying={refreshing}
      />
    </main>
  );
}
