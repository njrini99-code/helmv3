import { afterAll, beforeAll } from 'vitest';
import { SOURCED_LEVEL_FIGURES, type LevelFigureSource } from '../benchmark-reads';

/**
 * No division figure in the standards table has a traceable basis today (benchmark-reads.ts, SOURCED_LEVEL_FIGURES), so a test that reads a level
 * figure from a fixture row states it as sourced, for the metrics it uses, and takes it away after.
 */
export function withSourcedLevels(metricIds: readonly string[], basis: LevelFigureSource['basis'] = 'published'): void {
  const added: string[] = [];
  beforeAll(() => {
    for (const id of metricIds) {
      SOURCED_LEVEL_FIGURES[id] = { d1: { basis, source: 'test fixture' }, d2: { basis, source: 'test fixture' }, d3: { basis, source: 'test fixture' }, hs: { basis, source: 'test fixture' } };
      added.push(id);
    }
  });
  afterAll(() => {
    for (const id of added) delete SOURCED_LEVEL_FIGURES[id];
  });
}
