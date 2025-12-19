import { Header } from '@/components/layout/header';
import { SkeletonDashboard } from '@/components/ui/skeleton-loader';

export default function DashboardLoading() {
  return (
    <>
      <Header title="Dashboard" subtitle="Welcome back" />
      <div className="p-6 lg:p-8">
        <SkeletonDashboard />
      </div>
    </>
  );
}
