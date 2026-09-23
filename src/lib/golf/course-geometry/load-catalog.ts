import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFacilityManifest, parseLayoutManifest, parseScorecardProfile, type CourseCatalog } from './catalog';

/** Reads every checked-in catalog manifest under `course-geometry/catalog/`
 * (Factory v2 §3, §28). Shared by the catalog test and the registry
 * generator so both see the same on-disk catalog through the same parsers —
 * a file is named after the id it declares, so listing a directory doubles
 * as its index. */
export function loadCourseCatalog(root: string = join(process.cwd(), 'course-geometry/catalog')): CourseCatalog {
  const readDir = <T>(dir: string, parse: (input: unknown) => T): T[] =>
    readdirSync(join(root, dir)).filter(f => f.endsWith('.json')).sort()
      .map(f => parse(JSON.parse(readFileSync(join(root, dir, f), 'utf8'))));
  return {
    facilities: readDir('facilities', parseFacilityManifest),
    layouts: readDir('layouts', parseLayoutManifest),
    scorecards: readDir('scorecards', parseScorecardProfile),
  };
}
