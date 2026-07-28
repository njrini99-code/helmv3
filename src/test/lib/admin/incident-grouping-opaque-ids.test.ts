/**
 * One broken CoachHelm conversation, four Bridge incidents.
 *
 * Production, 2026-07-26, all four from the same unresolved tool call in the
 * same thread — each retry echoed the id back in the message:
 *
 *   00:29:43  chat/stream: model error — Tool result is missing for tool call toolu_015fQRtPyJQaFz9CAE9nn2Zi.
 *   00:29:52  …same…
 *   00:31:03  …same…
 *   00:34:45  chat/stream: model error — Tool result is missing for tool call toolu_011UerKxxKQeAAF4suzCFKRH.
 *
 * `normalizeIncidentMessagePrefix` collapsed UUIDs, long hex and long integers,
 * but an Anthropic tool-call id is mixed-case base62 and matched none of them —
 * so a differing id sat inside the hashed 80-character prefix and split one
 * cause into several incidents, each with an occurrence count of 1.
 */

import { describe, it, expect } from 'vitest';
import { buildIncidentSignature, groupIncidents } from '@/lib/admin/incident-grouping';

function sig(message: string): string {
  return buildIncidentSignature({ severity: 'warning', errorCode: null, route: null, message });
}

describe('incident grouping — opaque provider ids', () => {
  it('groups the same failure across different tool-call ids', () => {
    const a = sig('chat/stream: model error — Tool result is missing for tool call toolu_015fQRtPyJQaFz9CAE9nn2Zi.');
    const b = sig('chat/stream: model error — Tool result is missing for tool call toolu_011UerKxxKQeAAF4suzCFKRH.');
    expect(a).toBe(b);
  });

  it('still separates genuinely different failures', () => {
    const toolCall = sig('chat/stream: model error — Tool result is missing for tool call toolu_015fQRtPyJQaFz9CAE9nn2Zi.');
    const credit = sig('chat/stream: model error — Your credit balance is too low to access the Anthropic API.');
    expect(toolCall).not.toBe(credit);
  });

  /**
   * The normaliser must not eat ordinary snake_case identifiers — the engine's
   * stable classification codes travel in messages, and folding
   * `engine_no_team_membership` into `engine_:id` would merge unrelated
   * roster outcomes into one bucket.
   */
  it('leaves snake_case codes and short suffixes intact', () => {
    expect(sig('engine_no_team_membership')).not.toBe(sig('engine_no_recent_rounds'));
    expect(sig('provider_credit_exhausted')).not.toBe(sig('provider_rate_limited'));
    expect(sig('task=round_review failed')).not.toBe(sig('task=weekly_brief failed'));
  });

  it('collapses four one-off incidents into one group with a real count', () => {
    const rows = [
      'toolu_015fQRtPyJQaFz9CAE9nn2Zi',
      'toolu_015fQRtPyJQaFz9CAE9nn2Zi',
      'toolu_015fQRtPyJQaFz9CAE9nn2Zi',
      'toolu_011UerKxxKQeAAF4suzCFKRH',
    ].map((id, i) => ({
      id: String(i),
      severity: 'warning' as const,
      title: 'chat/stream',
      message: `chat/stream: model error — Tool result is missing for tool call ${id}.`,
      route: '/api/coachhelm/v3/chat/stream',
      errorCode: null,
      metadata: null,
      createdAt: `2026-07-26T00:${29 + i}:00Z`,
      resolved: false,
    }));

    const grouped = groupIncidents(rows);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.occurrences).toBe(4);
  });

  it('groups one provider outage across routes, wording, and severity', () => {
    const rows = [
      {
        id: 'chat',
        severity: 'error' as const,
        title: 'chat stream',
        message: 'chat/stream: AI features are unavailable',
        route: '/api/coachhelm/v3/chat/stream',
        errorCode: 'provider_anthropic_credit_exhausted',
        metadata: null,
        createdAt: '2026-07-26T00:29:00Z',
        resolved: false,
      },
      {
        id: 'compose',
        severity: 'warning' as const,
        title: 'round review fallback',
        message: 'compose() fell back to the template',
        route: '/api/golf/rounds/generate-review',
        errorCode: 'provider_anthropic_credit_exhausted',
        metadata: null,
        createdAt: '2026-07-26T00:30:00Z',
        resolved: false,
      },
    ];

    const grouped = groupIncidents(rows);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({ occurrences: 2, severity: 'error' });
  });

  it('does not merge the same fault kind from different providers', () => {
    const anthropic = buildIncidentSignature({
      severity: 'error',
      errorCode: 'provider_anthropic_invalid_credential',
      route: '/api/chat',
      message: 'credential rejected',
    });
    const inngest = buildIncidentSignature({
      severity: 'error',
      errorCode: 'provider_inngest_invalid_credential',
      route: '/api/chat',
      message: 'credential rejected',
    });

    expect(anthropic).not.toBe(inngest);
  });
});
