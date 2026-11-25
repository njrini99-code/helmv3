/**
 * The Locker welcome email (owner's pick, 2026-11-25) for a new GolfHelm head coach: their username, a temporary
 * password, one code per team and how players join. Email-safe: tables and inline styles only, no SVG, flexbox or
 * grid (Gmail strips SVG, Outlook ignores flexbox). The two images travel as inline attachments (cid:), so nothing
 * depends on a public URL. Pure: no I/O, so the test can render it.
 */

export const HERO_CID = 'helm-locker-hero';
export const MARK_CID = 'helm-mark';

const INK = '#1c1b18';
const INK2 = '#3a3833';
const INK3 = '#4a463f';
const LINK = '#155a39';
const SANS = "'Instrument Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace";

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** "Men’s team" / "Women’s team" from golf_teams.gender; anything else uses the team's own name. */
export function teamLabel(team) {
  if (team.gender === 'mens') return 'Men’s team';
  if (team.gender === 'womens') return 'Women’s team';
  return team.name;
}

/** Men's first, then women's, then anything else by name, so the plates always sit in the same order. */
export function orderTeams(teams) {
  const rank = (t) => (t.gender === 'mens' ? 0 : t.gender === 'womens' ? 1 : 2);
  return [...teams].sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name)));
}

function intro(school, teams) {
  if (teams.length === 2 && teams[0].gender === 'mens' && teams[1].gender === 'womens') {
    return `Your locker is ready. ${school}’s men’s and women’s teams are both set up under one login. Here’s how to get in and bring your players with you.`;
  }
  if (teams.length === 1) {
    const who = teams[0].gender === 'mens' ? 'men’s team is' : teams[0].gender === 'womens' ? 'women’s team is' : 'team is';
    return `Your locker is ready. ${school}’s ${who} set up. Here’s how to get in and bring your players with you.`;
  }
  return `Your locker is ready. ${school}’s teams are set up under one login. Here’s how to get in and bring your players with you.`;
}

// Label above value at every width: a password or a long address must never break mid-word on a phone.
const loginRow = (label, value, mono, last) => `<tr>
<td style="padding: 14px 20px;${last ? '' : ' border-bottom: 1px solid #e2ddd0;'}">
<div style="font-family: ${SANS}; font-size: 13px; line-height: 18px; color: ${INK3};">${label}</div>
<div style="padding-top: 4px; font-family: ${mono ? MONO : SANS}; font-size: ${mono ? 18 : 16}px; line-height: 24px; font-weight: ${mono ? 500 : 600}; color: ${INK};${mono ? ' letter-spacing: 0.02em;' : ''} overflow-wrap: anywhere;">${value}</div>
</td>
</tr>`;

const plate = (label, code) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #e3cf98; border: 1px solid #9c7c3c; border-radius: 6px;">
<tr><td style="padding: 3px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #f2e4bb; border-radius: 4px;">
<tr><td align="center" style="padding: 18px 12px 4px; font-family: ${SANS}; font-size: 13px; line-height: 18px; font-weight: 600; color: #5a4418;">${esc(label)}</td></tr>
<tr><td align="center" class="hl-code" style="padding: 4px 12px 16px; font-family: ${MONO}; font-size: 24px; line-height: 30px; font-weight: 500; letter-spacing: 0.14em; color: #2f230b;">${esc(code)}</td></tr>
</table></td></tr></table>`;

function plates(teams) {
  if (teams.length === 1) return plate(teamLabel(teams[0]), teams[0].join_code);
  const rows = [];
  for (let i = 0; i < teams.length; i += 2) {
    const [a, b] = [teams[i], teams[i + 1]];
    rows.push(`<tr>
<td width="50%" valign="top" style="padding: 0 6px ${i + 2 < teams.length ? 12 : 0}px 0;">${plate(teamLabel(a), a.join_code)}</td>
<td width="50%" valign="top" style="padding: 0 0 ${i + 2 < teams.length ? 12 : 0}px 6px;">${b ? plate(teamLabel(b), b.join_code) : ''}</td>
</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join('')}</table>`;
}

const step = (n, html) => `<tr>
<td width="22" valign="top" style="padding: 0 14px 12px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="22" height="22" align="center" valign="middle" style="width: 22px; height: 22px; border-radius: 11px; background: #e7dfc9; font-family: ${SANS}; font-size: 12px; line-height: 22px; font-weight: 600; color: #5a4418;">${n}</td></tr></table></td>
<td valign="top" style="padding: 0 0 12px; font-family: ${SANS}; font-size: 15px; line-height: 23px; color: ${INK2};">${html}</td>
</tr>`;

const rule = `<tr><td style="padding: 36px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" style="height: 1px; line-height: 1px; font-size: 1px; background: #ddd8cb;">&nbsp;</td></tr></table></td></tr>`;

/**
 * @param {{ coachLastName: string, schoolName: string, email: string, password: string,
 *           teams: Array<{ name: string, gender: string | null, join_code: string }>, siteUrl?: string }} input
 * @returns {{ subject: string, html: string, text: string }}
 */
export function buildCoachWelcomeEmail(input) {
  const site = (input.siteUrl ?? 'https://helmsportslabs.com').replace(/\/+$/, '');
  const loginUrl = `${site}/golf/login`;
  const signupUrl = `${site}/golf/signup`;
  const host = site.replace(/^https?:\/\//, '');
  const teams = orderTeams(input.teams);
  if (!teams.length) throw new Error('A welcome email needs at least one team code.');
  for (const t of teams) if (!t.join_code) throw new Error(`Team "${t.name}" has no join code.`);
  const coach = esc(input.coachLastName.trim());
  const subject = `Welcome to Helm, Coach ${input.coachLastName.trim()}`;
  const link = (url, label) => `<a href="${url}" style="color: ${LINK}; font-weight: 600; text-decoration: underline;">${label}</a>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&amp;family=JetBrains+Mono:wght@500&amp;display=swap" rel="stylesheet">
