// ============================================================================
// COLD-EMAIL SPAM SCORE (authoring-time linter)
// ============================================================================
//
// A lightweight, dependency-free heuristic that scores a cold 1:1 email the way
// Gmail's filters roughly would, so you can fix spammy copy BEFORE sending.
// Pure function — safe on client and server. Higher score = more spam-like.
//
//   level 'good'  (< 3)   — looks like a normal human note
//   level 'warn'  (3–5)   — a few risk signals, tidy it up
//   level 'risk'  (>= 6)  — likely to land in Spam/Promotions; fix before send
//
// This is guidance, not a gate — it never blocks a send, it just warns.
// ============================================================================

export interface SpamScore {
  score: number;
  level: 'good' | 'warn' | 'risk';
  issues: string[];
}

// Classic SpamAssassin-style trigger phrases that hurt even 1:1 cold mail.
const SPAM_PHRASES = [
  'free', 'act now', 'limited time', 'click here', 'buy now', 'guarantee',
  'risk-free', 'risk free', '100%', 'winner', 'congratulations', 'urgent',
  'no obligation', 'order now', 'cheap', 'offer expires', 'this is not spam',
  'extra income', 'make money', 'double your', 'best price', 'cash bonus',
];

export function scoreColdEmail(input: { subject: string; body: string }): SpamScore {
  const subject = input.subject ?? '';
  const body = input.body ?? '';
  const issues: string[] = [];
  let score = 0;
  const add = (n: number, msg: string) => { score += n; issues.push(msg); };

  // ── Subject ──
  const subjLetters = subject.replace(/[^a-zA-Z]/g, '');
  if (subjLetters.length >= 4 && subjLetters === subjLetters.toUpperCase()) {
    add(3, 'Subject is ALL CAPS — reads as spam.');
  }
  if (subject.length > 70) add(1, 'Subject is long (>70 chars) — keep it short and human.');
  if (subject.includes('!')) add(2, 'Exclamation mark in the subject — drop it for cold email.');

  // ── Body ──
  const exclamations = (body.match(/!/g) ?? []).length;
  if (exclamations >= 3) add(2, `${exclamations} exclamation marks — tone it down.`);

  const capsWords = (body.match(/\b[A-Z]{4,}\b/g) ?? []).length;
  if (capsWords >= 2) add(1, `${capsWords} ALL-CAPS words in the body.`);

  const links = body.match(/https?:\/\/\S+/gi) ?? [];
  if (links.length > 2) add(2, `${links.length} links — one is plenty for a cold note.`);
  if (links.some((l) => /(bit\.ly|tinyurl|goo\.gl|t\.co|ow\.ly|rebrand\.ly)/i.test(l))) {
    add(3, 'URL shortener detected — strong spam signal; use the real link.');
  }

  if (/\$\s?\d|\$\$\$/.test(body)) add(1, 'Money/$ language — risky for cold outreach.');

  const hay = `${subject} ${body}`.toLowerCase();
  const phraseHits = SPAM_PHRASES.filter((p) => hay.includes(p));
  if (phraseHits.length) {
    add(Math.min(4, phraseHits.length * 2), `Spam-trigger phrase(s): ${phraseHits.slice(0, 4).join(', ')}.`);
  }

  // ── Personalization ── (raw template should contain a merge token)
  const personalized = /\{(name|first_name|last_name|title|school|conference|division|program)\}/.test(`${subject} ${body}`);
  if (!personalized) {
    add(2, 'No personalization token (e.g. {first_name}, {school}) — generic copy reads as bulk.');
  }

  // ── Length ──
  const plainLen = body.replace(/\s+/g, ' ').trim().length;
  if (plainLen > 0 && plainLen < 120) add(1, 'Body is very short — a real note is usually a few sentences.');

  const level: SpamScore['level'] = score >= 6 ? 'risk' : score >= 3 ? 'warn' : 'good';
  return { score, level, issues };
}
