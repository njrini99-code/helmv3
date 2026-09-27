import { syncClassToCalendar, type CalendarSyncResult } from '@/app/golf/actions/calendar-sync';
import { logError } from '@/lib/error-logging';

/**
 * `syncClassToCalendar`, but a THROW is reported as a failed result.
 *
 * The classes page calls this after the class row is already saved. If the
 * server action threw (a network drop, an unexpected server error), the throw
 * reached AddClassModal's catch, which keeps the modal open to "retry", and a
 * second submit inserted the same class again (audit DATA-02). Returning a
 * failure lets the page close the modal and say exactly what did not happen.
 */
export async function syncClassSafely(
  ...args: Parameters<typeof syncClassToCalendar>
): Promise<CalendarSyncResult> {
  try {
    return await syncClassToCalendar(...args);
  } catch (err) {
    logError(
      err instanceof Error ? err : new Error(String(err)),
      { component: 'ClassesPage', action: 'sync-class-to-calendar', sport: 'golf' },
      'medium',
    );
    return {
      success: false,
      error: 'The calendar sync did not finish. Open the class and save it to try again.',
    };
  }
}
