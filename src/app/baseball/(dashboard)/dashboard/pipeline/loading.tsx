import { Header } from '@/components/layout/header';
import { SkeletonPipelineKanban } from '@/components/ui/skeleton-loader';

export default function PipelineLoading() {
  return (
    <>
      <Header title="Recruiting Pipeline" subtitle="Manage your recruiting workflow" />
      <div className="p-6 lg:p-8">
        <SkeletonPipelineKanban />
      </div>
    </>
  );
}
