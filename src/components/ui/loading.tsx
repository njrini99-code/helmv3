import { GenericPageSkeleton } from '@/components/ui/skeleton';

export function Loading({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const heights = { sm: 'h-16', md: 'h-32', lg: 'h-48' };
  return (
    <div className="flex items-center justify-center py-12">
      <div className={`w-full max-w-sm space-y-3 ${heights[size]}`}>
        <div className="skeleton-shimmer h-4 w-3/4 mx-auto rounded" />
        <div className="skeleton-shimmer h-4 w-1/2 mx-auto rounded" />
        <div className="skeleton-shimmer h-4 w-2/3 mx-auto rounded" />
      </div>
    </div>
  );
}

export function PageLoading() {
  return <GenericPageSkeleton />;
}
