import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChRoundsLibrary } from '../../data/rounds-shape';
import type { LiveSharePorts } from '../../live/share-ports';

const client = vi.hoisted(() => vi.fn());
const seen = vi.hoisted(() => ({ ports: undefined as LiveSharePorts | undefined }));
vi.mock('@/lib/supabase/client', () => ({ createClient: client }));
vi.mock('../../screens/rounds/RoundsLibrary', () => ({
  RoundsLibrary: (p: { sharePorts?: LiveSharePorts }) => {
    seen.ports = p.sharePorts;
    return null;
  },
}));

import { PreviewRounds, previewSharePorts } from '../PreviewRounds';

/**
 * C4 (preview capture 2c): the player's Rounds in the preview logged "Could not connect to the server". The library's
 * default sharing ports read golf_round_live from the browser, and the preview has no session. It hands the library
 * ports that answer from memory instead, as Round setup's preview does; nothing reaches Supabase.
 */
describe('the preview’s Rounds reads no live table', () => {
  it('hands the library its own sharing ports', () => {
    render(<PreviewRounds data={{} as ChRoundsLibrary} />);
    expect(seen.ports).toBeDefined();
    expect(Object.keys(seen.ports!).sort()).toEqual(['loadPrefs', 'loadRoundShare', 'setNext', 'setPrefs', 'setShare']);
  });

  it('those ports answer from memory and never make a Supabase client', async () => {
    const ports = previewSharePorts();
    expect(await ports.loadRoundShare('r1', 'practice')).toBe('coaches');
    expect(await ports.setShare('r1', 'team', false)).toEqual({ success: true, data: { share: 'team', seq: null, clamped: false } });
    expect(await ports.loadRoundShare('r1', 'practice')).toBe('team');
    expect(await ports.loadPrefs()).toEqual({ practiceShare: 'team' });
    expect(await ports.setPrefs('off')).toEqual({ success: true, data: { practiceShare: 'off' } });
    expect(client).not.toHaveBeenCalled();
  });
});
