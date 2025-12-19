import { Header } from '@/components/layout/header';
import { SkeletonCompare } from '@/components/ui/skeleton-loader';

export default function CompareLoading() {
  return (
    <>
      <Header title="Compare Players" subtitle="Side-by-side analysis" />
      <div className="p-6 lg:p-8">
        <SkeletonCompare />
      </div>
    </>
  );
}
