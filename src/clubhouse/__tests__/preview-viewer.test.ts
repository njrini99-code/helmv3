import { describe, expect, it } from 'vitest';
import { previewViewer } from '../preview/viewer';

describe('the dev preview signs in as the viewer a screen is for', () => {
  it("the player's own stats page is framed by a player, not the coach", () => {
    expect(previewViewer('player', 'self')).toBe('jonah');
  });
  it('a coach looking at a player stays the coach', () => {
    expect(previewViewer('player', undefined)).toBe('coach');
    expect(previewViewer('player', 'early')).toBe('coach');
  });
  it('the existing player screens keep their viewers', () => {
    expect(previewViewer('home-player', undefined)).toBe('theo');
    expect(previewViewer('roster-player', undefined)).toBe('theo');
    expect(previewViewer('rounds', undefined)).toBe('jonah');
    expect(previewViewer('round', undefined)).toBe('jonah');
    expect(previewViewer('round', 'coach')).toBe('coach');
    expect(previewViewer('round', 'coachnoted')).toBe('coach');
    expect(previewViewer('settings', 'player')).toBe('jonah');
    expect(previewViewer('settings', undefined)).toBe('coach');
    expect(previewViewer('stats', undefined)).toBe('coach');
  });
});
