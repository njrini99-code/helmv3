import { describe, expect, it } from 'vitest';

import { extractObjectsFromMigrationSql, parseGeneratedTypes } from '../drift-inputs';

describe('extractObjectsFromMigrationSql', () => {
  it('finds tables, views, functions and schemas, unqualified', () => {
    const sql = `
      create schema if not exists helm_debug;
      create table if not exists helm_debug.db_error_events (id bigint);
      create or replace view public.golf_round_summary as select 1;
      create or replace function public.record_db_error_event(p_a text) returns void as $$ $$;
      create materialized view public.golf_leaderboard as select 1;
    `;
    const objects = extractObjectsFromMigrationSql(sql);
    expect(objects).toEqual(
      expect.arrayContaining(['helm_debug', 'db_error_events', 'golf_round_summary', 'record_db_error_event', 'golf_leaderboard']),
    );
  });

  it('records an added column both bare and as table.column', () => {
    const objects = extractObjectsFromMigrationSql('alter table public.golf_rounds add column if not exists tee_time timestamptz;');
    expect(objects).toEqual(expect.arrayContaining(['golf_rounds', 'tee_time', 'golf_rounds.tee_time']));
  });

  it('returns an empty list for SQL that creates nothing', () => {
    expect(extractObjectsFromMigrationSql('select 1;')).toEqual([]);
  });

  it('is case-insensitive and strips quoting', () => {
    const objects = extractObjectsFromMigrationSql('CREATE TABLE "public"."Golf_Rounds" (id uuid);');
    expect(objects).toContain('golf_rounds');
  });
});

describe('parseGeneratedTypes', () => {
  const SOURCE = [
    'export type Database = {',
    '  public: {',
    '    Tables: {',
    '      golf_rounds: {',
    '        Row: {',
    '          id: string',
    '          tee_time: string | null',
    '        }',
    '        Insert: {',
    '          not_a_row_column: string',
    '        }',
    '      }',
    '    }',
    '    Views: {',
    '      golf_round_summary: {',
    '        Row: {',
    '          total: number',
    '        }',
    '      }',
    '    }',
    '    Functions: {',
    '      save_partial_round_atomic: {',
    '        Args: {',
    '          p_round: string',
    '        }',
    '      }',
    '    }',
    '  }',
    '}',
  ].join('\n');

  it('extracts tables, views, their Row columns, and functions', () => {
    const parsed = parseGeneratedTypes(SOURCE);
    expect(parsed.tables).toEqual(expect.arrayContaining(['golf_rounds', 'golf_round_summary']));
    expect(parsed.functions).toEqual(['save_partial_round_atomic']);
    expect(parsed.columns).toEqual(expect.arrayContaining(['golf_rounds.tee_time', 'tee_time', 'golf_rounds.id']));
  });

  it('does not take Insert/Update keys as columns — only Row', () => {
    const parsed = parseGeneratedTypes(SOURCE);
    expect(parsed.columns).not.toContain('not_a_row_column');
  });

  it('returns empty lists rather than throwing on unrecognised input', () => {
    const parsed = parseGeneratedTypes('not typescript at all');
    expect(parsed.tables).toEqual([]);
    expect(parsed.columns).toEqual([]);
    expect(parsed.functions).toEqual([]);
  });
});
