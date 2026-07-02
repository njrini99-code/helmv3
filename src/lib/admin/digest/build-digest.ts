export interface DigestData {
  generatedAt: string;
  errors24h: {
    total: number;
    critical: number;
    topIncidents: Array<{ title: string; occurrences: number; affectedUsers: number }>;
  };
  sentry: { unresolved: number | null; regressed: number | null };
  signups24h: Array<{ email: string; role: string }>;
  activity24h: { golfRounds: number; baseballGames: number; liftSessions: number };
  reds: string[];
}

export interface DigestEmail {
  subject: string;
  html: string;
  text: string;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Inverted pyramid: reds first, then errors, then signups/activity. */
export function buildDigestEmail(data: DigestData): DigestEmail {
  const redCount = data.reds.length;
  const day = new Date(data.generatedAt).toISOString().slice(0, 10);
  const subject =
    redCount > 0
      ? `Helm Bridge ${day} — ${redCount} red item${redCount === 1 ? '' : 's'}`
      : `Helm Bridge ${day} — All clear`;

  const lines: string[] = [];
  if (redCount > 0) {
    lines.push('RED ITEMS');
    for (const red of data.reds) lines.push(`  ! ${red}`);
    lines.push('');
  }
  lines.push(
    `Errors 24h: ${data.errors24h.total} (${data.errors24h.critical} critical)`,
    data.sentry.unresolved === null
      ? 'Sentry: not configured'
      : `Sentry: ${data.sentry.unresolved} unresolved · ${data.sentry.regressed ?? 0} regressed`,
    '',
  );
  if (data.errors24h.topIncidents.length > 0) {
    lines.push('Top incidents:');
    for (const inc of data.errors24h.topIncidents) {
      lines.push(`  - ${inc.title} (${inc.occurrences}x, ${inc.affectedUsers} users)`);
    }
    lines.push('');
  }
  if (data.signups24h.length > 0) {
    lines.push(`New signups (${data.signups24h.length}):`);
    for (const s of data.signups24h) lines.push(`  + ${s.email} (${s.role})`);
    lines.push('');
  }
  lines.push(
    `Activity: ${data.activity24h.golfRounds} golf rounds · ${data.activity24h.baseballGames} baseball games · ${data.activity24h.liftSessions} lift sessions`,
    '',
    'Open the bridge: https://helmsportslabs.com/admin',
  );
  const text = lines.join('\n');

  const html = `<!doctype html><html><body style="font-family:ui-monospace,Menlo,monospace;background:#faf8f2;color:#1c1917;padding:24px">
  <h2 style="margin:0 0 4px">${esc(subject)}</h2>
  <p style="color:${redCount > 0 ? '#DC2626' : '#16A34A'};font-weight:600">
    ${redCount > 0 ? `${redCount} item${redCount === 1 ? '' : 's'} need attention` : 'All systems nominal'}
  </p>
  ${redCount > 0 ? `<ul>${data.reds.map((r) => `<li style="color:#DC2626">${esc(r)}</li>`).join('')}</ul>` : ''}
  <p><strong>Errors 24h:</strong> ${data.errors24h.total} (${data.errors24h.critical} critical)<br/>
  <strong>Sentry:</strong> ${data.sentry.unresolved === null ? 'not configured' : `${data.sentry.unresolved} unresolved · ${data.sentry.regressed ?? 0} regressed`}</p>
  ${data.errors24h.topIncidents.length > 0 ? `<ul>${data.errors24h.topIncidents.map((i) => `<li>${esc(i.title)} — ${i.occurrences}x, ${i.affectedUsers} users</li>`).join('')}</ul>` : ''}
  ${data.signups24h.length > 0 ? `<p><strong>New signups:</strong></p><ul>${data.signups24h.map((s) => `<li>${esc(s.email)} (${esc(s.role)})</li>`).join('')}</ul>` : ''}
  <p><strong>Activity:</strong> ${data.activity24h.golfRounds} golf rounds · ${data.activity24h.baseballGames} baseball games · ${data.activity24h.liftSessions} lift sessions</p>
  <p><a href="https://helmsportslabs.com/admin">Open Helm Bridge →</a></p>
  </body></html>`;

  return { subject, html, text };
}
