import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { looseRule, TEAM_QUERY_TABLE_NAMES, TEAM_QUERY_TABLES } from '../team-query-allowlist';

/**
 * The allowlist is the whole privacy boundary of `query_team_data`. This walks it and fails if a table or column that must never be
 * readable by the generic reader ever appears: the owner’s list (2026-11-07) plus a pattern net for names that are not on it yet.
 */

const FORBIDDEN_TABLES = [
  'golf_players',
  'golf_recruits',
  'golf_recruit_documents',
  'golf_messages',
  'golf_message_attachments',
  'golf_message_mentions',
  'golf_message_reactions',
  'golf_message_responses',
  'golf_conversations',
  'golf_conversation_participants',
  'golf_conversation_read_marks',
  'golf_announcements',
  'golf_player_availability_coach_notes',
  'golf_academic_exclusions',
  'golf_player_classes',
  'golf_player_class_settings',
  'golf_class_exceptions',
  'golf_class_hold_dirty',
  'golf_coach_blocked_time',
  'golf_staff_invite_codes',
  'golf_staff_invite_redemptions',
  'golf_ingest_connections',
  'golf_ingest_sync_log',
  'golf_calendar_feeds',
  'golf_calendar_notifications',
  'golf_push_holds',
  'golf_push_hold_heartbeat',
  'golf_player_notification_state',
  'golf_demo_sessions',
  'golf_team_join_requests',
  'golf_coach_behavior_log',
  'golf_platform_metrics_daily',
  'golf_coaches',
  'golf_team_members',
  'golf_coachhelm_chat_messages',
  'golf_coachhelm_chat_conversations',
  'golf_coachhelm_llm_calls',
];
/** A table whose name carries any of these is not a performance, schedule or practice table. */
const FORBIDDEN_TABLE_PATTERN = /recruit|message|conversation|attachment|reaction|mention|announcement|availability|academic|class|invite|ingest|calendar_feed|calendar_notif|push|notification|demo|join_request|behavio|platform|auth|token|secret|credential|coach_blocked|travel_expense|budget|document/i;

/** Contact, academic and personal columns; secrets; and the free-text columns people write (a typed read quotes those, with a warning). */
const FORBIDDEN_COLUMN_PATTERN = /(^|_)(email|phone|gpa|hometown|high_school|address|birth|dob|ssn|password|token|secret|key|hash|salt|credential|notes?|body|content|message|reason|reasoning|comment|description|recap|draft_data|metadata|shots_data|detailed_stats|reflection|evidence|snapshots|progress_notes|verdict|criterion)(_|$)/i;

describe('the query_team_data allowlist', () => {
  it('has tables, all of them performance, schedule or practice', () => {
    expect(TEAM_QUERY_TABLE_NAMES.length).toBeGreaterThan(15);
  });

  it('holds no table the owner ruled out, and none a name pattern flags', () => {
    for (const t of TEAM_QUERY_TABLE_NAMES) {
      expect(FORBIDDEN_TABLES, t).not.toContain(t);
      expect(t, t).not.toMatch(FORBIDDEN_TABLE_PATTERN);
    }
  });

  it('holds no contact, academic, secret or free-text column, listed, forced, ordered by or scoped on', () => {
    for (const t of TEAM_QUERY_TABLE_NAMES) {
      const rule = looseRule(t)!;
      const columns = [...rule.columns, rule.order.column, ...Object.keys(rule.forced ?? {})];
      for (const c of columns) expect(c, `${t}.${c}`).not.toMatch(FORBIDDEN_COLUMN_PATTERN);
    }
  });

  it('gives every table a way to scope it to the team, and no model-supplied scope column', () => {
    for (const t of TEAM_QUERY_TABLE_NAMES) {
      const rule = looseRule(t)!;
      expect(['team', 'player'], t).toContain(rule.scope);
      // The reader adds the scope column itself; the model never selects, filters or orders on the team.
      expect(rule.columns, t).not.toContain('team_id');
      expect(new Set(rule.columns).size, t).toBe(rule.columns.length);
    }
  });

  it('only names tables and columns that exist in database.ts, and the scope column exists on each table', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/types/database.ts'), 'utf8').split('\n');
    const rowOf = (table: string): Set<string> => {
      const start = src.findIndex((l, i) => i > 30 && l === `      ${table}: {`);
      expect(start, `${table} in database.ts`).toBeGreaterThan(0);
      const rowAt = src.findIndex((l, i) => i > start && l === '        Row: {');
      const cols = new Set<string>();
      for (let i = rowAt + 1; src[i] !== '        }'; i += 1) cols.add(src[i]!.trim().split(':')[0]!);
      return cols;
    };
    for (const t of TEAM_QUERY_TABLE_NAMES) {
      const row = rowOf(t);
      const rule = looseRule(t)!;
      expect(row.has(rule.scope === 'team' ? 'team_id' : 'player_id'), `${t} has its scope column`).toBe(true);
      for (const c of [...rule.columns, rule.order.column, ...Object.keys(rule.forced ?? {})]) expect(row.has(c), `${t}.${c}`).toBe(true);
    }
  });

  it('keeps the tournament tables behind golf_tournaments_v1, and nothing else behind a flag', () => {
    const flagged = TEAM_QUERY_TABLE_NAMES.filter((t) => looseRule(t)!.flag).sort();
    expect(flagged).toEqual(['golf_tournament_entries', 'golf_tournament_player_rounds', 'golf_tournament_rounds', 'golf_tournaments']);
    expect(TEAM_QUERY_TABLES.golf_rounds.forced).toEqual({ is_test: false });
  });

  it('standing leaves out the men’s-anchored Tour columns, so a women’s team is never graded on them', () => {
    expect(looseRule('golf_player_standing')!.columns).not.toContain('pga_value');
    expect(looseRule('golf_player_standing')!.columns).not.toContain('pga_delta');
  });
});
