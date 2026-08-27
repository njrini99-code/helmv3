import { describe, it, expect } from 'vitest';
import {
  describesFeature,
  identityTokens,
  countOccurrences,
  MIN_HITS,
} from '../../../scripts/knowledge/check-doc-relevance.mjs';

/**
 * The check that a registry pointer resolves to the RIGHT document.
 *
 * `check-doc-coverage.mjs` already proves every mapped doc exists. That is a
 * check that the pointer resolves; it says nothing about what it resolves TO.
 * On 2026-08-27 `memory/registry.yml` pointed the `recruiting` feature's
 * canonical doc at `memory/context/golfhelm-features.md`, a 1,399-line file
 * containing zero occurrences of "recruit". 17 feature docs existed for 18
 * features and nothing caught it, because the file was there and `fileExists`
 * was satisfied.
 *
 * The first case below is that exact bug, frozen. The rest pin the heuristic's
 * edges, because a doc-quality check that fires on healthy docs gets deleted
 * within a week — false positives are the failure mode that kills this kind of
 * gate, so most of these tests are about NOT firing.
 */

describe('describesFeature — the 2026-08-27 recruiting regression', () => {
  it('fails a doc that never mentions the feature it is mapped to', () => {
    // Abridged stand-in for the real corpus: plausible, on-topic for the repo,
    // and entirely silent about recruiting — which is precisely why it passed
    // every check that existed at the time.
    const corpus = `
      # GolfHelm Feature Registry
      ## 1. ROUND TRACKING
      Players log rounds hole by hole. Stats roll up nightly.
      ## 2. STATS & ANALYTICS
      Strokes gained by category, team leaderboards.
      ## 3. QUALIFIERS
      Coaches run qualifying events and rank the field.
    `;
    const verdict = describesFeature('recruiting', 'Recruiting HQ', corpus);

    expect(verdict.checkable).toBe(true);
    expect(verdict.hits).toBe(0);
    expect(verdict.ok).toBe(false);
  });

  it('passes the replacement doc written from the code', () => {
    const doc = `
      # Feature: Recruiting HQ
      Recruiting HQ is the coach-side pipeline for tracking prospects.
      A recruit is a lightweight record owned by a team.
      Coaches move each recruit through the recruiting pipeline.
    `;
    expect(describesFeature('recruiting', 'Recruiting HQ', doc).ok).toBe(true);
  });
});

describe('describesFeature — does not fire on healthy docs', () => {
  it('accepts a doc that uses only the display name, never the id', () => {
    // `roster_team` -> tokens roster, team. A doc may never write the
    // underscored id and still be entirely on topic.
    const doc = 'The roster page lists every team member. Team invites use a join code.';
    expect(describesFeature('roster_team', 'Roster And Team', doc).ok).toBe(true);
  });

  it('drops stopwords so "And" in a feature name cannot satisfy the check alone', () => {
    expect(identityTokens('roster_team', 'Roster And Team')).not.toContain('and');
  });

  it('counts hits across all identity tokens, not just the id', () => {
    const doc = 'stats stats analytics';
    const v = describesFeature('stats_analytics', 'Stats And Analytics', doc);
    expect(v.hits).toBe(3);
    expect(v.ok).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(describesFeature('qualifiers', 'Qualifiers', 'QUALIFIERS Qualifiers qualifiers').ok).toBe(
      true,
    );
  });
});

describe('describesFeature — refuses to pretend it can check the uncheckable', () => {
  it('reports a feature whose tokens are all too short as not checkable', () => {
    // Every token under MIN_TOKEN_LEN would match substrings of unrelated
    // words. Passing silently would be worse than saying so.
    const v = describesFeature('ai', 'AI', 'a document about something else entirely');
    expect(v.checkable).toBe(false);
    expect(v.tokens).toEqual([]);
    // Not a failure — an unenforceable check must not manufacture one.
    expect(v.ok).toBe(true);
  });
});

describe('countOccurrences', () => {
  it('counts non-overlapping occurrences', () => {
    expect(countOccurrences('recruit recruit recruit', 'recruit')).toBe(3);
  });

  it('counts a token inside a longer word — deliberate', () => {
    // "recruiting" contains "recruit". A doc saying "recruiting" IS about
    // recruiting, so substring matching is the behaviour we want here.
    expect(countOccurrences('recruiting recruiters recruited', 'recruit')).toBe(3);
  });

  it('treats a needle with regex metacharacters literally', () => {
    // The implementation uses indexOf, not RegExp — a feature id containing
    // a metacharacter must not become a pattern.
    expect(countOccurrences('a.b a.b axb', 'a.b')).toBe(2);
  });

  it('returns 0 rather than looping forever on an absent needle', () => {
    expect(countOccurrences('nothing here', 'recruit')).toBe(0);
  });
});

describe('stemming — a good doc must not fail on word form', () => {
  // Found by this test suite: matching is substring-of-document, so an
  // unstemmed needle of `recruiting` does not match a doc that says
  // "recruit"/"recruits"/"recruited". A real doc using the singular would have
  // failed. Stemming the needle fixes that without weakening the real check.
  it('reduces the id to a stem', () => {
    expect(identityTokens('recruiting', 'Recruiting HQ')).toContain('recruit');
  });

  it('matches every inflected form of the stem', () => {
    const doc = 'a recruit, two recruits, one recruited player';
    expect(describesFeature('recruiting', 'Recruiting HQ', doc).ok).toBe(true);
  });

  it('never stems below the minimum token length', () => {
    // 'ads' must not become 'ad' (2 chars) and start matching "adds", "read".
    expect(identityTokens('ads', 'Ads')).toEqual(['ads']);
  });

  it('still fails a doc with zero mentions in ANY form', () => {
    const doc = 'rounds, qualifiers, strokes gained, team leaderboards';
    expect(describesFeature('recruiting', 'Recruiting HQ', doc).ok).toBe(false);
  });
});

describe('the threshold is a real threshold', () => {
  it(`fails at ${MIN_HITS - 1} mentions and passes at ${MIN_HITS}`, () => {
    expect(describesFeature('recruiting', 'Recruiting', 'recruit recruit').ok).toBe(false);
    expect(describesFeature('recruiting', 'Recruiting', 'recruit recruit recruit').ok).toBe(true);
  });
});
