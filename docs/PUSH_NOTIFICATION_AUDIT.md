# Push Notification Audit Report

**Date:** March 5, 2026
**Auditor:** Push Notification Auditor Agent
**App:** Helm Sports Labs (GolfHelm) — Capacitor 8 iOS App
**Stack:** Next.js 16 + Capacitor 8 + Supabase + iOS

---

## Executive Summary

The push notification system is **fundamentally incomplete for iOS native delivery**. The app has a well-architected Web Push (browser) notification framework with database tables, VAPID support, a service worker, and email notifications via Resend. However, **none of this translates to native iOS push notifications via APNs**, which is what users expect from an App Store app. The Capacitor iOS shell has zero push notification integration — no plugin, no entitlements, no delegate methods, and no APNs token handling.

**Overall Assessment: NOT READY for App Store launch with push notifications**

---

## Current State

### What EXISTS (Web Push / Email Infrastructure)

| Component | Status | Location |
|-----------|--------|----------|
| `push_subscriptions` table | Migrated | `supabase/migrations/069_push_subscriptions.sql` |
| `notifications` table (in-app) | Migrated | `supabase/migrations/010_notifications.sql` |
| `notification_preferences` column on `users` | Migrated | `supabase/migrations/068_notification_preferences_column.sql` |
| Email notifications via Resend | Working | `src/lib/notifications/email.ts` |
| Notification preference types (push_messages, push_events, push_task_reminders) | Defined | `src/lib/notifications/types.ts` |
| Notification preferences server action | Working | `src/app/actions/notification-preferences.ts` |
| In-app notification center (bell icon dropdown) | Working | `src/components/golf/calendar/NotificationCenter.tsx` |
| Notification badge context (polling every 60s) | Working | `src/contexts/notification-badge-context.tsx` |
| Realtime notifications via Supabase Postgres Changes | Working | `src/hooks/use-notifications.ts` |
| Service worker with push event handler | Present | `public/sw.js` (lines 298-343) |
| Service worker hook with `requestPushPermission()` | Present | `src/hooks/golf/use-service-worker.ts` |
| Web Push sending (VAPID) in task reminders | Partially implemented | `src/app/golf/actions/task-reminders.ts` (lines 524-680) |
| Supabase Edge Function for processing task reminders | Present | `supabase/functions/process-task-reminders/index.ts` |
| Email notifications for messages, announcements, tasks, etc. | Working | `src/lib/notifications/index.ts` |

### What is MISSING (iOS Native Push)

| Component | Status | Impact |
|-----------|--------|--------|
| `@capacitor/push-notifications` plugin | **NOT INSTALLED** | Cannot register for or receive native push |
| `.entitlements` file with `aps-environment` | **MISSING** | iOS won't allow push registration |
| Push Notification capability in Xcode project | **NOT CONFIGURED** | No push capability in `project.pbxproj` |
| AppDelegate push delegate methods | **MISSING** | No `didRegisterForRemoteNotificationsWithDeviceToken`, no `didReceiveRemoteNotification` |
| APNs device token storage | **NO IMPLEMENTATION** | No way to send native push to specific devices |
| APNs/FCM server-side sending | **NO IMPLEMENTATION** | Backend can only send Web Push, not APNs |
| `web-push` npm package | **NOT INSTALLED** | Web Push fallback also fails (`import('web-push').catch(() => null)`) |
| Push notification permission request UI | **NO NATIVE PROMPT** | Service worker hook only uses `Notification.requestPermission()` (Web API, not native iOS) |
| Info.plist `UIBackgroundModes` for remote-notification | **MISSING** | No background push support |

---

## Detailed Gap Analysis

### 1. CRITICAL — No iOS Push Notification Plugin

**Priority: CRITICAL**

The `@capacitor/push-notifications` Capacitor plugin is not installed. This is the fundamental bridge between the web app and iOS native push notifications.

**Current:** `package.json` has `@capacitor/browser`, `@capacitor/keyboard`, `@capacitor/core`, `@capacitor/ios` — but no push plugin.

