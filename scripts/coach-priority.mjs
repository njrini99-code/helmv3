/**
 * Coach send-priority model for the "Coach First Touch" cold campaign.
 *
 * Replaces alphabetical order with a deterministic, explainable score so the
 * WARMEST, most customer-like coaches go first. This also protects deliverability:
 * early opens/replies from warm prospects build sender reputation, which lifts
 * inbox placement for the colder tail sent later.
 *
 * Only fields that are actually populated in crm_coaches drive the score:
 *   - last_email_event_type  (prior-campaign engagement — strongest signal)
 *   - status                 (pipeline warmth)
 *   - conference / division  (social-proof similarity to current customers)
 * team_size / current_software / priority / tags / timezone are empty in the
 * data today, so they are intentionally NOT used (adding them would be fiction).
 *
 * Customer anchor (all 5 current customers are D3; 4 are in the ODAC):
 *   Guilford, Hampden-Sydney, Shenandoah, Lynchburg → Old Dominion Athletic Conf.
 *   Denison → North Coast Athletic Conf.
 */

export function scoreCoach(coach) {
  const reasons = [];
  let score = 0;

  // 1) prior engagement — best predictor of a reply, and the deliverability lever
  const ev = (coach?.last_email_event_type || '').toLowerCase();
  if (ev === 'clicked') { score += 100; reasons.push('clicked a prior email'); }
  else if (ev === 'opened') { score += 60; reasons.push('opened a prior email'); }
  else if (ev === 'delivered') { score += 20; reasons.push('prior email delivered'); }
  // null / bounced / other → +0 (bounced is filtered out before scoring anyway)

  // 2) pipeline status
  const st = (coach?.status || '').toLowerCase();
  if (st === 'proposal') { score += 50; reasons.push('in proposal stage'); }
  else if (st === 'engaged') { score += 30; reasons.push('previously engaged'); }

  // 3) "looks like our customers" — social-proof fit. Strategy = LIKE YOUR CUSTOMERS:
  // all 5 customers are D3, so D3/D2/NAIA/JUCO (small-program profile) rank above D1.
  // Engagement (+100 clicked) still dominates; this mainly orders the never-contacted tail.
  const conf = (coach?.conference || '').toLowerCase();
  const div = (coach?.division ?? '').toString().toUpperCase();
  if (conf.includes('old dominion')) { score += 40; reasons.push('ODAC — 4 customers in this conference'); }
  else if (conf.includes('north coast')) { score += 25; reasons.push('NCAC — Denison in this conference'); }
  else if (div === 'D3') { score += 15; reasons.push('D3 — matches all 5 customers'); }
  else if (div === 'NAIA') { score += 12; reasons.push('NAIA — small-program profile, strong fit'); }
  else if (div === 'D2') { score += 12; reasons.push('D2 — adjacent to customer profile'); }
  else if (div === 'JUCO') { score += 8; reasons.push('JUCO — small/hands-on'); }
  else if (div === 'D1') { score += 5; reasons.push('D1 — least like current customers (sent last)'); }

  return { score, reasons };
}

/** Human-readable tier for reporting / CRM display. */
export function tierOf(score) {
  if (score >= 130) return 'A_hot';   // e.g. clicked + engaged, or clicked + ODAC
  if (score >= 80)  return 'B_warm';  // clicked, or opened + status/fit
  if (score >= 40)  return 'C_mid';   // opened, or delivered + status, or strong fit
  return 'D_cold';                    // delivered-only / no engagement / new upload
}

/**
 * Stable ranking comparator: warmest first, then cluster by conference
 * (league-mates together → compounding word-of-mouth), then oldest enrollment.
 * Each item must expose { score, conference, enrolledAt }.
 */
export function byPriority(a, b) {
  return (b.score - a.score)
    || (a.conference || '').localeCompare(b.conference || '')
    || (new Date(a.enrolledAt).getTime() - new Date(b.enrolledAt).getTime());
}
