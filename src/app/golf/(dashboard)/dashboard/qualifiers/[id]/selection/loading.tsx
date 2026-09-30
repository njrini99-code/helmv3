import { ClubhouseSwitch } from '@/clubhouse/shell/ClubhouseSwitch';
import { QualifierDetailSkeleton } from '@/clubhouse/screens/qualifiers/QualifiersSkeleton';

/** Inside Clubhouse, the qualifier skeleton; outside it this address only redirects, so nothing is drawn. */
export default function QualifierSelectionLoading() {
  return <ClubhouseSwitch clubhouse={<QualifierDetailSkeleton />} fallback={null} />;
}
