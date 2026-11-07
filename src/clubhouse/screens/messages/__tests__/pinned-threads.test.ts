import { describe, expect, it } from 'vitest';
import { pinnedThreads } from '../model';

const conv = (id: string, channel = false) => ({ id, channel });
const convs = [conv('dm1'), conv('dm2'), conv('team', true), conv('dm3'), conv('dm4')];

describe('the Pinned card (06 S-MSG)', () => {
  it('holds the team channel first, with nothing pinned', () => {
    expect(pinnedThreads(convs, []).map((c) => c.id)).toEqual(['team']);
  });

  it('adds the viewer’s pins after it, in their order, never the channel twice, three in all', () => {
    expect(pinnedThreads(convs, ['dm2', 'team', 'dm1', 'dm3']).map((c) => c.id)).toEqual(['team', 'dm2', 'dm1']);
  });

  it('skips a pin whose thread is gone, and works with no channel on the list', () => {
    expect(pinnedThreads([conv('dm1')], ['gone', 'dm1']).map((c) => c.id)).toEqual(['dm1']);
  });
});
