import { Header } from '@/components/layout/header';
import { SkeletonMessages } from '@/components/ui/skeleton';

export default function MessagesLoading() {
  return (
    <>
      <Header title="Messages" subtitle="Your conversations" />
      <div className="p-6 lg:p-8">
        <SkeletonMessages />
      </div>
    </>
  );
}
