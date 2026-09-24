import type { Metadata } from 'next';

/**
 * GolfHelm segment layout. It only sets the document-title template.
 *
 * Every golf route used to carry its own brand suffix ("| Helm Golf",
 * "| Helm Sports", "| GolfHelm", "| CoachHelm"), and the root template then
 * appended "| Helm Sports Labs" as well. The result was five brand spellings
 * and double suffixes in tab titles. Golf pages now declare a bare noun
 * ("Rounds") and this template adds the one GolfHelm suffix.
 * src/test/static/golf-title-suffix.test.ts enforces this.
 */
export const metadata: Metadata = {
  title: {
    template: '%s · GolfHelm',
    default: 'GolfHelm',
  },
};

export default function GolfLayout({ children }: { children: React.ReactNode }) {
  return children;
}
