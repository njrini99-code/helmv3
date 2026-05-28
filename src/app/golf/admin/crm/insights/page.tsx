import { InsightsDashboard } from '../components/insights/InsightsDashboard';
import { Breadcrumb } from '@/components/ui/breadcrumb';

export const metadata = {
  title: 'CRM Insights · Helm Admin',
  description:
    'Per-template performance, time-to-open distribution, and click destinations.',
};

// The parent CRM layout (../layout.tsx) already enforces admin auth.
export default function CrmInsightsPage() {
  return (
    <div className="min-h-screen bg-cream-100">
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <Breadcrumb
          className="mb-6"
          items={[
            { label: 'CRM', href: '/golf/admin/crm' },
            { label: 'Insights' },
          ]}
        />
        <InsightsDashboard />
      </div>
    </div>
  );
}
