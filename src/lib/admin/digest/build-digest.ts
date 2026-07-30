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
//   2. Coaches & CRM      — inbound humans waiting on a reply
//   3. Overnight errors   — counts and titles, no stack traces
//   4. Activity           — did anyone actually use the product
//   5. Shipped yesterday  — what moved
//   6. On deck            — CRM follow-ups already on the books
//
// PURE FUNCTION on purpose. Every field arrives already-fetched so the whole
// email is unit-testable without a database, a Resend key, or a clock. The
// route owns fetching and fail-soft; this file owns wording and layout.
//
// -----------------------------------------------------------------------------
// LAYOUT NOTES (2026-07-30 redesign — owner's review of the first cut: "it
// looks like crap")
//
// The first cut was a stack of same-weight bullet lists. Everything looked
// equally important, which is the same as nothing being important. This pass
// adds a masthead, a status ribbon, and a four-up readout strip, so the shape
// of the morning is legible in the preview pane before a single word is read.
// Below the fold every section keeps one rhythm — hairline rule, small
// letterspaced mono eyebrow, content in a shared two-column row — so the page
// can be skimmed by heading and still reads as one system.
//
// Type roles mirror the product: system sans for prose (Fairway's display and
// sans both resolve to the system stack after Fraunces/General Sans were
// removed), and a mono stack for every number, tag, and eyebrow. Numbers set in
// mono is the instrument-panel idiom from the dashboard, and it is the single
// cheapest thing that makes a table-based email look designed rather than
// unstyled.
//
// EMAIL-SAFE CONSTRAINTS, each one learned from a client that broke it:
//   - Bars are nested <table> cells with inline background colors and
//     percentage widths — no external images, no CSS Gmail or Outlook strips.
//   - An earlier draft used background-color on an <a> for the call to action.
//     Gmail's renderer drops that and keeps `color`, which is how you ship
//     white-on-white text. Links here are bold and underlined, and a test
//     guards it.
//   - Longhand properties only. The `font:` shorthand is unreliable in
//     Outlook's Word renderer, which drops the whole declaration rather than
//     the unsupported part of it.
//   - No float, no flexbox, no grid. Multi-column means table cells with
//     explicit widths and border-left hairlines as dividers.
//   - Hex literals for every color. Named colors and rgba() are inconsistently
//     supported, and alpha is dropped rather than approximated.
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
  demoRequests: {
    new24h: number;
    pendingTotal: number;
    /**
     * The specific leads still unanswered, oldest first. A count tells the
     * owner there is work; a name and a waiting time tells them which one to
     * open first. An empty array is a legitimate "none waiting".
     */
    waiting?: Array<{ name: string | null; organization: string | null; email: string; waitingDays: number }>;
  };
  /**
   * Inbound coach email, ingested from Gmail into crm_replies by the
   * ingest-gmail-replies cron. `null` means the read FAILED — rendered as
   * "couldn't check", never as "no mail". A silent zero here would tell the
   * owner no coach wrote in, which is exactly the class of lie this digest
   * exists to avoid.
   */
  coachMail: {
    unread: number;
    recent: Array<{ from: string; subject: string; ageHours: number }>;
  } | null;
  /** CRM follow-ups that are due or already overdue. */
  openTasks?: Array<{ title: string; dueLabel: string; overdue: boolean }>;
  activity24h: { golfRounds: number; baseballGames: number; liftSessions: number };
  reds: string[];
  /**
   * Pull requests merged in the window. Optional because the GitHub read is
   * fail-soft in the route — `undefined` means "we could not ask", which is a
   * different statement from `[]` ("nothing shipped"), and the email says so.
   */
  shippedYesterday?: Array<{ title: string; number: number }>;
  /**
   * How far the running production release is from `main`. Optional because the
   * check is fail-soft; when absent the briefing simply omits the line rather
   * than implying production is current. Its `red` (if any) is pushed into
   * `reds` by the caller, so this field carries only the descriptive line.
   */
  deploy?: { state: 'unknown' | 'current' | 'behind' | 'stale'; summary: string };
}

