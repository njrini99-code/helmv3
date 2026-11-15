import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => true }));

import type { CoachChatContext } from '../../context';
import { toolsFor } from '../../registry';
import { ResolvedBlock } from '../composition';
import { VisualSceneKind } from '../schema';
import { CONTAINER_PARTS, PLANNED_BLOCKS, SHELL_PARTS, STUDIO_KINDS, studioKindOf } from '../studio-kinds';

/**
 * Every schema kind has exactly one component and every component at least one schema kind. The component side holds
 * its registry to the same list (`STUDIO_KINDS`), so a kind added on either side fails a test until the other has it.
 */
const coach: CoachChatContext = { coach_id: 'c1', user_id: 'u1', team_id: 't1', team_name: 'Rini University', timezone: 'America/New_York', roster: [] };
const CHAT = join(process.cwd(), 'src/lib/coachhelm/v3/chat');

/** Every `data-…` part type written anywhere in the chat library outside its tests. */
function emittedParts(dir = CHAT): Set<string> {
  const out = new Set<string>();
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== '__tests__' && name !== 'eval') for (const p of emittedParts(path)) out.add(p);
    } else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) {
      // Written in place (`type: 'data-…'`) or named once as a constant (`X_PART = 'data-…'`, engine/protocol.ts).
      for (const m of readFileSync(path, 'utf8').matchAll(/(?:type: |_PART = )'(data-[a-z-]+)'/g)) out.add(m[1]!);
    }
  }
  return out;
}

describe('the studio: one list for the schema and the components', () => {
  const claimed = STUDIO_KINDS.flatMap((k) => k.schema.map((s) => [s, k.kind] as const));

  it('has about fifteen components, each with something to draw, and no schema kind claimed twice', () => {
    expect(STUDIO_KINDS.length).toBeGreaterThanOrEqual(12);
    expect(STUDIO_KINDS.length).toBeLessThanOrEqual(17);
    expect(new Set(STUDIO_KINDS.map((k) => k.kind)).size).toBe(STUDIO_KINDS.length);
    for (const k of STUDIO_KINDS) expect(k.schema.length, k.kind).toBeGreaterThan(0);
    expect(new Set(claimed.map(([s]) => s)).size).toBe(claimed.length);
    expect(STUDIO_KINDS.map((k) => k.kind)).toContain('table');
  });

  it('is the set the component side agreed (CAPABILITIES, 11 Nov 2026), in registry order', () => {
    expect(STUDIO_KINDS.map((k) => k.kind)).toEqual(['figure', 'comparison', 'ranking', 'trend', 'round', 'strokes_gained', 'distance_profile', 'schedule', 'qualifier_board', 'practice_plan', 'document', 'app_link', 'note', 'on_record', 'action', 'table']);
    // Proposed, saved and undone are one object: the receipt, a hand-off and an edit's notice are all the action card's.
    for (const part of ['data-action-proposal', 'data-action-receipt', 'data-handoff', 'data-card-revision']) expect(studioKindOf(`part:${part}`)).toBe('action');
    expect(studioKindOf('read:get_coachhelm')).toBe('on_record');
    expect(studioKindOf('part:data-computed')).toBe('table');
  });

  it('every block and scene show_visual can resolve to is drawn by one component, and the list names no block that does not exist', () => {
    const blocks = ResolvedBlock.options.map((o) => `block:${(o.shape.type as unknown as { value: string }).value}`);
    const scenes = VisualSceneKind.options.map((s) => `scene:${s}`);
    for (const kind of [...blocks, ...scenes]) expect(studioKindOf(kind), kind).not.toBeNull();
    const planned = PLANNED_BLOCKS.map((b) => `block:${b}`);
    for (const [schema] of claimed.filter(([s]) => s.startsWith('block:') || s.startsWith('scene:'))) expect([...blocks, ...scenes, ...planned], schema).toContain(schema);
  });

  it('every part a tool or the engine emits is drawn by one component or is the shell’s own', () => {
    const parts = emittedParts();
    expect(parts.size).toBeGreaterThan(8);
    for (const part of parts) {
      if (([...SHELL_PARTS, ...CONTAINER_PARTS] as readonly string[]).includes(part)) continue;
      expect(studioKindOf(`part:${part}`), part).not.toBeNull();
    }
    for (const [schema] of claimed.filter(([s]) => s.startsWith('part:'))) expect([...parts].map((p) => `part:${p}`), schema).toContain(schema);
  });

  it('every read a coach or a player can make has a form, and the list names no read that is not registered', () => {
    const reads = new Set([...toolsFor('ask', coach), ...toolsFor('quick_chat', coach), ...toolsFor('player', { ...coach, player_id: 'p1' })].filter((t) => t.kind === 'read').map((t) => t.name));
    // A read that draws through a part of its own (a visual, a draft, a link, a note) is claimed by that part, not by its name.
    const THROUGH_A_PART = new Set(['show_visual', 'write_artifact', 'draft_practice_plan', 'ask_practice_brief', 'draft_message', 'draft_poll', 'draft_board', 'find_in_app', 'save_note', 'remove_note']);
    for (const name of reads) if (!THROUGH_A_PART.has(name)) expect(studioKindOf(`read:${name}`), name).not.toBeNull();
    for (const [schema] of claimed.filter(([s]) => s.startsWith('read:'))) expect([...reads].map((r) => `read:${r}`), schema).toContain(schema);
  });
});
