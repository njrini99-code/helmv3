import { describe, expect, it } from 'vitest';
import { previewViewer } from '../viewer';

/**
 * G1 (preview grade, 12 Nov 2026): the player's Practice tab, the player's Ask, and the player file drawn for its player
 * were framed by the coach's shell ("Maya Reyes · Head coach", Recruiting in the sidebar). The preview signed in as the
 * coach because it read only `state`, and these screens draw the player's view from their query. The real dashboard
 * frames by the signed-in user's own role (routes, not this file), so this was the fixture's.
 */
describe('the preview frames a player’s own view with the player', () => {
  it('Practice home in its player states', () => {
    expect(previewViewer('coachhelm-practice-home', 'player')).toBe('jonah');
    expect(previewViewer('coachhelm-practice-home', 'player-empty')).toBe('jonah');
    expect(previewViewer('coachhelm-practice-home', 'player-loading')).toBe('jonah');
    // The coach's own states stay the coach's.
    for (const s of [undefined, 'empty', 'empty-new', 'firstrun', 'new']) expect(previewViewer('coachhelm-practice-home', s), String(s)).toBe('coach');
  });

  it('the plan page in the player’s words', () => {
    expect(previewViewer('coachhelm-practice-plan', undefined, { copy: 'player' })).toBe('jonah');
    expect(previewViewer('coachhelm-practice-plan', undefined, { copy: 'coach' })).toBe('coach');
    expect(previewViewer('coachhelm-practice-plan', undefined)).toBe('coach');
  });

  it('the player file, Read and Ask v2 drawn for the player', () => {
    for (const screen of ['coachhelm-player-file', 'coachhelm-read', 'coachhelm-ask-v2']) {
      expect(previewViewer(screen, 'early', { viewer: 'player' }), screen).toBe('jonah');
      expect(previewViewer(screen, 'early', { viewer: 'coach' }), screen).toBe('coach');
      expect(previewViewer(screen, undefined), screen).toBe('coach');
    }
  });

  it('a viewer param on any other screen changes nothing', () => {
    expect(previewViewer('roster', undefined, { viewer: 'player' })).toBe('coach');
    expect(previewViewer('home-player', undefined, { viewer: 'coach' })).toBe('theo');
  });
});
