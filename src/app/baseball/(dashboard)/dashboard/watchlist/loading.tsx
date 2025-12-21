import { Header } from '@/components/layout/header';
import { SkeletonWatchlist } from '@/components/ui/skeleton-loader';

export default function WatchlistLoading() {
  return (
    <>
      <Header title="Watchlist" subtitle="Track your recruiting prospects" />
      <div className="p-6 lg:p-8">
        <SkeletonWatchlist />
      </div>
    </>
  );
}
