import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hits, ratchet, ROOT, slack, walk } from './_scan';

/**
 * Type (MOTION-AND-VISUAL 4.3, Nick 15 Nov 2026): nine roles, scaled by --ch-type-k so text follows iPhone Text Size.
 * Large title, title, headline, body, callout, footnote, caption, the hero figure and the row figure. Every older named
 * role (serif, display, label, eyebrow, meta, row, section, card and bar titles, the 52 hero, the 40 and 44 figures) was
 * mapped onto one of the nine at its every use and deleted. The numeric steps (--ch-type-11 to -34) are the next to go:
 * their reads are counted per stylesheet and may only fall, a screen at a time, with before and after screenshots.
 */
const tokens = readFileSync(join(ROOT, 'styles/tokens.css'), 'utf8');
const css = walk(join(ROOT, 'styles'), /\.css$/).filter((f) => !f.endsWith('tokens.css'));
const NINE = ['large-title', 'title', 'headline', 'body', 'callout', 'footnote', 'caption', 'figure-hero', 'figure'];
const OLD = /--ch-(?:type|track)-(?:serif-[lms]|display-[ls]|body-[ls]|label|label-s|figure-l|figure-40-500|figure-44-500|bar-title|card-title|section|eyebrow|row|meta|hero)(?![a-z0-9-])/;
const STEP = /var\(--ch-type-\d+(?:-medium|-strong)?\)/;

describe('type roles (MOTION-AND-VISUAL 4.3)', () => {
  it('the nine roles are defined, at their desktop values, from --ch-type-k', () => {
    for (const r of NINE) expect(tokens, r).toMatch(new RegExp(`--ch-type-${r}: \\d{3} calc\\(\\d+ \\* var\\(--ch-type-k\\)\\)`));
    expect(tokens).toMatch(/--ch-type-figure-hero: 600 calc\(56 \* var\(--ch-type-k\)\)\/1/);
    expect(tokens).toMatch(/--ch-type-figure-hero: 600 calc\(44 \* var\(--ch-type-k\)\)\/1/);
  });
  it('no older named role is defined or read anywhere in Clubhouse', () => {
    expect(hits(OLD, walk(ROOT, /\.(tsx?|css)$/))).toEqual([]);
  });
  it('the legacy leadings are tokens equal to the old roles', () => {
    const t = hits(/--ch-lead-(?:caption|label):/, [join(ROOT, 'styles/tokens.css')]).map((h) => h.text);
    expect(t).toEqual(['--ch-lead-caption: 1.4;', '--ch-lead-label: 1.3;']);
  });
  it('reads of the numeric steps only fall, file by file', () => {
    const found = hits(STEP, css);
    expect(ratchet(found, STEP_READS)).toEqual({ over: [], stale: [] });
    expect(slack(found, STEP_READS)).toEqual([]);
  });
});

/** Lines reading a numeric type step per stylesheet on 15 Nov 2026, after the named roles moved. Only falls. */
const STEP_READS: Record<string, number> = {
  'styles/auth.css': 1,
  'styles/calendar.css': 86,
  'styles/class-awareness.css': 35,
  'styles/classes.css': 74,
  'styles/coachhelm-ask-cards.css': 87,
  'styles/coachhelm-ask-look.css': 37,
  'styles/coachhelm-ask-studio.css': 69,
  'styles/coachhelm-ask-v2.css': 162,
  'styles/coachhelm-ask.css': 24,
  'styles/coachhelm-brief.css': 10,
  'styles/coachhelm-dive.css': 39,
  'styles/coachhelm-file.css': 61,
  'styles/coachhelm-plan.css': 119,
  'styles/coachhelm-profile.css': 18,
  'styles/coachhelm-read.css': 25,
  'styles/coachhelm-standing.css': 18,
  'styles/coachhelm-team.css': 79,
  'styles/coachhelm-thread.css': 53,
  'styles/coachhelm-track.css': 14,
  'styles/coachhelm-views.css': 7,
  'styles/coachhelm.css': 38,
  'styles/command.css': 7,
  'styles/component-playground.css': 3,
  'styles/controls.css': 28,
  'styles/goals.css': 3,
  'styles/hero-tones.css': 3,
  'styles/home.css': 150,
  'styles/hub.css': 92,
  'styles/live.css': 39,
  'styles/messages-details.css': 31,
  'styles/messages-inbox.css': 12,
  'styles/messages-overlays.css': 9,
  'styles/messages-thread.css': 9,
  'styles/messages.css': 113,
  'styles/onboard.css': 37,
  'styles/practice.css': 125,
  'styles/qualifiers.css': 66,
  'styles/quick-chat.css': 10,
  'styles/recruiting.css': 39,
  'styles/roster.css': 90,
  'styles/rounds-recover.css': 7,
  'styles/rounds-setup.css': 53,
  'styles/rounds-track.css': 75,
  'styles/rounds.css': 152,
  'styles/settings.css': 50,
  'styles/shell.css': 45,
  'styles/stats-redesign.css': 94,
  'styles/stats.css': 189,
  'styles/tournament-fields.css': 16,
  'styles/tournaments-compare.css': 32,
  'styles/tournaments-desk.css': 38,
  'styles/tournaments-home.css': 4,
  'styles/tournaments-lineup.css': 8,
  'styles/tournaments-live.css': 15,
  'styles/tournaments-player.css': 17,
  'styles/tournaments-review.css': 18,
  'styles/tournaments.css': 10,
  'styles/ui.css': 40,
  'styles/whats-new.css': 1,
};
