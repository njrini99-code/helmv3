import { InboxView } from '../components/replies/InboxView';

// ============================================================================
// /golf/admin/crm/inbox
//
// Inbox tab — replies + tasks-due-today merged feed. The auth gate is handled
// by src/app/golf/admin/crm/layout.tsx (admin role required).
// ============================================================================

export const metadata = {
  title: 'CRM Inbox · Helm Sports Labs',
};

export default function CRMInboxPage() {
  return (
    <div className="min-h-dvh bg-[#FFFEFA]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        <InboxView />
      </div>
    </div>
  );
}
