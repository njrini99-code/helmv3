import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '../..');

// Regression guard for Wave W6-copy (ultra-audit master synthesis §A6 —
// microcopy rewrites in golf voice).
//
// W6A rewrote the user-facing copy on the CoachHelm v3 chat + narrative
// surfaces, the golf onboarding flows, and the save-round drawer so the
// product reads in golf nouns (not generic SaaS), narrates outcomes, and
// never double-apologizes in errors.
//
// This test asserts the *old* SaaS-flat / double-apologizing phrases never
// reappear in the files the wave owns. It is intentionally SCOPED to those
// files: the same phrases still exist (legitimately, out of W6 scope) in
// server actions, error boundaries, and the baseball product, so a repo-wide
// grep would produce false failures. If a phrase below is reintroduced into
// a scoped file, this test fails.

// (file, [banned phrases]) — banned phrases are the exact legacy strings the
// W6 rewrites replaced. Each must stay at 0 occurrences in its file.
const SCOPED = [
  [
    'src/components/golf/coachhelm/v3/Chat/ChatComposer.tsx',
    ['Ask anything about your team'],
  ],
  [
    'src/components/golf/coachhelm/v3/Chat/ChatMessageList.tsx',
    ['Thinking…', 'Thinking...'],
  ],
  [
    'src/components/golf/coachhelm/v3/HeroNarrativeCard.tsx',
    ['AI summary'],
  ],
  [
    'src/components/golf/coachhelm/v3/RoundReviewLlmCard.tsx',
    ['AI summary', 'Round summary'],
  ],
  [
    'src/components/golf/SaveRoundModal.tsx',
    ['Failed to save round. Please check your connection and try again.'],
  ],
  [
    'src/app/golf/(onboarding)/coach/page.tsx',
    [
      'Tell us about your school and team',
      'Failed to complete setup. Please try again.',
      'An unexpected error occurred.',
    ],
  ],
  [
    'src/app/golf/(onboarding)/player/page.tsx',
    [
      'Failed to complete setup. Please try again.',
      'An error occurred. Please try again.',
      'No user session found. Please log in again.',
    ],
  ],
];

test('W6 microcopy — banned SaaS-flat phrases stay removed from owned surfaces', async () => {
  const violations = [];

  for (const [rel, phrases] of SCOPED) {
    const abs = join(repoRoot, rel);
    try {
      await stat(abs);
    } catch {
      violations.push(`${rel}: file missing — wave surface moved or deleted`);
      continue;
    }
    let content;
    try {
      content = await readFile(abs, 'utf8');
    } catch {
      violations.push(`${rel}: unreadable`);
      continue;
    }
    for (const phrase of phrases) {
      if (content.includes(phrase)) {
        violations.push(`${rel}: reintroduced banned phrase "${phrase}"`);
      }
    }
  }

  assert.equal(
    violations.length,
    0,
    `Found ${violations.length} reintroduced microcopy phrase(s). W6A rewrote ` +
      `these into golf voice (golf nouns, outcome-narrating, no double-apology). ` +
      `Do not revert:\n${violations.join('\n')}`
  );
});

test('W6 microcopy — golf-voice replacements are present', async () => {
  // Positive assertions so the test also fails if a rewrite is silently
  // reverted to a different (but still non-golf) string.
  const EXPECT = [
    [
      'src/components/golf/coachhelm/v3/Chat/ChatComposer.tsx',
      'Ask about your players, rounds, or qualifying',
    ],
    [
      'src/components/golf/coachhelm/v3/Chat/ChatMessageList.tsx',
      'Reading the numbers',
    ],
    ['src/components/golf/coachhelm/v3/HeroNarrativeCard.tsx', 'CoachHelm'],
    ['src/components/golf/coachhelm/v3/RoundReviewLlmCard.tsx', 'CoachHelm'],
    ['src/components/golf/coachhelm/v3/RoundReviewLlmCard.tsx', 'Round review'],
    ['src/components/golf/SaveRoundModal.tsx', "Couldn't save your round"],
  ];

  const missing = [];
  for (const [rel, phrase] of EXPECT) {
    const abs = join(repoRoot, rel);
    let content = '';
    try {
      content = await readFile(abs, 'utf8');
    } catch {
      missing.push(`${rel}: unreadable`);
      continue;
    }
    if (!content.includes(phrase)) {
      missing.push(`${rel}: expected golf-voice phrase "${phrase}" not found`);
    }
  }

  assert.equal(
    missing.length,
    0,
    `W6A golf-voice rewrite(s) missing or reverted:\n${missing.join('\n')}`
  );
});