export interface DigestEmail {
  subject: string;
  html: string;
  text: string;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Keep one long subject line or coach name from blowing out a table cell. */
function clamp(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

// ------------------------------------------------------------------- palette
const PAGE = '#efe6d8';
const CARD = '#fffdf9';
const INK = '#191714';
const MUTED = '#6e655b';
const FAINT = '#8d8377';
const HAIRLINE = '#e7dcc9';
const TRACK = '#e9dfce';

const GREEN = '#1e7a46';
const GREEN_SOFT = '#e8f2ea';
const DEEP_GREEN = '#0f5132';
const RED = '#a62b21';
const RED_SOFT = '#fbeae7';

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace";

const BODY = `font-family:${SANS};font-size:14px;line-height:1.6;color:${INK}`;
const LABEL = `font-family:${MONO};font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:${FAINT}`;

// ----------------------------------------------------------------- fragments

/** One number and its caption — a quarter of the readout strip. */
function statCell(value: string, label: string, tone: string, first: boolean): string {
  return `<td width="25%" align="center" valign="top" style="padding:16px 4px;${
    first ? '' : `border-left:1px solid ${HAIRLINE};`
  }">
    <div style="font-family:${MONO};font-size:25px;font-weight:700;line-height:1;letter-spacing:-.02em;color:${tone}">${esc(value)}</div>
    <div style="${LABEL};padding-top:7px;line-height:1.3">${esc(label)}</div>
  </td>`;
}

/**
 * Section wrapper: hairline rule, eyebrow, optional right-aligned note, body.
 * The eyebrow row is a two-cell table rather than a float — float is the single
 * most reliably broken layout primitive across email clients.
 */
function section(title: string, body: string, note?: string): string {
  return `<tr><td style="padding:26px 0 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border-top:1px solid ${HAIRLINE}">
      <tr>
        <td align="left" style="${LABEL};padding:16px 0 12px">${esc(title)}</td>
        ${note ? `<td align="right" style="${LABEL};padding:16px 0 12px">${esc(note)}</td>` : ''}
      </tr>
      <tr><td colspan="${note ? 2 : 1}">${body}</td></tr>
    </table>
  </td></tr>`;
}

/** Numbered, red-indexed rows — used only for things that need a decision. */
function priorityRows(items: string[]): string {
  const rows = items
    .map(
      (t, i) => `<tr>
        <td width="24" valign="top" style="padding:6px 0;font-family:${MONO};font-size:12px;font-weight:700;line-height:1.6;color:${RED}">${i + 1}</td>
        <td valign="top" style="padding:6px 0;${BODY};font-weight:500">${esc(t)}</td>
      </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">${rows}</table>`;
}

/**
 * Two-column detail row: a title with an optional muted subtitle beneath on the
 * left, a small mono tag on the right. The workhorse for mail, leads,
 * incidents, shipped PRs and tasks — one shape reused five times is what makes
 * the email feel like a single document instead of five widgets.
 */
function detailRow(primary: string, secondary: string | null, tag: string, tagTone: string): string {
  return `<tr>
    <td valign="top" style="padding:7px 12px 7px 0;${BODY}">
      <span style="font-weight:600">${esc(primary)}</span>${
        secondary ? `<br/><span style="color:${MUTED};font-size:13px">${esc(secondary)}</span>` : ''
      }
    </td>
    <td valign="top" align="right" style="padding:7px 0;font-family:${MONO};font-size:11px;font-weight:600;white-space:nowrap;color:${tagTone}">${esc(tag)}</td>
  </tr>`;
}

function rowTable(rows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">${rows}</table>`;
}

function quiet(text: string): string {
  return `<p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.6;color:${MUTED}">${esc(text)}</p>`;
}

/**
 * One horizontal bar, scaled against the largest value in the group so the
 * chart is readable when every number is small. A zero value still renders its
 * label and a hairline track — an invisible row reads as a missing metric.
 */
function bar(label: string, value: number, max: number): string {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 2;
  return `<tr>
    <td width="120" style="padding:6px 12px 6px 0;font-family:${SANS};font-size:13px;color:${MUTED};white-space:nowrap">${esc(label)}</td>
    <td style="padding:6px 0;width:100%">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">
        <tr><td style="background:${TRACK};border-radius:3px;font-size:0;line-height:0">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:${pct}%;border-collapse:collapse">
            <tr><td style="background:${GREEN};height:6px;border-radius:3px;font-size:0;line-height:0">&nbsp;</td></tr>
          </table>
        </td></tr>
      </table>
    </td>
    <td width="44" align="right" style="padding:6px 0 6px 12px;font-family:${MONO};font-size:14px;font-weight:700;color:${INK}">${value}</td>
  </tr>`;
}

/** Weekday + short date, e.g. "Thursday, 30 Jul". */
function prettyDay(iso: string): string {
  const d = new Date(iso);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getUTCDay()]}, ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

/** "3h" / "2d" — compact enough for the right rail of a two-column row. */
function shortAge(hours: number): string {
  return hours < 24 ? `${Math.max(1, Math.round(hours))}h` : `${Math.round(hours / 24)}d`;
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
  const waiting = data.demoRequests.waiting ?? [];
  const tasks = data.openTasks ?? [];
  const mail = data.coachMail;

  // ---------------------------------------------------------------- plain text
  const lines: string[] = [`CUP OF HELM — ${prettyDay(data.generatedAt)}`, ''];
  lines.push('NEEDS YOU TODAY');
  if (redCount > 0) for (const red of data.reds) lines.push(`  - ${red}`);
  else lines.push('  Nothing. All clear.');
  lines.push('');

  lines.push('COACHES & CRM');
  if (mail === null) {
    lines.push('  Inbound mail: could not check.');
  } else if (mail.unread > 0) {
    lines.push(`  ${mail.unread} unread coach repl${mail.unread === 1 ? 'y' : 'ies'}:`);
    for (const m of mail.recent) lines.push(`    - ${m.from}: ${m.subject} (${shortAge(m.ageHours)} ago)`);
  } else {
    lines.push('  No unread coach replies.');
  }
  lines.push(
    data.demoRequests.pendingTotal > 0
      ? `  ${data.demoRequests.pendingTotal} awaiting your reply, ${data.demoRequests.new24h} new in 24h`
      : `  Nothing awaiting reply. ${data.demoRequests.new24h} new in 24h.`,
  );
  for (const w of waiting) {
    lines.push(`    - ${w.name ?? w.email}${w.organization ? ` (${w.organization})` : ''} — waiting ${w.waitingDays}d`);
  }
  if (data.signups24h.length > 0) {
    lines.push(`  ${data.signups24h.length} new signup${data.signups24h.length === 1 ? '' : 's'}:`);
    for (const s of data.signups24h) lines.push(`    + ${s.email} (${s.role})`);
  }
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

  lines.push('ACTIVITY (24h)');
  lines.push(`  golf rounds ${golfRounds} | baseball games ${baseballGames} | lift sessions ${liftSessions}`);
  if (activityTotal === 0) lines.push('  Nobody used the product in the last 24 hours.');
  lines.push('');

  lines.push('SHIPPED YESTERDAY');
  if (shipped === undefined) lines.push('  GitHub not reachable — unknown.');
  else if (shipped.length === 0) lines.push('  Nothing merged.');
  else for (const pr of shipped) lines.push(`  - #${pr.number} ${pr.title}`);

  if (tasks.length > 0) {
    lines.push('', 'ON DECK');
    for (const t of tasks) lines.push(`  - ${t.title} (${t.overdue ? 'OVERDUE' : 'due'} ${t.dueLabel})`);
  }
  if (data.deploy) {
    lines.push('', 'RELEASE', `  ${data.deploy.summary}`);
  }
  lines.push('', 'Open the admin: https://helmsportslabs.com/admin');
  const text = lines.join('\n');

  // ---------------------------------------------------------------------- html
  const attention = redCount > 0 ? priorityRows(data.reds) : quiet('Nothing needs you. Go enjoy the coffee.');

  // Coaches & CRM — the humans-waiting section. Mail first (someone wrote and
  // is waiting on a person), then unanswered leads, then signups as an FYI.
  const mailBlock =
    mail === null
      ? quiet("Inbound mail: couldn't check this morning.")
      : mail.recent.length > 0
        ? rowTable(
            mail.recent
              .map((m) =>
                detailRow(
                  clamp(m.from, 42),
                  clamp(m.subject, 60),
                  shortAge(m.ageHours),
                  m.ageHours >= 24 ? RED : MUTED,
                ),
              )
              .join(''),
          )
        : quiet('No unread coach replies.');

  const waitingBlock =
    waiting.length > 0
      ? rowTable(
          waiting
            .map((w) =>
              detailRow(
                clamp(w.name ?? w.email, 42),
                // The subtitle exists to add something the title didn't say.
                // With no name the title IS the email, so an org-less lead gets
                // no second line rather than the same address twice.
                w.organization ? clamp(w.organization, 60) : w.name ? w.email : null,
                `${w.waitingDays}d`,
                w.waitingDays >= 2 ? RED : MUTED,
              ),
            )
            .join(''),
        )
      : '';

  const signupBlock =
    data.signups24h.length > 0
      ? rowTable(data.signups24h.map((s) => detailRow(clamp(s.email, 42), null, s.role, GREEN)).join(''))
      : '';

  const crmBody = `
    ${mailBlock}
    ${
      data.demoRequests.pendingTotal > 0
        ? `<p style="margin:14px 0 0;${BODY}"><strong style="color:${RED}">${data.demoRequests.pendingTotal}</strong> <span style="color:${MUTED}">lead${data.demoRequests.pendingTotal === 1 ? '' : 's'} awaiting your reply &middot; ${data.demoRequests.new24h} new in 24h</span></p>`
        : `<p style="margin:14px 0 0;${BODY};color:${MUTED}">No leads awaiting reply &middot; ${data.demoRequests.new24h} new in 24h</p>`
    }
    ${waitingBlock}
    ${signupBlock ? `<p style="margin:16px 0 4px;${LABEL}">New signups</p>${signupBlock}` : ''}`;

  const errorBody = `
    <p style="margin:0 0 10px;${BODY};color:${MUTED}">
      ${
        data.sentry.unresolved === null
          ? 'Sentry: not reachable'
          : `Sentry: ${data.sentry.unresolved} unresolved &middot; ${data.sentry.regressed ?? 0} regressed`
      }
    </p>
    ${
      data.errors24h.topIncidents.length > 0
        ? rowTable(
            data.errors24h.topIncidents
              .map((i) =>
                detailRow(
                  clamp(i.title, 52),
                  `${i.affectedUsers} user${i.affectedUsers === 1 ? '' : 's'} affected`,
                  `${i.occurrences}x`,
                  i.occurrences >= 10 ? RED : MUTED,
                ),
              )
              .join(''),
          )
        : quiet('No incidents worth naming.')
    }`;

  const activityBody = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">
      ${bar('Golf rounds', golfRounds, activityMax)}
      ${bar('Baseball games', baseballGames, activityMax)}
      ${bar('Lift sessions', liftSessions, activityMax)}
    </table>
    ${
      activityTotal === 0
        ? `<p style="margin:12px 0 0;${BODY};color:${RED}">Nobody used the product in the last 24 hours.</p>`
        : ''
    }`;

  const shippedBody =
    shipped === undefined
      ? quiet('GitHub was not reachable, so this is unknown rather than empty.')
      : shipped.length === 0
        ? quiet('Nothing merged yesterday.')
        : rowTable(shipped.map((pr) => detailRow(clamp(pr.title, 56), null, `#${pr.number}`, GREEN)).join(''));

  const tasksBody =
    tasks.length > 0
      ? rowTable(
          tasks
            .map((t) =>
              detailRow(
                clamp(t.title, 52),
                null,
                t.overdue ? `overdue ${t.dueLabel}` : t.dueLabel,
                t.overdue ? RED : MUTED,
              ),
            )
            .join(''),
        )
      : '';

  const ribbonTone = redCount > 0 ? RED : DEEP_GREEN;
  const ribbonBg = redCount > 0 ? RED_SOFT : GREEN_SOFT;
  const ribbonText =
    redCount > 0
      ? `${redCount} thing${redCount === 1 ? '' : 's'} need you today`
      : 'Nothing needs you this morning';

  // The four numbers that decide whether the rest of the email gets read.
  // "Shipped" shows an em dash rather than 0 when GitHub was unreachable — the
  // same unknown-vs-zero rule the sections below follow.
  const statStrip = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid ${HAIRLINE};border-radius:10px">
    <tr>
      ${statCell(String(data.errors24h.total), 'Error groups', data.errors24h.critical > 0 ? RED : INK, true)}
      ${statCell(String(data.demoRequests.pendingTotal), 'Awaiting reply', data.demoRequests.pendingTotal > 0 ? RED : INK, false)}
      ${statCell(String(activityTotal), 'Activity 24h', activityTotal === 0 ? RED : INK, false)}
      ${statCell(shipped === undefined ? '—' : String(shipped.length), 'Shipped', shipped && shipped.length > 0 ? GREEN : INK, false)}
    </tr>
  </table>`;

  // Inbox preview line. Gmail shows it next to the subject, so it carries the
  // one fact the subject cannot fit.
  const preheader =
    redCount > 0
      ? `${ribbonText} · ${data.errors24h.total} error groups overnight`
      : `All clear · ${activityTotal} sessions in the last 24h`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${PAGE};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0">${esc(preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:${PAGE}">
<tr><td align="center" style="padding:32px 14px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:620px;background:${CARD};border:1px solid ${HAIRLINE};border-radius:16px;padding:30px 30px 26px;font-family:${SANS};color:${INK}">
  <tr><td>
    <div style="${LABEL}">Helm Sports Labs &middot; Morning briefing</div>
    <div style="font-family:${SANS};font-size:31px;font-weight:700;letter-spacing:-.025em;line-height:1.1;padding-top:10px">Cup of Helm</div>
    <div style="font-family:${MONO};font-size:12px;color:${MUTED};padding-top:8px">${esc(prettyDay(data.generatedAt))} &middot; last 24 hours</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-top:18px">
      <tr><td style="background:${ribbonBg};border-left:3px solid ${ribbonTone};border-radius:0 8px 8px 0;padding:12px 16px;font-family:${SANS};font-size:15px;font-weight:600;color:${ribbonTone}">${esc(ribbonText)}</td></tr>
    </table>
    <div style="padding-top:18px">${statStrip}</div>
  </td></tr>
  ${section('Needs you today', attention)}
  ${section('Coaches & CRM', crmBody, mail && mail.unread > 0 ? `${mail.unread} unread` : undefined)}
  ${section('Overnight errors', errorBody, `${data.errors24h.critical} critical`)}
  ${section('Activity, last 24h', activityBody, `${activityTotal} total`)}
  ${section('Shipped yesterday', shippedBody)}
  ${tasksBody ? section('On deck', tasksBody, `${tasks.length} due`) : ''}
  ${
    data.deploy
      ? section(
          'Release',
          quiet(data.deploy.summary),
          data.deploy.state === 'stale'
            ? 'behind'
            : data.deploy.state === 'unknown'
              ? 'unknown'
              : undefined,
        )
      : ''
  }
  <tr><td style="padding:28px 0 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border-top:1px solid ${HAIRLINE}">
      <tr><td style="padding-top:18px">
        <p style="margin:0;font-family:${SANS};font-size:14px">
          <a href="https://helmsportslabs.com/admin" style="color:${DEEP_GREEN};font-weight:700;text-decoration:underline">Open the admin dashboard &rarr;</a>
        </p>
        <p style="margin:12px 0 0;font-family:${MONO};font-size:11px;color:${FAINT};line-height:1.6">Cup of Helm runs every morning at 7am. Helm Sports Labs.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}
