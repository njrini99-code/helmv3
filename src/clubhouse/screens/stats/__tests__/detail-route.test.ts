import { describe, expect, it } from 'vitest';
import { arrivalDetail, desktopTabOfHash, detailFromHash, hashOf, PLAYER_DETAIL_IDS, summaryUrl, tabOfDetail, TEAM_DETAIL_IDS } from '../detail-route';

describe('detail-route', () => {
  it('round-trips all 11 ids on their own screen', () => {
    expect(PLAYER_DETAIL_IDS.length + TEAM_DETAIL_IDS.length).toBe(11);
    for (const id of PLAYER_DETAIL_IDS) expect(detailFromHash(`#${hashOf(id)}`, 'player')).toBe(id);
    for (const id of TEAM_DETAIL_IDS) expect(detailFromHash(`#${hashOf(id)}`, 'team')).toBe(id);
  });

  it('keeps the existing #gm- hashes', () => {
    expect(hashOf('scoring')).toBe('gm-scoring');
    expect(hashOf('tee')).toBe('gm-tee');
    expect(hashOf('approach')).toBe('gm-approach');
    expect(hashOf('short')).toBe('gm-short');
    expect(hashOf('putting')).toBe('gm-putting');
  });

  it('a hash from the other screen, or an unknown one, names nothing (CP-134)', () => {
    expect(detailFromHash('#sd-team-game', 'player')).toBeNull();
    expect(detailFromHash('#sd-sg', 'team')).toBeNull();
    expect(detailFromHash('#gm-tee', 'team')).toBeNull();
    expect(detailFromHash('#sd-nope', 'player')).toBeNull();
    expect(detailFromHash('', 'player')).toBeNull();
  });

  it.each([
    [{ tab: 'rounds' }, 'rounds'],
    [{ tab: 'dev' }, 'goals'],
    [{ tab: 'game' }, 'sg'],
    [{ tab: 'game', hash: '#gm-putting' }, 'putting'],
    [{ tab: 'overview' }, null],
    [{}, null],
    [{ hash: '#sd-goals' }, 'goals'],
    [{ tab: 'rounds', hash: '#gm-tee' }, 'tee'],
    [{ hash: '#sd-nope' }, null],
  ] as const)('arrivalDetail %j gives %s', (input, want) => {
    expect(arrivalDetail(input, 'player')).toBe(want);
  });

  it('the team screen takes only its own hashes', () => {
    expect(arrivalDetail({ tab: 'rounds' }, 'team')).toBeNull();
    expect(arrivalDetail({ hash: '#sd-team-players' }, 'team')).toBe('tplayers');
  });

  it('summaryUrl drops tab and the hash and keeps player, window and the filter', () => {
    expect(summaryUrl({ pathname: '/golf/dashboard/stats', search: '?player=p1&window=season&tab=rounds&type=tournament' })).toBe('/golf/dashboard/stats?player=p1&window=season&type=tournament');
    expect(summaryUrl({ pathname: '/golf/dashboard/stats', search: '?tab=dev' })).toBe('/golf/dashboard/stats');
    expect(summaryUrl({ pathname: '/golf/dashboard/stats', search: '' })).toBe('/golf/dashboard/stats');
  });

  it('tabOfDetail places each detail under its summary section', () => {
    expect(tabOfDetail('rounds')).toBe('rounds');
    expect(tabOfDetail('goals')).toBe('dev');
    expect(tabOfDetail('scoring')).toBe('overview');
    expect(tabOfDetail('sg')).toBe('game');
    expect(tabOfDetail('putting')).toBe('game');
  });

  it('maps #sd-* for desktop (criterion 77)', () => {
    expect(desktopTabOfHash('#sd-rounds')).toBe('rounds');
    expect(desktopTabOfHash('#sd-goals')).toBe('dev');
    expect(desktopTabOfHash('#sd-sg')).toBe('overview');
    expect(desktopTabOfHash('#gm-tee')).toBeNull();
    expect(desktopTabOfHash('')).toBeNull();
  });
});
