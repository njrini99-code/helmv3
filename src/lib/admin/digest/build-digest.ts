// =============================================================================
// src/lib/admin/digest/build-digest.ts
//
// "Cup of Helm" — the 7am founder briefing.
//
// This used to be "Helm Bridge", a terse ops digest written for someone already
// staring at a dashboard. The brief changed (owner, 2026-07-30): it should read
// like a personal assistant's morning note — what happened in the last 24 hours,
// what needs a decision today, what shipped yesterday. Bullets and simple
// visuals, never code or stack traces. So the sections are ordered by what a
// founder acts on, not by what is cheapest to query:
//
//   1. Needs you today   — the only section that can create work
//   2. Overnight errors   — counts and titles, no stack traces
//   3. Coaches & CRM      — inbound humans waiting on a reply
//   4. Activity           — did anyone actually use the product
//   5. Shipped yesterday  — what moved
//
// PURE FUNCTION on purpose. Every field arrives already-fetched so the whole
// email is unit-testable without a database, a Resend key, or a clock. The
// route owns fetching and fail-soft; this file owns wording and layout.
//
// EMAIL-SAFE VISUALS. The bars are nested <table> cells with inline background
// colors and percentage widths — no external images and no CSS that Gmail or
// Outlook strips. An earlier draft used a background-color on an <a> for the
// call-to-action; Gmail's renderer drops that and keeps `color`, which is how
// you ship white-on-white text. Links here are bold and underlined instead.
// =============================================================================

export interface DigestData {
  generatedAt: string;
  errors24h: {
    total: number;
    critical: number;
    topIncidents: Array<{ title: string; occurrences: number; affectedUsers: number }>;
  };
  sentry: { unresolved: number | null; regressed: number | null };
  signups24h: Array<{ email: string; role: string }>;
  demoRequests: { new24h: number; pendingTotal: number };
  activity24h: { golfRounds: number; baseballGames: number; liftSessions: number };
  reds: string[];
  /**
   * Pull requests merged in the window. Optional because the GitHub read is
   * fail-soft in the route — `undefined` means "we could not ask", which is a
   * different statement from `[]` ("nothing shipped"), and the email says so.
   */
  shippedYesterday?: Array<{ title: string; number: number }>;
}

export interface DigestEmail {
  subject: string;
  html: string;
  text: string;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const INK = '#1c1917';
const MUTED = '#6b625a';
const LINEN = '#f1e7d6';
const GREEN = '#16a34a';
const DEEP_GREEN = '#0f5132';
const RED = '#b3261e';

/**
 * One horizontal bar, scaled against the largest value in the group so the
 * chart is readable when every number is small. A zero value still renders its
 * label and a hairline track — an invisible row reads as a missing metric.
 */
function bar(label: string, value: number, max: number): string {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 2;
  return `<tr>
    <td style="padding:5px 10px 5px 0;font-size:13px;color:${MUTED};white-space:nowrap">${esc(label)}</td>
    <td style="padding:5px 0;width:100%">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">
        <tr><td style="background:#e6ddcd;border-radius:3px;font-size:0;line-height:0">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:${pct}%;border-collapse:collapse">
            <tr><td style="background:${GREEN};height:8px;border-radius:3px;font-size:0;line-height:0">&nbsp;</td></tr>
          </table>
        </td></tr>
      </table>
    </td>
    <td style="padding:5px 0 5px 10px;font-size:14px;font-weight:700;color:${INK};text-align:right">${value}</td>
  </tr>`;
}

function section(title: string, body: string): string {
  return `<tr><td style="padding:22px 0 0">
    <div style="font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:${MUTED};padding-bottom:8px">${esc(title)}</div>
    ${body}
  </td></tr>`;
}

function bullets(items: string[], color = INK): string {
  return `<ul style="margin:0;padding-left:20px;color:${color};font-size:14px;line-height:1.65">${items
    .map((i) => `<li>${esc(i)}</li>`)
    .join('')}</ul>`;
}

/** Weekday + short date, e.g. "Thursday, 30 Jul". */
function prettyDay(iso: string): string {
  const d = new Date(iso);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getUTCDay()]}, ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

