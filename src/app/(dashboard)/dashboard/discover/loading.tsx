import { Header } from '@/components/layout/header';
import { SkeletonDiscover } from '@/components/ui/skeleton-loader';

export default function DiscoverLoading() {
  return (
    <>
      <Header title="Discover Players" subtitle="Find your next recruit" />
      <div className="p-6 lg:p-8">
        <SkeletonDiscover />
      </div>
    </>
  );
}
