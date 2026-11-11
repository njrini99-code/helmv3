// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedBlock } from '@/lib/coachhelm/v3/chat/visuals/composition';
import { PLANNED_BLOCKS, STUDIO_KINDS, studioKindOf } from '@/lib/coachhelm/v3/chat/visuals/studio-kinds';
import { STUDIO_COMPOSED, STUDIO_SPECIMENS } from '../../../../../preview/fixtures-chat-studio';
import { STUDIO_COMPONENTS, Studio, askRef, fromBlock, isStudioKind, sampleSaid, tableOf, type StudioAsk } from '..';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));

afterEach(cleanup);

const SIZES = ['full', 'compact'] as const;

describe('the studio registry', () => {
  it('has exactly the kinds of the shared list, one component each', () => {
    expect(Object.keys(STUDIO_COMPONENTS).sort()).toEqual(STUDIO_KINDS.map((k) => k.kind).sort());
    for (const k of STUDIO_KINDS) expect(typeof STUDIO_COMPONENTS[k.kind]).toBe('function');
  });

  it('sends every composition block to the kind the shared list claims it for', () => {
    const blocks = STUDIO_KINDS.flatMap((k) => k.schema.filter((s) => s.startsWith('block:')).map((s) => s.slice('block:'.length)));
    const drawn = blocks.filter((b) => !(PLANNED_BLOCKS as readonly string[]).includes(b));
    const sample: Record<string, ResolvedBlock> = {
      note: { type: 'note', kind: 'measured', text: 'A sentence.' },
      hole_strip: { type: 'hole_strip', holes: [{ hole_number: 1, to_par: 0 }] },
      putt_profile: { type: 'putt_profile', buckets: [] },
      miss_pattern: { type: 'miss_pattern', total: 0, no_direction: 0, inside_15: 0, inside_25: 0, wedges: [] },
      season_compare: { type: 'season_compare', metric: 'Scoring average', this_season: null, last_season: null, method: '' },
    };
    const seen = new Map<string, string>();
    for (const c of STUDIO_COMPOSED) seen.set(c.type, c.part.kind);
    for (const [type, block] of Object.entries(sample)) seen.set(type, fromBlock(block).kind);
    for (const [type, kind] of seen) expect(`${type} -> ${kind}`).toBe(`${type} -> ${studioKindOf(`block:${type}`)}`);
    // Every block the shared list names is drawn by a case the fixtures or the samples above exercise.
    const unchecked = drawn.filter((type) => !seen.has(type));
    expect(unchecked.filter((type) => !['headline', 'kpis', 'trend', 'bands', 'ranking', 'split', 'compare'].includes(type))).toEqual([]);
  });
});

describe('every kind, in both sizes', () => {
  it('has a specimen for every kind', () => {
    expect([...new Set(STUDIO_SPECIMENS.map((s) => s.kind))].sort()).toEqual(STUDIO_KINDS.map((k) => k.kind).sort());
  });

  for (const s of STUDIO_SPECIMENS) {
    for (const size of SIZES) {
      it(`${s.id} draws at ${size}`, () => {
        const { container } = render(<Studio part={s.part} size={size} read={s.read} onAsk={() => undefined} />);
        const root = container.querySelector('[data-studio]')!;
        expect(root.getAttribute('data-studio')).toBe(s.kind);
        expect(root.textContent!.trim().length).toBeGreaterThan(0);
      });
    }
  }

  it('draws the fixtures in the form they are named for, not the table they would fall back to', () => {
    for (const s of STUDIO_SPECIMENS.filter((x) => x.id !== 'unknown')) expect(`${s.id}: ${s.part.kind}`).toBe(`${s.id}: ${s.kind}`);
  });
});

describe('the fallback', () => {
  it('draws an unknown kind as a table of its rows, never as nothing', () => {
    const { container } = render(<Studio part={{ kind: 'heat_map', data: { cells: [{ zone: 'Front left', shots: 14 }] } }} size="full" />);
    expect(container.querySelector('[data-studio-fallback="heat_map"]')).not.toBeNull();
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.textContent).toContain('Front left');
    expect(isStudioKind('heat_map')).toBe(false);
  });

  it('draws a part its own component cannot draw as a table', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { container } = render(<Studio part={{ kind: 'ranking', data: { label: 'Broken', rows: null } }} size="compact" />);
    expect(container.querySelector('table')).not.toBeNull();
    quiet.mockRestore();
  });

  it('makes a table of anything', () => {
    expect(tableOf(null).rows.length).toBe(1);
    expect(tableOf({ rounds_played: 4, course: 'Ridgeline' }).rows).toEqual([['Rounds played', '4'], ['Course', 'Ridgeline']]);
    expect(tableOf({ table: { caption: 'Its own', columns: ['A'], rows: [['1']] } }).caption).toBe('Its own');
  });
});