export function buildDigestEmail(data: DigestData): DigestEmail {
  const redCount = data.reds.length;
  const day = new Date(data.generatedAt).toISOString().slice(0, 10);
  const subject =
    redCount > 0
      ? `Cup of Helm ${day} — ${redCount} thing${redCount === 1 ? '' : 's'} need you`
      : `Cup of Helm ${day} — nothing needs you`;

  const { golfRounds, baseballGames, liftSessions } = data.activity24h;
  const activityMax = Math.max(golfRounds, baseballGames, liftSessions);
  const activityTotal = golfRounds + baseballGames + liftSessions;
  const shipped = data.shippedYesterday;

  // ---------------------------------------------------------------- plain text
  const lines: string[] = [`CUP OF HELM — ${prettyDay(data.generatedAt)}`, ''];
  lines.push('NEEDS YOU TODAY');
  if (redCount > 0) for (const red of data.reds) lines.push(`  - ${red}`);
  else lines.push('  Nothing. All clear.');
  lines.push('');

  lines.push('OVERNIGHT ERRORS');
  lines.push(`  ${data.errors24h.total} error groups (${data.errors24h.critical} critical)`);
  lines.push(
    data.sentry.unresolved === null
      ? '  Sentry: not reachable'
      : `  Sentry: ${data.sentry.unresolved} unresolved, ${data.sentry.regressed ?? 0} regressed`,
  );
  for (const inc of data.errors24h.topIncidents) {
    lines.push(`  - ${inc.title} (${inc.occurrences}x, ${inc.affectedUsers} users)`);
  }
  lines.push('');

  lines.push('COACHES & CRM');
  lines.push(
    data.demoRequests.pendingTotal > 0
      ? `  ${data.demoRequests.pendingTotal} awaiting your reply, ${data.demoRequests.new24h} new in 24h`
      : `  Nothing awaiting reply. ${data.demoRequests.new24h} new in 24h.`,
  );
  if (data.signups24h.length > 0) {
    lines.push(`  ${data.signups24h.length} new signup${data.signups24h.length === 1 ? '' : 's'}:`);
    for (const s of data.signups24h) lines.push(`    + ${s.email} (${s.role})`);
  }
  lines.push('');

  lines.push('ACTIVITY (24h)');
  lines.push(`  golf rounds ${golfRounds} | baseball games ${baseballGames} | lift sessions ${liftSessions}`);
  if (activityTotal === 0) lines.push('  Nobody used the product in the last 24 hours.');
  lines.push('');

  lines.push('SHIPPED YESTERDAY');
  if (shipped === undefined) lines.push('  GitHub not reachable — unknown.');
  else if (shipped.length === 0) lines.push('  Nothing merged.');
  else for (const pr of shipped) lines.push(`  - #${pr.number} ${pr.title}`);
  lines.push('', 'Open the admin: https://helmsportslabs.com/admin');
  const text = lines.join('\n');

  // ---------------------------------------------------------------------- html
  const attention =
    redCount > 0
      ? bullets(data.reds, RED)
      : `<p style="margin:0;font-size:14px;color:${MUTED}">Nothing needs you. Go enjoy the coffee.</p>`;

  const errorBody = `
    <p style="margin:0 0 8px;font-size:14px">
      <strong style="font-size:20px;color:${data.errors24h.critical > 0 ? RED : INK}">${data.errors24h.total}</strong>
      <span style="color:${MUTED}"> error groups &middot; ${data.errors24h.critical} critical</span><br/>
      <span style="color:${MUTED}">${
        data.sentry.unresolved === null
          ? 'Sentry: not reachable'
          : `Sentry: ${data.sentry.unresolved} unresolved &middot; ${data.sentry.regressed ?? 0} regressed`
      }</span>
    </p>
    ${
      data.errors24h.topIncidents.length > 0
        ? bullets(
            data.errors24h.topIncidents.map(
              (i) => `${i.title} — ${i.occurrences}x, ${i.affectedUsers} user${i.affectedUsers === 1 ? '' : 's'}`,
            ),
          )
        : `<p style="margin:0;font-size:14px;color:${MUTED}">No incidents worth naming.</p>`
    }`;

  const crmBody = `
    <p style="margin:0 0 6px;font-size:14px">
      <strong style="font-size:20px;color:${data.demoRequests.pendingTotal > 0 ? RED : INK}">${data.demoRequests.pendingTotal}</strong>
      <span style="color:${MUTED}"> awaiting your reply &middot; ${data.demoRequests.new24h} new in 24h</span>
    </p>
    ${
      data.signups24h.length > 0
        ? bullets(data.signups24h.map((s) => `${s.email} (${s.role})`))
        : `<p style="margin:0;font-size:14px;color:${MUTED}">No new signups.</p>`
    }`;

  const activityBody = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">
      ${bar('Golf rounds', golfRounds, activityMax)}
      ${bar('Baseball games', baseballGames, activityMax)}
      ${bar('Lift sessions', liftSessions, activityMax)}
    </table>
    ${
      activityTotal === 0
        ? `<p style="margin:8px 0 0;font-size:14px;color:${RED}">Nobody used the product in the last 24 hours.</p>`
        : ''
    }`;

  const shippedBody =
    shipped === undefined
      ? `<p style="margin:0;font-size:14px;color:${MUTED}">GitHub was not reachable, so this is unknown rather than empty.</p>`
      : shipped.length === 0
        ? `<p style="margin:0;font-size:14px;color:${MUTED}">Nothing merged yesterday.</p>`
        : bullets(shipped.map((pr) => `#${pr.number} ${pr.title}`));

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${LINEN}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:${LINEN}">
<tr><td align="center" style="padding:28px 14px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#fffdf8;border-radius:14px;padding:26px 28px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK}">
  <tr><td>
    <div style="font-size:22px;font-weight:700;letter-spacing:-.01em">Cup of Helm</div>
    <div style="font-size:13px;color:${MUTED};padding-top:2px">${esc(prettyDay(data.generatedAt))} &middot; last 24 hours</div>
    <div style="margin-top:14px;padding:10px 14px;border-radius:8px;background:${redCount > 0 ? '#fdecea' : '#eaf6ee'};color:${redCount > 0 ? RED : DEEP_GREEN};font-size:14px;font-weight:600">
      ${redCount > 0 ? `${redCount} thing${redCount === 1 ? '' : 's'} need you today` : 'All systems nominal'}
    </div>
  </td></tr>
  ${section('Needs you today', attention)}
  ${section('Overnight errors', errorBody)}
  ${section('Coaches & CRM', crmBody)}
  ${section('Activity, last 24h', activityBody)}
  ${section('Shipped yesterday', shippedBody)}
  <tr><td style="padding:24px 0 0;border-top:1px solid #ece3d3;margin-top:8px">
    <p style="margin:14px 0 0;font-size:14px">
      <a href="https://helmsportslabs.com/admin" style="color:${DEEP_GREEN};font-weight:700;text-decoration:underline">Open the admin dashboard &rarr;</a>
    </p>
    <p style="margin:10px 0 0;font-size:12px;color:${MUTED}">Cup of Helm runs at 7am. Helm Sports Labs.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}