<style>
@media (max-width: 620px) {
  .hl-pad { padding: 32px 24px 36px !important; }
  .hl-outer { padding: 16px 8px 32px !important; }
  .hl-h1 { font-size: 28px !important; line-height: 34px !important; }
  .hl-code { font-size: 19px !important; letter-spacing: 0.08em !important; padding: 4px 6px 14px !important; }
}
</style>
</head>
<body style="margin: 0; padding: 0; background: #e8e3d5;">
<div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">Your GolfHelm login and team codes are inside.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #e8e3d5;">
<tr><td align="center" class="hl-outer" style="padding: 40px 16px 44px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px;">
<tr><td style="background: #f5f1e6; border-radius: 20px; border: 1px solid #ddd6c4; overflow: hidden;">
<img src="cid:${HERO_CID}" width="600" alt="A locker with a golf bag and cap" style="display: block; width: 100%; max-width: 600px; height: auto; border: 0; border-radius: 20px 20px 0 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td class="hl-pad" style="padding: 40px 48px 44px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding-bottom: 26px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="padding-right: 9px;"><img src="cid:${MARK_CID}" width="26" height="26" alt="" style="display: block; border: 0;"></td>
<td valign="middle" style="font-family: ${SANS}; font-size: 19px; line-height: 24px; font-weight: 600; letter-spacing: -0.02em; color: ${INK};">Golf<span style="color: #1f7a3a;">Helm</span></td>
</tr></table></td></tr>
<tr><td class="hl-h1" style="padding-bottom: 12px; font-family: ${SANS}; font-size: 34px; line-height: 40px; font-weight: 700; letter-spacing: -0.028em; color: ${INK};">Welcome to Helm, Coach ${coach}.</td></tr>
<tr><td style="padding-bottom: 36px; font-family: ${SANS}; font-size: 16px; line-height: 25px; color: ${INK2};">${esc(intro(input.schoolName.trim(), teams))}</td></tr>

<tr><td style="padding-bottom: 12px; font-family: ${SANS}; font-size: 15px; line-height: 20px; font-weight: 600; color: ${INK};">Your login</td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #fbf9f3; border: 1px solid #e2ddd0; border-radius: 14px;">
${loginRow('Username', esc(input.email))}${loginRow('Temporary password', esc(input.password), true, true)}
</table></td></tr>
<tr><td style="padding-top: 14px; font-family: ${SANS}; font-size: 15px; line-height: 23px; color: ${INK2};">Sign in at ${link(loginUrl, `${host}/golf/login`)}, then choose your own password in Settings, under Account.</td></tr>
${rule}
<tr><td style="padding-bottom: 6px; font-family: ${SANS}; font-size: 15px; line-height: 20px; font-weight: 600; color: ${INK};">Your team ${teams.length === 1 ? 'code' : 'codes'}</td></tr>
<tr><td style="padding-bottom: 16px; font-family: ${SANS}; font-size: 15px; line-height: 23px; color: ${INK2};">${teams.length === 1 ? 'Your players use this code to join your team.' : 'Each code joins one team, so send each roster its own.'}</td></tr>
<tr><td>${plates(teams)}</td></tr>
${rule}
<tr><td style="padding-bottom: 14px; font-family: ${SANS}; font-size: 15px; line-height: 20px; font-weight: 600; color: ${INK};">How your players join</td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${step(1, `They go to ${link(signupUrl, `${host}/golf/signup`)} on their phone.`)}
${step(2, 'They type their team’s code. Capitals and dashes don’t matter.')}
${step(3, 'They add their name, class year and email, choose a password, and appear on your roster.')}
</table></td></tr>
</table>
</td></tr>
</table>
</td></tr>
<tr><td align="center" style="padding: 26px 40px 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="padding-right: 8px;"><img src="cid:${MARK_CID}" width="16" height="16" alt="" style="display: block; border: 0;"></td>
<td valign="middle" style="font-family: ${SANS}; font-size: 13px; line-height: 18px; font-weight: 500; color: ${INK3};">A Helm Sports Labs product</td>
</tr></table>
<p style="margin: 10px auto 0; max-width: 440px; font-family: ${SANS}; font-size: 12px; line-height: 18px; color: ${INK3};">This email has your temporary password, so keep it to yourself. Your team codes are always in Settings, under Team.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const codes = teams.map((t) => `  ${teamLabel(t)}: ${t.join_code}`).join('\n');
  const text = `Welcome to Helm, Coach ${input.coachLastName.trim()}.

${intro(input.schoolName.trim(), teams)}

YOUR LOGIN
  Username: ${input.email}
  Temporary password: ${input.password}
Sign in at ${loginUrl}, then choose your own password in Settings, under Account.

YOUR TEAM ${teams.length === 1 ? 'CODE' : 'CODES'}
${codes}

HOW YOUR PLAYERS JOIN
  1. They go to ${signupUrl} on their phone.
  2. They type their team's code. Capitals and dashes don't matter.
  3. They add their name, class year and email, choose a password, and appear on your roster.

This email has your temporary password, so keep it to yourself. Your team codes are always in Settings, under Team.
A Helm Sports Labs product
`;
  return { subject, html, text };
}
