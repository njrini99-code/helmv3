import { describe, it, expect } from 'vitest';
import {
  getVisibleBaseballNav,
  type BaseballNavContext,
} from '../nav-registry';
import {
  BASEBALL_CAPABILITY_KEYS,
  type BaseballCapabilityMap,
} from '../capabilities';

function allCaps(value: boolean): BaseballCapabilityMap {
  return BASEBALL_CAPABILITY_KEYS.reduce((acc, key) => {
    acc[key] = value;
    return acc;
  }, {} as BaseballCapabilityMap);
}

function coachCtx(programType: BaseballNavContext['programType']): BaseballNavContext {
  return { role: 'coach', capabilities: allCaps(true), programType };
}

describe('showcase org nav gating (#367)', () => {
  it('hides organization, teams, and events for college coaches', () => {
    const ids = getVisibleBaseballNav(coachCtx('college')).map((e) => e.id);
    expect(ids).not.toContain('organization');
    expect(ids).not.toContain('teams');
    expect(ids).not.toContain('events');
  });

  it('shows organization routes for showcase programs', () => {
    const ids = getVisibleBaseballNav(coachCtx('showcase')).map((e) => e.id);
    expect(ids).toContain('organization');
    expect(ids).toContain('teams');
    expect(ids).toContain('events');
  });
});
