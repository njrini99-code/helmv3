import { InsightsDashboard } from '../components/insights/InsightsDashboard';

export const metadata = {
  title: 'CRM Insights · Helm Admin',
  description:
    'Per-template performance, time-to-open distribution, and click destinations.',
};

// The parent CRM layout (../layout.tsx) already enforces admin auth.
export default function CrmInsightsPage() {
  return (
    <div className="min-h-screen bg-[#FFFEFA]">
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <InsightsDashboard />
      </div>
    </div>
  );
}
