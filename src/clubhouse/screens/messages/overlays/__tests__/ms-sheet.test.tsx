// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const seen = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
vi.mock('../../../../ui/Modal', () => ({
  Modal: (props: Record<string, unknown>) => {
    seen.props = props;
    return null;
  },
}));

import { CH_SHEET_CLOSE_PX, MS_BAND_K, MS_CLOSE_FRACTION, msRubberBand, rubberBand } from '../../../../lib/sheet-drag';
import { MsSheet } from '../MsSheet';

afterEach(cleanup);

describe('MSG-407 the Messages sheet', () => {
  it('is the shared Modal with the Messages drag feel, 400 wide, wearing ch-mss', () => {
    render(<MsSheet open onClose={() => {}} title="Seen by" className="ch-msv-sheet" />);
    expect(seen.props).toMatchObject({ variant: 'messages', width: 400, title: 'Seen by' });
    expect(seen.props!.className).toBe('ch-mss ch-msv-sheet');
  });

  it('a caller can still set the width', () => {
    render(<MsSheet open onClose={() => {}} title="Votes" width={440} />);
    expect(seen.props).toMatchObject({ width: 440 });
    expect(seen.props!.className).toBe('ch-mss');
  });
});

describe('MOT-X-6 the sheet drag numbers', () => {
  it('closes past one third of the sheet, and the default stays 80 px', () => {
    expect(MS_CLOSE_FRACTION).toBeCloseTo(1 / 3);
    expect(CH_SHEET_CLOSE_PX).toBe(80);
  });

  it('pulled up it gives -sqrt(|d|) * 2.2, not the UIKit band', () => {
    expect(MS_BAND_K).toBe(2.2);
    expect(msRubberBand(100)).toBeCloseTo(22);
    expect(msRubberBand(0)).toBe(0);
    expect(msRubberBand(400)).toBeCloseTo(44);
    expect(rubberBand(100)).not.toBeCloseTo(22);
  });
});
