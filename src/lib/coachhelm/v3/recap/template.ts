/**
 * v3 weekly coach email — HTML template (W37).
 *
 * Whoop-style: glanceable single-column layout, big numbers, no
 * graphics that risk breaking on mobile clients. Inlined styles
 * because most email clients strip <style> blocks.
 *
 * Retrofit (2026-06-10): now routes through renderBrandedEmail so
 * coaches see the same logo/card/footer as all other Helm emails.
 */

import type { WeeklyRecap } from './builder';
import { renderBrandedEmail, escapeHtml } from '@/lib/email/layout';

const HELM_GREEN = '#16A34A';
const WARM_900 = '#1c1917';
const WARM_500 = '#78716c';
const WARM_200 = '#e7e5e4';
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
const SERIF = `Georgia,'Times New Roman',Times,serif`;

function formatToPar(p: number | null): string {
  if (p === null) return '—';
  if (Math.abs(p) < 0.05) return 'E';
  return p > 0 ? `+${p.toFixed(1)}` : p.toFixed(1);
}

function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end   = new Date(endIso);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

export function buildWeeklyRecapHtml(recap: WeeklyRecap): { subject: string; html: string; text: string } {
  const dateRange = formatDateRange(recap.week_start_iso, recap.week_end_iso);
  const subject = `${recap.team_name} · weekly recap (${dateRange})`;

  const bodyHtml = `
    <p style="margin:0 0 8px;font-family:${SERIF};font-size:22px;font-weight:normal;line-height:1.3;letter-spacing:-0.3px;color:${WARM_900};">
      Hey ${escapeHtml(recap.coach_first_name)},
    </p>
    <p style="margin:0 0 32px;font-family:${FONT};font-size:15px;color:${WARM_500};">
      Here's how ${escapeHtml(recap.team_name)} ran this week.
    </p>

    <!-- Totals row -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:36px;">
      <tr>
        ${statCell('Rounds', String(recap.totals.rounds_played))}
        ${statCell('Avg to par', formatToPar(recap.totals.avg_score_to_par))}
        ${statCell('Insights', String(recap.totals.insights_surfaced))}
        ${statCell('Active goals', String(recap.totals.goals_active))}
      </tr>
    </table>

    <!-- Most active -->
    <p style="margin:0 0 12px;font-family:${FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${WARM_500};">Most active</p>
    ${activePlayersHtml(recap.active_players)}

    <!-- Team patterns -->
    <p style="margin:28px 0 12px;font-family:${FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${WARM_500};">Team patterns</p>
    ${topPatternsHtml(recap.top_patterns)}
  `;

  const html = renderBrandedEmail({
    preheader: `${recap.team_name} week in review — ${recap.totals.rounds_played} round${recap.totals.rounds_played !== 1 ? 's' : ''}, avg ${formatToPar(recap.totals.avg_score_to_par)}`,
    eyebrow: `Weekly Recap · ${dateRange}`,
    heading: `${escapeHtml(recap.team_name)} this week`,
    bodyHtml,
    footerNote: `You're receiving this because you're the head coach of ${escapeHtml(recap.team_name)}. Manage email preferences from your CoachHelm settings.`,
  });

  const text = [
    `${recap.team_name} — weekly recap (${dateRange})`,
    ``,
    `Hey ${recap.coach_first_name},`,
    `Here's how ${recap.team_name} ran this week.`,
    ``,
    `Rounds: ${recap.totals.rounds_played}`,
    `Avg to par: ${formatToPar(recap.totals.avg_score_to_par)}`,
    `Insights: ${recap.totals.insights_surfaced}`,
    `Active goals: ${recap.totals.goals_active}`,
    ``,
    `Most active:`,
    ...recap.active_players.map((p) => `  ${p.name} · ${p.rounds} round${p.rounds !== 1 ? 's' : ''} · ${formatToPar(p.avg_score_to_par)}`),
    ``,
    `Team patterns:`,
    ...recap.top_patterns.map((p) => `  ${p.insight_type} · ${p.player_count} player${p.player_count !== 1 ? 's' : ''}`),
  ].join('\n');

  return { subject, html, text };
}

function statCell(label: string, value: string): string {
  return `<td valign="top" style="padding:0 8px;width:25%;text-align:center;">
    <p style="margin:0;font-family:${SERIF};font-size:32px;font-weight:normal;color:${WARM_900};line-height:1;">${escapeHtml(value)}</p>
    <p style="margin:6px 0 0;font-family:${FONT};font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${WARM_500};">${escapeHtml(label)}</p>
  </td>`;
}

function activePlayersHtml(players: WeeklyRecap['active_players']): string {
  if (players.length === 0) {
    return `<p style="margin:0;font-family:${FONT};font-size:14px;color:${WARM_500};font-style:italic;">No rounds played this week.</p>`;
  }
  return players
    .map(
      (p) =>
        `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-bottom:1px solid ${WARM_200};">
        <tr>
          <td valign="middle" style="padding:10px 0;font-family:${FONT};font-size:15px;color:${WARM_900};">${escapeHtml(p.name)}</td>
          <td valign="middle" align="right" style="padding:10px 0;font-family:${FONT};font-size:13px;color:${WARM_500};">${p.rounds} round${p.rounds !== 1 ? 's' : ''}&nbsp;·&nbsp;${formatToPar(p.avg_score_to_par)}</td>
        </tr>
      </table>`,
    )
    .join('');
}

function topPatternsHtml(patterns: WeeklyRecap['top_patterns']): string {
  if (patterns.length === 0) {
    return `<p style="margin:0;font-family:${FONT};font-size:14px;color:${WARM_500};font-style:italic;">No new patterns this week.</p>`;
  }
  return patterns
    .map(
      (p) =>
        `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td valign="middle" style="padding:6px 0;">
            <span style="display:inline-block;width:8px;height:8px;background:${HELM_GREEN};border-radius:50%;margin-right:8px;vertical-align:middle;"></span>
            <span style="font-family:${FONT};font-size:14px;color:${WARM_900};vertical-align:middle;">${escapeHtml(p.insight_type)}</span>
          </td>
          <td valign="middle" align="right" style="padding:6px 0;font-family:${FONT};font-size:12px;color:${WARM_500};">${p.player_count} player${p.player_count === 1 ? '' : 's'}</td>
        </tr>
      </table>`,
    )
    .join('');
}