**Impact:** The app cannot:
- Register for remote notifications with APNs
- Receive an APNs device token
- Display native iOS push notifications
- Handle notification actions (tap to open)
- Receive silent/background push notifications

**Remediation:**
```bash
npm install @capacitor/push-notifications
npx cap sync ios
```

Then configure in `capacitor.config.ts`:
```typescript
plugins: {
  PushNotifications: {
    presentationOptions: ["badge", "sound", "alert"],
  },
}
```

---

### 2. CRITICAL — No iOS Entitlements for Push

**Priority: CRITICAL**

No `.entitlements` file exists anywhere in `ios/`. The Xcode project has no push notification capability configured. `project.pbxproj` contains zero references to push notifications.

**Impact:** Even if the plugin were installed, iOS would reject push notification registration because the app lacks the required entitlement.

**Remediation:**
1. In Xcode: Target > Signing & Capabilities > + Push Notifications
2. This creates `App.entitlements` with `aps-environment` key
3. Ensure the Apple Developer account has push notification enabled for the App ID `com.helmsportslabs.golfhelm`
4. Generate an APNs key (`.p8` file) or certificate in Apple Developer portal

---

### 3. CRITICAL — AppDelegate Has No Push Handling

**Priority: CRITICAL**

`ios/App/App/AppDelegate.swift` is the default Capacitor boilerplate with no push notification methods.

**Missing methods:**
- `application(_:didRegisterForRemoteNotificationsWithDeviceToken:)` — for receiving the APNs token
- `application(_:didFailToRegisterForRemoteNotificationsWithError:)` — for handling registration failure
- `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)` — for background push

**Note:** With `@capacitor/push-notifications`, the plugin handles these internally via method swizzling, but the entitlements and capability must still be present.

**Remediation:** After installing the Capacitor push plugin, add minimal AppDelegate support:
```swift
func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
}

func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
    NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
}
```

---

### 4. CRITICAL — No APNs Token Storage or Server-Side Sending

**Priority: CRITICAL**

The backend has a `push_subscriptions` table designed for **Web Push** (stores `endpoint`, `p256dh` key, `auth` key). This is incompatible with APNs device tokens.

**Current architecture:**
- `push_subscriptions` stores Web Push subscription objects
- `sendPushNotification()` in `task-reminders.ts` uses VAPID/Web Push protocol
- The Edge Function `process-task-reminders` also uses Web Push protocol

