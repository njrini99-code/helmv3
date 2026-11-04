import 'server-only';
import { recordInAppNotification } from '@/lib/notifications/in-app';
import { sendBulkPushNotification } from '@/lib/notifications/push';
import { logServerError } from '@/lib/server-error-logger';

export interface PracticeNotice {
  userIds: string[];
  title: string;
  body: string;
}

/** Push and bell. One call of each per distinct body: the helpers take one payload for all ids. A failure is logged and never undoes the publish; `after()` doesn't retry, so nobody gets it twice (N-00 §8.15). */
export async function fanOutPracticePlan(planId: string, version: number, action: 'published' | 'updated' | 'taken_down', notices: readonly PracticeNotice[]): Promise<void> {
  const url = `/golf/dashboard/practice/plan/${planId}`;
  for (const n of notices) {
    if (!n.userIds.length) continue;
    try {
      await recordInAppNotification({ userIds: n.userIds, type: 'event_reminder', title: n.title, body: n.body, actionUrl: url, data: { kind: 'practice_plan', plan_id: planId, version, action }, context: 'practice_plan' });
      const { failed } = await sendBulkPushNotification('practice_plan', n.userIds, { title: n.title, body: n.body, url });
      if (failed) await logServerError(`practice plan push: ${failed} failed`, { action: 'practice.fanout', errorCode: 'CH-17205' }, 'warning');
    } catch (err) {
      await logServerError(`practice plan fan-out failed: ${err instanceof Error ? err.message : 'unknown'}`, { action: 'practice.fanout', errorCode: 'CH-17205' }, 'warning');
    }
  }
}