describe('asking about an element', () => {
  it('hands back the read and the element, and sends nothing', () => {
    const asks: StudioAsk[] = [];
    const board = STUDIO_SPECIMENS.find((s) => s.id === 'qualifier_board')!;
    const { container } = render(<Studio part={board.part} size="full" read="r9" onAsk={(a) => asks.push(a)} />);
    const key = container.querySelector<HTMLButtonElement>('button[data-ask-ref]')!;
    fireEvent.click(key);
    expect(asks).toHaveLength(1);
    expect(asks[0]).toMatchObject({ kind: 'qualifier_board', read: 'r9' });
    expect(key.getAttribute('data-ask-ref')).toBe(askRef(asks[0]!));
    expect(asks[0]!.words.startsWith('Ask about this: ')).toBe(true);
  });

  it('names a hole of a round by its number', () => {
    const asks: StudioAsk[] = [];
    const round = STUDIO_SPECIMENS.find((s) => s.id === 'round')!;
    const { getAllByText } = render(<Studio part={round.part} size="full" read="r5" onAsk={(a) => asks.push(a)} />);
    fireEvent.click(getAllByText('2 over')[0]!.closest('button')!);
    expect(asks[0]).toMatchObject({ kind: 'round', key: 'hole:7', words: 'Ask about this: hole 7, 2 over' });
  });

  it('looks tappable only where it is: with no way to ask, no element is a key', () => {
    for (const s of STUDIO_SPECIMENS.filter((x) => ['figure', 'ranking', 'comparison', 'round', 'strokes_gained', 'schedule', 'qualifier_board', 'on_record'].includes(x.id))) {
      const { container, unmount } = render(<Studio part={s.part} size="full" read={s.read} />);
      expect(`${s.id}: ${container.querySelectorAll('[data-ask-ref]').length}`).toBe(`${s.id}: 0`);
      unmount();
    }
  });

  it('keeps the way into the app a separate, named target', () => {
    const sched = STUDIO_SPECIMENS.find((s) => s.id === 'schedule')!;
    const { container } = render(<Studio part={sched.part} size="compact" read="r8" onAsk={() => undefined} />);
    const open = container.querySelector<HTMLAnchorElement>('a.ch-aks-open')!;
    expect(open.getAttribute('aria-label')).toBe('Open Short game practice on the Calendar');
    expect(open.closest('button')).toBeNull();
  });
});

describe('the copy', () => {
  it('says a sample in words', () => {
    expect(sampleSaid({ sample_size: 4, sample_unit: 'rounds' })).toBe('over 4 rounds');
    expect(sampleSaid({ sample_size: 1, sample_unit: 'attempts' })).toBe('from 1 attempt');
    expect(sampleSaid({ sample_size: 0, sample_unit: 'rounds' })).toBeNull();
  });

  // Owner (design-refresh/DESIGN_LANGUAGE.md): no "n=", no "N-4", no count standing alone in brackets.
  const FORBIDDEN = [/\bn\s*=\s*\d/i, /\bN-\d/, /\(\s*\d+\s*\)/, /\[\s*\d+\s*\]/];
  for (const s of STUDIO_SPECIMENS) {
    it(`${s.id} never prints a sample as a letter or a bare bracketed count`, () => {
      for (const size of SIZES) {
        const { container, unmount } = render(<Studio part={s.part} size={size} read={s.read} onAsk={() => undefined} />);
        const said = [container.textContent ?? '', ...[...container.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label') ?? '')].join('\n');
        for (const re of FORBIDDEN) expect(`${s.id} ${size}: ${said.match(re)?.[0] ?? 'clean'}`).toBe(`${s.id} ${size}: clean`);
        unmount();
      }
    });
  }
});