**Missing:**
- A `device_tokens` or `apns_tokens` table for storing iOS device tokens
- Server-side APNs sending capability (using Apple's APNs HTTP/2 API or a service like Firebase Cloud Messaging)
- Token refresh handling

**Remediation:**
1. Create a new migration for APNs device tokens:
```sql
CREATE TABLE device_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    device_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(token)
);
```
2. Implement APNs sending using Apple's HTTP/2 API with the `.p8` key
3. Or integrate Firebase Cloud Messaging (FCM) which handles APNs as a proxy

---

### 5. HIGH — Web Push `web-push` Package Not Installed

**Priority: HIGH**

The code in `task-reminders.ts` (line 649) does `await import('web-push').catch(() => null)` — but `web-push` is not in `package.json`. This means even the existing Web Push implementation for task reminders silently fails.

**Impact:** Task reminder push notifications never actually send, even for Web Push subscriptions.

**Remediation:** Either install `web-push` (`npm install web-push`) or remove the dead code path and commit to APNs for the iOS app.

---

### 6. HIGH — Messaging Has No Push Notification

**Priority: HIGH**

When a golf message is sent (`sendGolfMessage` in `src/app/actions/messages.ts`), the app:
1. Sends the message to the database
2. Sends an **email notification** via `notifyNewMessage()`
3. Creates an in-app notification in the `notifications` table

**Missing:** No push notification is sent for new messages. Users must either:
- Have the app open (realtime via Supabase)
- Check their email

For a sports team communication app, this is a critical gap — coaches and players expect instant push notification of messages.

**Remediation:** Add push notification dispatch to the `sendGolfMessage` flow, sending to all recipient device tokens/subscriptions.

---

### 7. HIGH — Announcements Have No Push Notification

**Priority: HIGH**

Announcements (`src/app/golf/actions/announcements.ts`) create email notifications and in-app records, but do not send push notifications. Given that announcements can be marked "urgent" and require acknowledgement, this is a significant gap.

**Remediation:** Add push notification dispatch when an announcement is published, respecting the user's `push_events` preference.

---

### 8. HIGH — Calendar Events / RSVP Have No Push Notification

**Priority: HIGH**

Events have email-based RSVP reminders but no push notifications for:
- New event creation
- Event updates/cancellations
- RSVP deadline reminders
- Day-of event reminders

**Remediation:** Implement push notifications for event lifecycle events, keyed to the `push_events` user preference.

---

### 9. MEDIUM — Task Reminders Push Path is Dead Code

**Priority: MEDIUM**

The task reminder system has the most complete push notification infrastructure in the codebase (`task-reminders.ts` and the Edge Function), but it's non-functional because:
1. `web-push` npm package is not installed (server action path)
2. VAPID keys are likely not configured (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` env vars)
3. No users have Web Push subscriptions registered (no UI to subscribe)
4. The Edge Function implementation has a custom Web Push encryption implementation that may have bugs

**Remediation:** This infrastructure can serve as a starting point but needs to be adapted for APNs or replaced with a unified push service.

---

### 10. MEDIUM — Service Worker Won't Work in Capacitor iOS

**Priority: MEDIUM**

The service worker at `public/sw.js` has a `push` event listener (line 298), but:
- **WKWebView (Capacitor's iOS web view) does not support service workers for push notifications**
- The service worker is designed for browser-based Web Push, not native iOS
- The `use-service-worker.ts` hook's `requestPushPermission()` uses the Web Notification API, which is not available in WKWebView

**Impact:** The existing service worker push infrastructure is entirely irrelevant for the iOS native app. It only works if users access the app via Safari browser.

**Remediation:** For iOS, push notifications must go through `@capacitor/push-notifications` → APNs, not through the service worker.

---

### 11. MEDIUM — Notification Preferences Have Push Options But No Implementation

**Priority: MEDIUM**

The notification preferences system defines these push-related preferences:
- `push_enabled` (in DB migration)
- `push_messages` (default: `false`)
- `push_events` (default: `false`)
- `push_task_reminders` (default: `true`)

These are stored in the database and exposed in the settings UI, but **no push notification sending code checks these preferences** because push sending doesn't work at all.

**Remediation:** When push is implemented, wire up preference checking before dispatching notifications. Note that the defaults have `push_messages: false` and `push_events: false` — these should probably default to `true` for an iOS app where users expect push.

---

### 12. LOW — Info.plist Missing Background Modes

**Priority: LOW**

`ios/App/App/Info.plist` does not include `UIBackgroundModes` with `remote-notification`. This is needed for:
- Silent push notifications
- Background data refresh triggered by push
- Badge count updates while app is in background

**Remediation:** Add to Info.plist:
```xml
<key>UIBackgroundModes</key>
<array>
    <string>remote-notification</string>
</array>
```

---

### 13. LOW — No Badge Count Management

**Priority: LOW**

The app has badge count logic in the notification-badge-context (announcements, tasks, messages, travel counts), but there is no integration with iOS badge counts on the app icon.

**Remediation:** Use `@capacitor/push-notifications` or `@capacitor/badge` to set the app icon badge count, synced with the existing `NotificationBadgeProvider` total count.

---

## Notification Coverage Matrix

| Feature | In-App | Email | Push (Native iOS) | Gap |
|---------|--------|-------|-------------------|-----|
| New Message | Realtime (Supabase) | Via Resend | **MISSING** | CRITICAL |
| Announcement Published | Badge count | Via Resend | **MISSING** | HIGH |
| Task Assigned | In-app record | Via Resend | **MISSING** | HIGH |
| Task Reminder | In-app record | Via Resend | Dead code | HIGH |
| Event RSVP Reminder | In-app record | Via Resend | **MISSING** | HIGH |
| Qualifier Created | In-app record | Via Resend | **MISSING** | MEDIUM |
| Development Plan Assigned | In-app record | Via Resend | **MISSING** | MEDIUM |
| Watchlist Add (Baseball) | In-app record | Via Resend | **MISSING** | LOW |
| Pipeline Stage Change (Baseball) | In-app record | Via Resend | **MISSING** | LOW |
| Profile View (Baseball) | In-app record | Via Resend | **MISSING** | LOW |
| CoachHelm Insight | In-app record | Via Resend | **MISSING** | LOW |
| Round Submitted | In-app record | Via Resend | **MISSING** | LOW |

---

## Recommended Implementation Plan

### Phase 1: iOS Foundation (Required for App Store)

1. **Install `@capacitor/push-notifications`** and sync
2. **Configure Xcode**: Add Push Notifications capability, create `.entitlements`
3. **Apple Developer Portal**: Enable push for App ID, generate APNs key (`.p8`)
4. **Create `device_tokens` migration** for storing APNs tokens
5. **Implement frontend token registration**:
   - Request permission on first login (with explanation UI)
   - Store token to `device_tokens` table
   - Handle token refresh
6. **Implement APNs sending** (via Supabase Edge Function):
   - Use Apple's HTTP/2 APNs API with the `.p8` key
   - Or use FCM as a proxy for APNs
7. **Wire up notifications** for the highest-impact features:
   - New messages → push to all recipients
   - Announcements → push to team members
   - Task assigned/reminder → push to assignee

### Phase 2: Full Coverage

8. Calendar event notifications (creation, updates, reminders)
9. Qualifier notifications
10. Development plan notifications
11. CoachHelm insight notifications (coach only)
12. Badge count sync with iOS app icon
13. Notification grouping/threading for iOS

### Phase 3: Polish

14. Rich notifications (images, action buttons)
15. Notification preferences UI on the settings page
16. Silent push for background data refresh
17. Analytics on notification delivery/open rates

---

## Files Audited

| File | Purpose | Finding |
|------|---------|---------|
| `ios/App/App/AppDelegate.swift` | Native iOS entry point | No push delegate methods |
| `ios/App/App/Info.plist` | iOS app configuration | No push-related entries |
| `ios/App/App.xcodeproj/project.pbxproj` | Xcode project config | No push capability |
| `capacitor.config.ts` | Capacitor configuration | No PushNotifications plugin config |
| `package.json` | Dependencies | No `@capacitor/push-notifications`, no `web-push` |
| `public/sw.js` | Service worker | Has push handler (Web Push only, won't work on iOS) |
| `src/hooks/golf/use-service-worker.ts` | SW hook | Has `requestPushPermission()` (Web API only) |
| `src/lib/notifications/index.ts` | Notification dispatcher | Email-only, no push sending |
| `src/lib/notifications/types.ts` | Notification types | Defines push prefs but unused |
| `src/lib/notifications/email.ts` | Email notification service | Working via Resend |
| `src/hooks/use-notifications.ts` | In-app notifications hook | Realtime via Supabase (working) |
| `src/hooks/useNotifications.ts` | Alternate notifications hook | Calendar-specific, polling-based |
| `src/contexts/notification-badge-context.tsx` | Badge count provider | Working, no iOS badge sync |
| `src/app/golf/actions/player-notifications.ts` | Badge count fetching | Working, in-app only |
| `src/app/golf/actions/task-reminders.ts` | Task reminder system | Push code is dead (no `web-push` package) |
| `src/app/actions/notification-preferences.ts` | Preference management | Stores push prefs but no implementation |
| `src/app/actions/messages.ts` | Messaging actions | Email notification only, no push |
| `src/components/golf/calendar/NotificationCenter.tsx` | Notification dropdown UI | Working in-app notification center |
| `src/components/features/notification-center.tsx` | Baseball notification center | Working in-app notification center |
| `supabase/migrations/010_notifications.sql` | In-app notifications table | Working |
| `supabase/migrations/068_notification_preferences_column.sql` | User notification prefs | Working, includes push fields |
| `supabase/migrations/069_push_subscriptions.sql` | Web Push subscriptions | Wrong schema for APNs (Web Push only) |
| `supabase/functions/process-task-reminders/index.ts` | Edge function for reminders | Has Web Push sending code, untested |
