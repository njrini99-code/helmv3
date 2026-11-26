import { BR } from '@/lib/admin/clubhouse/br-codes';
import { ScreenSkeleton } from '../_components/ScreenSkeleton';

export default function Loading() {
  return <ScreenSkeleton code={BR.releases.loading} />;
}
