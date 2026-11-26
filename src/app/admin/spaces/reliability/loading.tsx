import { BR } from '@/lib/admin/clubhouse/br-codes';
import { SpaceLoading } from './_components/SpaceLoading';

export default function Loading() {
  return <SpaceLoading br={BR.feed.loading} />;
}
