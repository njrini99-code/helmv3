// Allowlists for the import restrictions in eslint.config.mjs (see
// eslint-rules/import-restrictions.mjs). Each list is a RATCHET: it holds the
// non-test files that already imported the restricted module when the rule
// was added (plan phase 7b). It may only shrink. Delete an entry when its file
// stops importing the module; scripts/__tests__/import-allowlists.test.mjs
// fails on a stale entry, so the list cannot quietly outlive the code.
//
// Never add a file here to make lint pass. New code uses the replacement.

// TODO(phase-7b): 9 files outside src/clubhouse import it without being a route file. Pass the gate answer in from the route file instead.
export const CLUBHOUSE_IMPORT_ALLOWLIST = [
  'src/app/clubhouse-preview/auth/PreviewAuth.tsx',
  'src/app/clubhouse-preview/entry/PreviewEntry.tsx',
  'src/app/clubhouse-preview/entry/fixtures.ts',
  'src/app/golf/actions/development.ts',
  'src/app/golf/actions/message-attachments.ts',
  'src/app/golf/actions/qualifier-setup.ts',
  'src/app/golf/actions/round-partial.ts',
  'src/app/golf/actions/round-submit.ts',
  'src/components/errors/RouteErrorBoundary.tsx',
];

// TODO(phase-7b): 43 files import src/lib/error-logging.ts. Migrate to server-error-logger (logServerError / logServerEvent) or observed-action.
export const ERROR_LOGGING_ALLOWLIST = [
  'src/app/admin/_components/PanelBoundary.tsx',
  'src/app/baseball/(dashboard)/dashboard/roster/RosterClient.tsx',
  'src/app/global-error.tsx',
  'src/app/golf/(dashboard)/dashboard/classes/sync-class-safely.ts',
  'src/app/golf/admin/crm/components/EmailTrackingView.tsx',
  'src/app/golf/admin/crm/components/QuickActionsPanel.tsx',
  'src/app/golf/admin/crm/components/ScheduleEventModal.tsx',
  'src/app/golf/admin/crm/page.tsx',
  'src/clubhouse/lib/track.ts',
  'src/clubhouse/screens/auth/SignInForm.tsx',
  'src/components/auth/baseball-sign-in-form.tsx',
  'src/components/auth/golf-sign-in-form.tsx',
  'src/components/baseball/performance/PlayerLiftToday.tsx',
  'src/components/baseball/postgame/PostgameReviewClient.tsx',
  'src/components/baseball/staff-decision-room/StaffDecisionRoomClient.tsx',
  'src/components/baseball/staff-decision-room/StaffDecisionRoomFairway.tsx',
  'src/components/coach/discover/DiscoverView.tsx',
  'src/components/errors/RouteErrorBoundary.tsx',
  'src/components/fairway/pages/messages/FairwayMessages.tsx',
  'src/components/fairway/pages/rounds-new/FairwayCoursePicker.tsx',
  'src/components/fairway/pages/settings/FairwaySettingsGeneral.tsx',
  'src/components/features/video-upload.tsx',
  'src/components/golf/calendar/EventDetailModal.tsx',
  'src/components/golf/calendar/EventDocumentsSection.tsx',
  'src/components/golf/calendar/PremiumCalendarClient.tsx',
  'src/components/golf/messages/AttachmentButton.tsx',
  'src/components/lifting/groups/StrengthGroupsClient.tsx',
  'src/components/lifting/nutrition/NutritionPlanUploader.tsx',
  'src/components/lifting/sessions/LiveWeightRoomClient.tsx',
  'src/components/providers/GlobalErrorHandlerSetup.tsx',
  'src/components/ui/avatar-upload.tsx',
  'src/hooks/golf/use-golf-messages.ts',
  'src/hooks/golf/use-message-attachments.ts',
  'src/hooks/golf/use-message-reactions.ts',
  'src/hooks/golf/use-offline-sync.ts',
  'src/hooks/golf/use-round-status-sync.ts',
  'src/hooks/golf/use-shot-state-machine.ts',
  'src/hooks/use-messages.ts',
  'src/hooks/use-presence.ts',
  'src/hooks/use-watchlist.ts',
  'src/lib/golf/round-session/use-new-round-session.ts',
  'src/lib/offline/indexed-db.ts',
  'src/lib/offline/shot-storage.ts',
];

// TODO(phase-7b): 11 files import src/lib/admin-logger.ts. Migrate to server-error-logger (logServerError / logServerEvent) or observed-action.
export const ADMIN_LOGGER_ALLOWLIST = [
  'src/app/admin/actions/billing.ts',
  'src/app/admin/actions/sessions.ts',
  'src/app/admin/actions/view-as.ts',
  'src/app/api/golf/rounds/generate-review/route.ts',
  'src/app/baseball/actions/auth.ts',
  'src/app/baseball/actions/demo-access.ts',
  'src/app/golf/actions/auth.ts',
  'src/app/golf/actions/demo-access.ts',
  'src/app/golf/actions/round-submit.ts',
  'src/lib/admin-logger-client.ts',
  'src/lib/email/outbound-gate.ts',
];

// TODO(phase-7b): 14 files import src/lib/observability/structured-log.ts. Migrate to server-error-logger (logServerError / logServerEvent) or observed-action.
export const STRUCTURED_LOG_ALLOWLIST = [
  'src/app/golf/actions/round-partial.ts',
  'src/instrumentation-client.ts',
  'src/instrumentation.ts',
  'src/lib/golf/new-round-setup-restore-signal.ts',
  'src/lib/golf/round-start-guard-signal.ts',
  'src/lib/notifications/push.ts',
  'src/lib/observability/golf-login-outcome.ts',
  'src/lib/observability/helm-flight-recorder.ts',
  'src/lib/observability/supabase/integrity.ts',
  'src/lib/observability/supabase/observe-auth.ts',
  'src/lib/observability/supabase/observe-edge.ts',
  'src/lib/observability/supabase/observe-result.ts',
  'src/lib/observability/supabase/observe-storage.ts',
  'src/lib/observability/supabase/realtime.ts',
];

export const LOGGING_IMPORT_ALLOWLIST = {
  'error-logging': new Set(ERROR_LOGGING_ALLOWLIST),
  'admin-logger': new Set(ADMIN_LOGGER_ALLOWLIST),
  'structured-log': new Set(STRUCTURED_LOG_ALLOWLIST),
};
