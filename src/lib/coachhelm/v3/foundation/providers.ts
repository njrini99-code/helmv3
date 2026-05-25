/**
 * v3 foundation provider re-exports.
 *
 * Single import point for downstream waves that need to hand-off to
 * push / email / flag plumbing. Keeps consuming code out of the
 * `web-push`, `resend`, `@growthbook/growthbook` package APIs directly
 * so the provider can be swapped without rewriting callsites.
 *
 *   import { sendEmail, sendWebPush, isFlagOn } from
 *     '@/lib/coachhelm/v3/foundation/providers';
 */

export {
  sendEmail,
  getEmailClient,
  type SendEmailInput,
  type SendEmailResult,
} from './email';

export {
  sendWebPush,
  isWebPushAvailable,
  type StoredPushSubscription,
  type WebPushPayload,
  type SendWebPushResult,
} from './push';

export {
  getFlagsClient,
  isFlagOn,
  getFlagValue,
  type FlagAttributes,
} from './flags';
