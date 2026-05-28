import { InboxView } from '../components/replies/InboxView';
import { Breadcrumb } from '@/components/ui/breadcrumb';

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
    <div className="min-h-screen bg-cream-100">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 py-8">
        <Breadcrumb
          className="mb-6"
          items={[
            { label: 'CRM', href: '/golf/admin/crm' },
            { label: 'Inbox' },
          ]}
        />
        <InboxView />
      </div>
    </div>
  );
}
