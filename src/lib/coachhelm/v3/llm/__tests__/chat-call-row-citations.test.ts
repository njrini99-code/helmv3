import { describe, expect, it } from 'vitest';
import { buildChatLlmCallRow } from '../chat-call-row';

// The ledger row keeps the citation counts of every turn, accepted or not, so the share of answers the citations carried (and the fallback's
// share) can be read from golf_coachhelm_llm_calls and not only from a log.
const base = { coachId: 'c', conversationId: '1234567890abcdef1234', modelId: 'm', promptTokens: 1, completionTokens: 1, costUsd: 0 };
const stats = { figures: 9, cited: 7, fallback_passed: 2, cites: 7, verified: 7, unresolved: 0, mismatched: 0, blocks: 1, invalid: 0 };

describe('buildChatLlmCallRow: citation counts', () => {
  it('an accepted turn with counts records them; without, citations stays null', () => {
    expect(buildChatLlmCallRow({ ...base, grounded: true, citationStats: stats }).citations).toEqual({ reason: 'grounded', unmatched_tokens: [], citation_stats: stats });
    expect(buildChatLlmCallRow({ ...base, grounded: true }).citations).toBeNull();
    expect(buildChatLlmCallRow({ ...base, grounded: true }).verified).toBe(true);
  });
  it('a rejected turn records them with the flagged tokens', () => {
    const row = buildChatLlmCallRow({ ...base, grounded: false, unmatchedTokens: ['8'], verdictReason: 'ungrounded_claims', citationStats: stats });
    expect(row.verified).toBe(false);
    expect(row.citations).toMatchObject({ reason: 'verification_failed', unmatched_tokens: ['8'], citation_stats: stats });
  });
});

describe('buildChatLlmCallRow: a turn that ran without part of its configuration', () => {
  it('records the feature groups the turn gave up, accepted or not, and nothing on a turn that gave up none', () => {
    expect(buildChatLlmCallRow({ ...base, grounded: true, featuresDropped: ['strict_tools'] }).citations).toEqual({ reason: 'grounded', unmatched_tokens: [], features_dropped: ['strict_tools'] });
    expect(buildChatLlmCallRow({ ...base, grounded: true, citationStats: stats, featuresDropped: ['progress_notes', 'strict_tools'] }).citations).toEqual({ reason: 'grounded', unmatched_tokens: [], citation_stats: stats, features_dropped: ['progress_notes', 'strict_tools'] });
    expect(buildChatLlmCallRow({ ...base, grounded: false, unmatchedTokens: ['8'], featuresDropped: ['compaction'] }).citations).toEqual({ reason: 'verification_failed', unmatched_tokens: ['8'], features_dropped: ['compaction'] });
    expect(buildChatLlmCallRow({ ...base, grounded: true, featuresDropped: [] }).citations).toBeNull();
    // Whether the answer was grounded is still the only thing `verified` says.
    expect(buildChatLlmCallRow({ ...base, grounded: true, featuresDropped: ['strict_tools'] }).verified).toBe(true);
  });
  it('a player’s own turn carries the player and no coach', () => {
    expect(buildChatLlmCallRow({ ...base, coachId: null, playerId: 'p', grounded: true })).toMatchObject({ task: 'coach_chat', coach_id: null, player_id: 'p', prompt_hash: '1234567890abcdef' });
    expect(buildChatLlmCallRow({ ...base, grounded: true }).player_id).toBeNull();
  });
});
