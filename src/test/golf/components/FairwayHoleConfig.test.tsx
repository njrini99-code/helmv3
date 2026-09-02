/**
 * FairwayHoleConfig re-seeds when its baseline changes under it.
 *
 * Field report (Shenandoah, 2026-09-01): on the confirmed-course screen the
 * editor mounts at the course default (18) and the 9/18 + Front/Back controls
 * sit above it. A player who tapped "9 holes · Front 9" saw the Holes tile say
 * 9 while "Start round" still saved 18 — the round then ran 1..18 and could
 * not be finished after nine. The editor had seeded its state once, on mount.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'framer-motion';
import { FairwayHoleConfig } from '@/components/fairway/pages/rounds-new/FairwayHoleConfig';
import type { HoleConfig } from '@/lib/types/golf-course';

// Front nine par 4, back nine par 5, every yardage distinct — so a save can be
// traced back to exactly which nine it came from.
const EIGHTEEN: HoleConfig[] = Array.from({ length: 18 }, (_, i) => ({
  holeNumber: i + 1,
  par: i < 9 ? 4 : 5,
  yardage: 300 + i * 10,
}));
const FRONT: HoleConfig[] = EIGHTEEN.slice(0, 9);
const BACK: HoleConfig[] = EIGHTEEN.slice(9, 18).map((h, i) => ({ ...h, holeNumber: i + 1 }));

interface EditorProps {
  initialHoles: HoleConfig[];
  holesPerRound: 9 | 18;
  onSave: (holes: HoleConfig[]) => void;
}

function renderEditor(props: EditorProps) {
  const ui = (p: EditorProps) => (
    <LazyMotion features={domAnimation}>
      <FairwayHoleConfig courseName="Winchester CC" baselineLabel="Winchester CC" onBack={() => {}} {...p} />
    </LazyMotion>
  );
  const r = render(ui(props));
  return { rerender: (next: EditorProps) => r.rerender(ui(next)) };
}

function startRound() {
  fireEvent.click(screen.getByRole('button', { name: /start round/i }));
}

function savedHoles(onSave: ReturnType<typeof vi.fn>): HoleConfig[] {
  expect(onSave).toHaveBeenCalledTimes(1);
  return onSave.mock.calls[0]![0] as HoleConfig[];
}

describe('FairwayHoleConfig — the baseline changes after mount', () => {
  it('saves NINE holes when the player switches 18 → 9 on a mounted editor', () => {
    const onSave = vi.fn();
    const { rerender } = renderEditor({ initialHoles: EIGHTEEN, holesPerRound: 18, onSave });
    rerender({ initialHoles: FRONT, holesPerRound: 9, onSave });

    startRound();

    const saved = savedHoles(onSave);
    expect(saved).toHaveLength(9);
    expect(saved.map((h) => h.holeNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(saved.map((h) => h.yardage)).toEqual(FRONT.map((h) => h.yardage));
  });

  it('follows a Front 9 → Back 9 switch, renumbered 1..9', () => {
    const onSave = vi.fn();
    const { rerender } = renderEditor({ initialHoles: FRONT, holesPerRound: 9, onSave });
    rerender({ initialHoles: BACK, holesPerRound: 9, onSave });

    startRound();

    const saved = savedHoles(onSave);
    expect(saved.map((h) => h.par)).toEqual(Array<number>(9).fill(5));
    expect(saved.map((h) => h.yardage)).toEqual(BACK.map((h) => h.yardage));
    expect(saved.map((h) => h.holeNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('grows back to 18 when the player switches 9 → 18', () => {
    const onSave = vi.fn();
    const { rerender } = renderEditor({ initialHoles: FRONT, holesPerRound: 9, onSave });
    rerender({ initialHoles: EIGHTEEN, holesPerRound: 18, onSave });

    startRound();

    const saved = savedHoles(onSave);
    expect(saved).toHaveLength(18);
    expect(saved[17]!.yardage).toBe(EIGHTEEN[17]!.yardage);
  });

  it("keeps the player's edits when the parent re-renders with an EQUAL baseline", () => {
    // The parent rebuilds `initialHoles` on every render. An editor that
    // compared by reference would wipe every edit on every keystroke.
    const onSave = vi.fn();
    const { rerender } = renderEditor({ initialHoles: FRONT, holesPerRound: 9, onSave });
    fireEvent.change(screen.getByRole('spinbutton', { name: /hole 1 yardage/i }), {
      target: { value: '333' },
    });
    rerender({ initialHoles: FRONT.map((h) => ({ ...h })), holesPerRound: 9, onSave });

    expect((screen.getByRole('spinbutton', { name: /hole 1 yardage/i }) as HTMLInputElement).value).toBe('333');
    startRound();
    expect(savedHoles(onSave)[0]!.yardage).toBe(333);
  });
});
