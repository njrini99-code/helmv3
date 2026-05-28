import { AutomationsList } from '../../components/automations/AutomationsList';

// ============================================================================
// /golf/admin/crm/settings/automations
//
// Admin settings page for configurable automation rules. The auth gate is
// handled by src/app/golf/admin/crm/layout.tsx (admin role required).
// ============================================================================

export const metadata = {
  title: 'CRM Automations · Helm Sports Labs',
};

export default function CRMAutomationsSettingsPage() {
  return (
    <div className="min-h-dvh bg-[#FFFEFA]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <AutomationsList />
      </div>
    </div>
  );
}
