/**
 * Print-optimized Player Game Fingerprint.
 *
 * Same data as the main `/game` route, via `getPlayerFingerprint`. Renders
 * a flat, B&W-friendly scouting report with every section expanded and no
 * interactive chrome. Auto-triggers `window.print()` after a brief settle
 * so the coach can send straight to PDF / paper.
 *
 * Contract: all @media print rules live in `./print.css`.
 */
import type { Metadata } from 'next';
import Script from 'next/script';
import { notFound, redirect } from 'next/navigation';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getPlayerFingerprint } from '@/app/golf/actions/player-fingerprint';
import { FINGERPRINT_SECTION_ORDER } from '@/app/golf/actions/player-fingerprint-types';
import { cn } from '@/lib/utils';
import { MetricPill } from '../sections/FingerprintHero';
import './print.css';

export const metadata: Metadata = {
  title: 'Print Scouting Report | Helm Golf',
  robots: { index: false, follow: false },
};

export default async function PlayerGamePrintPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;

  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  if (!session.coach) redirect('/golf/dashboard');

  const fingerprint = await getPlayerFingerprint(playerId);
  if (!fingerprint) notFound();

  const fullName =
    `${fingerprint.player.first_name ?? ''} ${fingerprint.player.last_name ?? ''}`.trim() ||
    'Player';
  const generatedAt = new Date(fingerprint.generated_at).toLocaleString();

  return (
    <div className="print-shell" data-testid="print-shell">
      <PrintAutoLaunch />

      <div className="max-w-[680px] mx-auto p-8 print:p-0">
        {/* Header */}
        <header className="print-header-block" data-testid="print-header">
          <p className="text-eyebrow uppercase tracking-[0.14em] text-warm-500 font-medium">
            Coach scouting report
          </p>
          <h1
            className="text-3xl font-medium text-warm-900 mt-1"
            data-testid="print-player-name"
          >
            {fullName}
          </h1>
          <p className="text-sm text-warm-600 mt-1">
            {fingerprint.player.team_name ?? 'No team'}
            {fingerprint.composite.rating != null && (
              <>
                {' · '}Composite{' '}
                <span className="font-medium tabular-nums">
                  {fingerprint.composite.rating}
                </span>
                {' · '}Trend{' '}
                <span className="font-medium capitalize">
                  {fingerprint.composite.trend}
                </span>
              </>
            )}
          </p>
          <p className="text-eyebrow text-warm-500 mt-1">Generated {generatedAt}</p>
        </header>

        {/* Sections */}
        <div className="space-y-5 mt-6">
          {FINGERPRINT_SECTION_ORDER.map((key, idx) => {
            const section = fingerprint.sections[key];
            return (
              <section
                key={key}
                data-testid={`print-section-${key}`}
                className="rounded-lg border border-warm-200 p-5"
              >
                <div className="mb-3">
                  <p className="text-eyebrow uppercase tracking-[0.14em] text-warm-500 font-medium">
                    {String(idx + 1).padStart(2, '0')}
                  </p>
                  <h2 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em]">
                    {section.category}
                  </h2>
                </div>

                {section.sparse ? (
                  <p className="text-sm text-warm-500 italic">
                    Not enough data yet · needs 5+ rounds
                  </p>
                ) : (
                  <>
                    {section.metrics.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {section.metrics.map((m) => (
                          <MetricPill key={m.label} metric={m} />
                        ))}
                      </div>
                    )}

                    {section.insights.length === 0 ? (
                      <p className="text-xs text-warm-500 italic">
                        No insights in this area.
                      </p>
                    ) : (
                      <ul className="space-y-3" data-testid={`print-insights-${key}`}>
                        {section.insights.slice(0, 5).map((insight) => (
                          <li
                            key={insight.id}
                            className={cn(
                              'rounded-md border border-warm-200 p-3 text-sm leading-relaxed',
                              'bg-white',
                            )}
                          >
                            <p className="font-medium text-warm-900">{insight.title}</p>
                            {insight.content && (
                              <p className="text-warm-700 mt-1">{insight.content}</p>
                            )}
                            <p className="text-eyebrow text-warm-500 mt-2 tabular-nums">
                              {insight.evidence.metric_label}
                              {' · '}
                              impact{' '}
                              {Math.abs(
                                Number(insight.evidence.strokes_impact ?? 0),
                              ).toFixed(1)}{' '}
                              str
                              {typeof insight.evidence.sample_n === 'number' && (
                                <>
                                  {' · '}
                                  n={insight.evidence.sample_n}
                                </>
                              )}
                              {typeof insight.evidence.confidence === 'number' && (
                                <>
                                  {' · '}
                                  conf {Math.round(insight.evidence.confidence * 100)}%
                                </>
                              )}
                            </p>
                            {insight.drills && insight.drills.length > 0 && (
                              <p className="text-eyebrow text-warm-600 mt-1.5">
                                Drills:{' '}
                                {insight.drills
                                  .map((d) => `${d.title} (${d.duration_min}m)`)
                                  .join(', ')}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </section>
            );
          })}

          {/* Trend — keep simple and textual in print. Line charts don't
              always render reliably in print-to-PDF pipelines. */}
          <section
            data-testid="print-section-trend"
            className="rounded-lg border border-warm-200 p-5"
          >
            <div className="mb-3">
              <p className="text-eyebrow uppercase tracking-[0.14em] text-warm-500 font-medium">
                07
              </p>
              <h2 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em]">
                Recent trend
              </h2>
            </div>

            {fingerprint.trend.rolling.length === 0 ? (
              <p className="text-sm text-warm-500 italic">No rounds on record yet.</p>
            ) : (
              <table
                className="w-full text-sm border-collapse"
                data-testid="print-trend-table"
              >
                <thead>
                  <tr className="text-left text-eyebrow uppercase tracking-wide text-warm-500">
                    <th className="py-1 pr-2">Date</th>
                    <th className="py-1 pr-2">Course</th>
                    <th className="py-1 pr-2 text-right">Score</th>
                    <th className="py-1 text-right">To par</th>
                  </tr>
                </thead>
                <tbody>
                  {fingerprint.trend.rolling
                    .slice(-10)
                    .reverse()
                    .map((p) => (
                      <tr key={p.round_id} className="border-t border-warm-200">
                        <td className="py-1.5 pr-2 tabular-nums text-warm-700">
                          {p.round_date}
                        </td>
                        <td className="py-1.5 pr-2 text-warm-700 truncate">
                          {p.course_name ?? '--'}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-warm-900 font-medium">
                          {p.total_score ?? '--'}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-warm-900">
                          {typeof p.score_to_par === 'number'
                            ? p.score_to_par === 0
                              ? 'E'
                              : p.score_to_par > 0
                                ? `+${p.score_to_par}`
                                : p.score_to_par
                            : '--'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        {/* Footer */}
        <footer
          className="mt-8 pt-4 border-t border-warm-200 text-eyebrow text-warm-500 text-center"
          data-testid="print-footer"
        >
          Generated by CoachHelm · {generatedAt}
        </footer>
      </div>
    </div>
  );
}

/**
 * Auto-launch `window.print()` shortly after the page loads. Renders via
 * `next/script` with a static, hardcoded body — no user-supplied data ever
 * enters this script, so nothing to sanitize. The 350ms delay lets recharts
 * + Fraunces settle before the browser snapshots the DOM for print.
 *
 * Guard flag prevents double-launch on back/forward navigation.
 */
function PrintAutoLaunch() {
  return (
    <Script id="helm-print-autolaunch" strategy="afterInteractive">
      {PRINT_AUTOLAUNCH_BODY}
    </Script>
  );
}

const PRINT_AUTOLAUNCH_BODY = [
  '(function () {',
  '  if (window.__helmPrintLaunched) return;',
  '  window.__helmPrintLaunched = true;',
  '  window.setTimeout(function () {',
  '    try { window.print(); } catch (e) {}',
  '  }, 350);',
  '})();',
].join('\n');
