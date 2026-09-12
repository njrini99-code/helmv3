/**
 * The registry is only useful if every name in it is real. This keeps the
 * map honest: rename or delete a component and the registry must follow.
 */
import { describe, it, expect } from 'vitest';
import * as root from './index';
import * as modules from './modules';
import * as instrument from './instrument';
import * as charts from './charts';
import * as settings from './settings/settings-list';
import * as appShell from './app-shell';
const fairway: Record<string, unknown> = { ...root, ...modules, ...instrument, ...charts, ...settings, ...appShell };
import { FAIRWAY_REGISTRY, QUESTION_TO_VISUAL, FAIRWAY_REGISTRY_BY_NAME } from './registry';

describe('Fairway registry', () => {
  it('names only real exports of the Fairway barrels', () => {
    const missing = FAIRWAY_REGISTRY.map((e) => e.name).filter((n) => !(n in fairway));
    expect(missing).toEqual([]);
  });
  it('has unique names', () => {
    expect(FAIRWAY_REGISTRY_BY_NAME.size).toBe(FAIRWAY_REGISTRY.length);
  });
  it('maps every question to a registered component', () => {
    const unknown = QUESTION_TO_VISUAL.map(([, c]) => c).filter((c) => !FAIRWAY_REGISTRY_BY_NAME.has(c));
    expect(unknown).toEqual([]);
  });
  it('gives every entry a bestFor and an avoidFor or replaces (judgment, not a label)', () => {
    const thin = FAIRWAY_REGISTRY.filter((e) => e.bestFor.length === 0 || (e.avoidFor.length === 0 && e.replaces.length === 0));
    expect(thin.map((e) => e.name)).toEqual([]);
  });
});
