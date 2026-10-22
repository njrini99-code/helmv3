/**
 * The coach Monday brief as an email (task chs-28), in the weekly recap's
 * plain style (`v3/recap/template.ts`): one column, inlined styles, no images.
 * Up to five rows (name, read, ladder word, strokes a round), then the counts
 * line and one link to the brief in CoachHelm. Words, never percents.
 */
import { LADDER_RUNG_WORD } from './words';
import { briefCountsLine, briefTeamLine, type MondayBrief, type MondayBriefItem } from './brief';

const CREAM = '#FFFEFA';
const WARM_900 = '#1c1917';
const WARM_500 = '#78716c';
const WARM_200 = '#e7e5e4';

export interface MondayBriefEmailInput {
  brief: MondayBrief;
  teamName: string;
  coachFirstName: string;
  /** Absolute URL of the brief in CoachHelm. */
  href: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const strokesWords = (n: number) => `${n.toFixed(1)} ${n === 1 ? 'stroke' : 'strokes'} a round`;

/** One row as text: "Priya Shah · Three-putts · Observed · 0.8 strokes a round". */
export function briefItemLine(item: MondayBriefItem): string {
  if (item.kind === 'team_pattern') {
    return [`Team pattern: ${item.title}`, item.members, item.strokes !== null ? `${strokesWords(item.strokes)} across the team` : null].filter(Boolean).join(' · ');
  }
  return [item.player_name, item.title, LADDER_RUNG_WORD[item.ladder], strokesWords(item.strokes)].join(' · ');
}

export function buildMondayBriefEmail(input: MondayBriefEmailInput): { subject: string; html: string; text: string } {
  const { brief, teamName, coachFirstName, href } = input;
  const subject = `${teamName} · Monday brief`;
  const team = briefTeamLine(brief);
  const counts = briefCountsLine(brief.counts);
  const rows = brief.items
    .map(
      (item) => `<tr><td style="padding:10px 0; border-bottom:1px solid ${WARM_200}; font-size:15px; line-height:1.4; color:${WARM_900};">${escapeHtml(briefItemLine(item))}</td></tr>`,
    )
    .join('');
  const none = `<tr><td style="padding:10px 0; font-size:14px; color:${WARM_500}; font-style:italic;">No read needs a conversation this week.</td></tr>`;

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
          <tr><td>
            <p style="margin:0; font-size:11px; letter-spacing:2px; text-transform:uppercase; color:${WARM_500};">CoachHelm · Monday brief</p>
            <h1 style="margin:8px 0 0; font-size:24px; font-weight:500;">Morning, ${escapeHtml(coachFirstName)}.</h1>
            <p style="margin:8px 0 0; font-size:14px; color:${WARM_500};">${escapeHtml(team)}</p>
          </td></tr>
          <tr><td style="padding-top:24px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${rows || none}</table>
          </td></tr>
          <tr><td style="padding-top:16px; font-size:13px; color:${WARM_500};">${escapeHtml(counts)}</td></tr>
          <tr><td style="padding-top:24px;">
            <a href="${escapeHtml(href)}" style="font-size:15px; color:${WARM_900};">Open the brief in CoachHelm</a>
          </td></tr>
          <tr><td style="padding-top:32px; border-top:1px solid ${WARM_200};">
            <p style="margin:24px 0 0; font-size:12px; color:${WARM_500}; line-height:1.6;">
              You're receiving this because you're the head coach of ${escapeHtml(teamName)}.
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
    `${teamName}: Monday brief`,
    team,
    '',
    ...(brief.items.length ? brief.items.map((i) => `- ${briefItemLine(i)}`) : ['No read needs a conversation this week.']),
    '',
    counts,
    '',
    `Open the brief: ${href}`,
  ].join('\n');

  return { subject, html, text };
}
