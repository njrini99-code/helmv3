/**
 * v3 weekly coach email — HTML template (W37).
 *
 * Whoop-style: glanceable single-column layout, big numbers, no
 * graphics that risk breaking on mobile clients. Inlined styles
 * because most email clients strip <style> blocks.
 */

import type { WeeklyRecap } from './builder';

const HELM_GREEN = '#16A34A';
const CREAM = '#FFFEFA';
const WARM_900 = '#1c1917';
const WARM_500 = '#78716c';
const WARM_200 = '#e7e5e4';

function formatToPar(p: number | null): string {
  if (p === null) return '—';
  if (Math.abs(p) < 0.05) return 'E';
  return p > 0 ? `+${p.toFixed(1)}` : p.toFixed(1);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function buildWeeklyRecapHtml(recap: WeeklyRecap): { subject: string; html: string; text: string } {
  const subject = `${recap.team_name} · weekly recap (${formatDate(recap.week_start_iso)}–${formatDate(recap.week_end_iso)})`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0; padding:0; background:${CREAM}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:${WARM_900};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${CREAM};">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; padding: 32px 24px;">
          <!-- Header -->
          <tr>
            <td>
              <p style="margin:0; font-size:11px; letter-spacing:2px; text-transform:uppercase; color:${WARM_500};">CoachHelm · Weekly recap</p>
              <h1 style="margin:8px 0 0; font-size:28px; font-weight:500; letter-spacing:-0.5px;">Hey ${escapeHtml(recap.coach_first_name)},</h1>
              <p style="margin:8px 0 0; font-size:15px; color:${WARM_500};">Here's how ${escapeHtml(recap.team_name)} ran this week.</p>
            </td>
          </tr>
          <!-- Totals row -->
          <tr><td style="padding-top:32px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
                ${statCell('Rounds', String(recap.totals.rounds_played))}
                ${statCell('Avg to par', formatToPar(recap.totals.avg_score_to_par))}
                ${statCell('Insights', String(recap.totals.insights_surfaced))}
                ${statCell('Active goals', String(recap.totals.goals_active))}
              </tr>
            </table>
          </td></tr>
          <!-- Active players -->
          <tr><td style="padding-top:36px;">
            <p style="margin:0 0 12px; font-size:11px; letter-spacing:2px; text-transform:uppercase; color:${WARM_500};">Most active</p>
            ${activePlayersHtml(recap.active_players)}
          </td></tr>
          <!-- Top patterns -->
          <tr><td style="padding-top:36px;">
            <p style="margin:0 0 12px; font-size:11px; letter-spacing:2px; text-transform:uppercase; color:${WARM_500};">Team patterns</p>
            ${topPatternsHtml(recap.top_patterns)}
          </td></tr>
          <!-- Footer -->
          <tr><td style="padding-top:40px; border-top:1px solid ${WARM_200}; margin-top:32px;">
            <p style="margin:24px 0 0; font-size:12px; color:${WARM_500}; line-height:1.6;">
              You're receiving this because you're the head coach of ${escapeHtml(recap.team_name)}.
              Manage email preferences from your CoachHelm settings.
            </p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `${recap.team_name} — weekly recap (${formatDate(recap.week_start_iso)}–${formatDate(recap.week_end_iso)})`,
    ``,
    `Rounds: ${recap.totals.rounds_played}`,
    `Avg to par: ${formatToPar(recap.totals.avg_score_to_par)}`,
    `Insights: ${recap.totals.insights_surfaced}`,
    `Active goals: ${recap.totals.goals_active}`,
    ``,
    `Most active:`,
    ...recap.active_players.map((p) => `  ${p.name} · ${p.rounds} rounds · ${formatToPar(p.avg_score_to_par)}`),
    ``,
    `Team patterns:`,
    ...recap.top_patterns.map((p) => `  ${p.insight_type} · ${p.player_count} players`),
  ].join('\n');

  return { subject, html, text };
}

function statCell(label: string, value: string): string {
  return `<td valign="top" style="padding:0 8px; width:25%; text-align:center;">
    <p style="margin:0; font-size:32px; font-weight:500; color:${WARM_900}; line-height:1;">${escapeHtml(value)}</p>
    <p style="margin:6px 0 0; font-size:11px; letter-spacing:1px; text-transform:uppercase; color:${WARM_500};">${escapeHtml(label)}</p>
  </td>`;
}

function activePlayersHtml(players: WeeklyRecap['active_players']): string {
  if (players.length === 0) {
    return `<p style="margin:0; font-size:14px; color:${WARM_500}; font-style:italic;">No rounds played this week.</p>`;
  }
  return players
    .map(
      (p) =>
        `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-bottom:1px solid ${WARM_200};">
        <tr>
          <td valign="middle" style="padding:10px 0; font-size:15px; color:${WARM_900};">${escapeHtml(p.name)}</td>
          <td valign="middle" align="right" style="padding:10px 0; font-size:13px; color:${WARM_500};">${p.rounds} rounds · ${formatToPar(p.avg_score_to_par)}</td>
        </tr>
      </table>`,
    )
    .join('');
}

function topPatternsHtml(patterns: WeeklyRecap['top_patterns']): string {
  if (patterns.length === 0) {
    return `<p style="margin:0; font-size:14px; color:${WARM_500}; font-style:italic;">No new patterns this week.</p>`;
  }
  return patterns
    .map(
      (p) =>
        `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td valign="middle" style="padding:6px 0;">
            <span style="display:inline-block; width:8px; height:8px; background:${HELM_GREEN}; border-radius:50%; margin-right:8px;"></span>
            <span style="font-size:14px; color:${WARM_900};">${escapeHtml(p.insight_type)}</span>
          </td>
          <td valign="middle" align="right" style="padding:6px 0; font-size:12px; color:${WARM_500};">${p.player_count} player${p.player_count === 1 ? '' : 's'}</td>
        </tr>
      </table>`,
    )
    .join('');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
