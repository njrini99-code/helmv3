import { ClubhouseSwitch } from '@/clubhouse/shell/ClubhouseSwitch';
import { QualifierSelectionSkeleton } from '@/clubhouse/screens/qualifiers/QualifiersSkeleton';

/** Inside Clubhouse, Manage selections' own skeleton; outside it this address only redirects, so nothing is drawn. */
export default function QualifierSelectionLoading() {
  return <ClubhouseSwitch clubhouse={<QualifierSelectionSkeleton />} fallback={null} />;
}
