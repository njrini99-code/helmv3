/**
 * Print-optimized Player Game Fingerprint.
 *
 * Same data as the main `/game` route, via `getPlayerFingerprint`, read
 * through the same Fingerprint view model (presentForm, buildVerdict,
 * confidenceWord) so paper and screen print one Form number and one verdict
 * (FP-08). Renders
 * a flat, B&W-friendly scouting report with every section expanded and no
 * interactive chrome. Auto-triggers `window.print()` after a brief settle
 * so the coach can send straight to PDF / paper.
 *
 * Contract: all @media print rules live in `./print.css`.
 */
import type { Metadata } from 'next';
import Script from 'next/script';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { getPlayerFingerprint } from '@/app/golf/actions/player-fingerprint';
import { FINGERPRINT_SECTION_ORDER } from '@/app/golf/actions/player-fingerprint-types';
import { DEFAULT_TIMEZONE } from '@/lib/calendar/timezone';
import { formatMetricText } from '@/lib/golf/metrics/display-registry';
import { MetricValue } from '@/components/fairway/charts/MetricValue';
import { cleanCourseName } from '@/lib/golf/course-name';
import {
  buildVerdict,
  buildWaterfall,
  confidenceWord,
  presentForm,
} from '@/components/fairway/pages/player-game/fingerprint/fingerprint-model';
import { MetricPill } from './MetricPill';
import './print.css';

export const metadata: Metadata = {
  title: 'Print Scouting Report',
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
  const { coach } = session;
  if (!coach) redirect('/golf/dashboard');

  // Scope to the coach's ACTIVE team (cookie-resolved), matching the base
  // `/players/[playerId]` page and the `/game` route. Without this gate,
  // getPlayerFingerprint's any-staffed-team access would let a coach print the
  // scouting report for a player on a non-active team.
  const supabase = await createClient();
  const teamId = await resolveCoachTeamIdWithCookie(
    supabase,
    coach.organization_id,
    coach.id,
  );
  if (!teamId) redirect('/golf/dashboard/roster');

  const { data: membership } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (!membership) notFound();

  const fingerprint = await getPlayerFingerprint(playerId);
  if (!fingerprint) notFound();

  const fullName =
    `${fingerprint.player.first_name ?? ''} ${fingerprint.player.last_name ?? ''}`.trim() ||
    'Player';
  // Explicit `timeZone` (not the bare `.toLocaleString()` this used to be) —
  // this route is a pure Server Component so it isn't a hydration-mismatch
  // source, but an unqualified `.toLocaleString()` still rendered the
  // SERVER's own ambient locale/zone into the printed report rather than a
  // stable, predictable one. Matches the fix applied to the main /game route
  // (FairwayPlayerGameFingerprint) for the same `generated_at` value.
  const generatedAt = new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(fingerprint.generated_at));
  const form = presentForm(fingerprint.composite);
  const verdict = buildVerdict(buildWaterfall(fingerprint.sections));

  return (
    <div className="print-shell" data-testid="print-shell">
      <PrintAutoLaunch />

      <div className="max-w-[680px] mx-auto p-8 print:p-0">
        {/* Header */}
        <header className="print-header-block" data-testid="print-header">
          <p className="text-eyebrow uppercase tracking-[0.14em] text-text-tertiary font-medium">
            Coach scouting report
          </p>
          <h1
            className="text-3xl font-medium text-text-primary mt-1"
            data-testid="print-player-name"
          >
            {fullName}
          </h1>
          <p className="text-sm text-text-secondary mt-1" data-testid="print-form">
            {fingerprint.player.team_name ?? 'No team'}
            {form.kind === 'value' ? (
              <>
                {' · '}Form{' '}
                <span className="font-medium tabular-nums text-text-primary">{form.value}</span>
                {form.qualityLabel ? ` (${form.qualityLabel})` : ''}
                {' · '}
                {form.trendWord}
                {` · last ${form.rounds} ${form.rounds === 1 ? 'round' : 'rounds'}`}
              </>
            ) : (
              ' · Form appears after the first full round'
            )}
          </p>
          {verdict ? (
            <p className="text-sm text-text-primary mt-2" data-testid="print-verdict">
              {verdict}
            </p>
          ) : null}
          <p className="text-eyebrow text-text-tertiary mt-1">Generated {generatedAt}</p>
        </header>

        {/* Sections */}
        <div className="space-y-5 mt-6">
          {FINGERPRINT_SECTION_ORDER.map((key, idx) => {
            const section = fingerprint.sections[key];
            return (
              <section
                key={key}
                data-testid={`print-section-${key}`}
                className="rounded-lg border border-border-subtle p-5"
              >
                <div className="mb-3">
                  <p className="text-eyebrow uppercase tracking-[0.14em] text-text-tertiary font-medium">
                    {String(idx + 1).padStart(2, '0')}
                  </p>
                  <h2 className="text-body-lg font-medium text-text-primary tracking-[-0.012em]">
                    {section.category}
                  </h2>
                </div>

                {section.sparse ? (
                  <p className="text-sm text-text-tertiary italic">
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
                      <p className="text-xs text-text-tertiary italic">
                        No insights in this area.
                      </p>
                    ) : (
                      <ul className="space-y-3" data-testid={`print-insights-${key}`}>
                        {section.insights.slice(0, 5).map((insight) => (
                          <li
                            key={insight.id}
                            className="rounded-md border border-border-subtle bg-surface-sunken p-3 text-sm leading-relaxed"
                          >
                            <p className="font-medium text-text-primary">{insight.title}</p>
                            {insight.content && (
                              <p className="text-text-secondary mt-1">{insight.content}</p>
                            )}
                            <p className="text-eyebrow text-text-tertiary mt-2 tabular-nums">
                              {insight.evidence.metric_label}
                              {' · '}
                              {formatMetricText('strokes_impact', Number(insight.evidence.strokes_impact))}
                              {typeof insight.evidence.sample_n === 'number' && (
                                <>
                                  {' · '}
                                  n={insight.evidence.sample_n}
                                </>
                              )}
                              {' · '}
                              {confidenceWord(insight.evidence.confidence, insight.evidence.sample_n)}
                            </p>
                            {insight.drills && insight.drills.length > 0 && (
                              <p className="text-eyebrow text-text-secondary mt-1.5">
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
            className="rounded-lg border border-border-subtle p-5"
          >
            <div className="mb-3">
              <p className="text-eyebrow uppercase tracking-[0.14em] text-text-tertiary font-medium">
                07
              </p>
              <h2 className="text-body-lg font-medium text-text-primary tracking-[-0.012em]">
                Recent trend
              </h2>
            </div>

            {fingerprint.trend.rolling.length === 0 ? (
              <p className="text-sm text-text-tertiary italic">No rounds on record yet.</p>
            ) : (
              <table
                className="w-full text-sm border-collapse"
                data-testid="print-trend-table"
              >
                <thead>
                  <tr className="text-left text-eyebrow uppercase tracking-wide text-text-tertiary">
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
                      <tr key={p.round_id} className="border-t border-border-subtle">
                        <td className="py-1.5 pr-2 tabular-nums text-text-secondary">
                          {p.round_date}
                        </td>
                        <td className="py-1.5 pr-2 text-text-secondary truncate">
                          {cleanCourseName(p.course_name) || '—'}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-text-primary font-medium">
                          {p.total_score ?? '—'}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-text-primary">
                          <MetricValue metricId="round_to_par" value={p.score_to_par} showMeta={false} />
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
          className="mt-8 pt-4 border-t border-border-subtle text-eyebrow text-text-tertiary text-center"
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
