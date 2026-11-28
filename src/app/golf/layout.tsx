import type { Metadata } from 'next';
import { GateSignals } from '@/clubhouse/shell/GateSignals';
import { isFlagEnabled } from '@/lib/flags/is-enabled';

/**
 * GolfHelm segment layout. It sets the document-title template. Fairway's avatar
 * tone moved to the admin layout (golf/admin/layout.tsx): Clubhouse, GolfHelm's
 * only UI, draws its own avatars and never reads it.
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

/**
 * The front door's Bridge signals (GateSignals): on its pages only, and only with the `clubhouse_signals` switch on. The
 * switch is read here, at build time for the front door's static pages, because it lives in code
 * (config/feature-flags.yml) and changes only with a deploy; reading it reads no request, so those pages stay static.
 */
export default function GolfLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <GateSignals enabled={isFlagEnabled('clubhouse_signals', { skipTelemetry: true })} />
    </>
  );
}
