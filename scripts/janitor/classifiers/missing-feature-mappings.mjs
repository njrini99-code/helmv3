import { loadRegistry, mapFilesToFeatures } from '../../knowledge/lib/registry.mjs';
import { lsFiles } from '../lib/repo.mjs';
import { FINDINGS, ZERO_FINDINGS_VERIFIED, NO_SIGNAL } from '../lib/verdicts.mjs';

export const CLASS_ID = 'missing_feature_mappings';
export const TITLE = 'Routes with no memory/registry.yml feature mapping';
const MAX_FINDINGS = 12;

/**
 * Reuses scripts/knowledge/lib/registry.mjs — the SAME parser and glob
 * matcher `npm run knowledge:map` uses — rather than a second reader for
 * memory/registry.yml (see .claude/rules/quality-gates.md's whole point
 * about a check that cannot fail; a second, subtly different YAML/glob
 * reader here would be exactly that risk). A route page with zero matching
 * `code.routes`/`code.*` globs across every feature is the gap AGENTS.md's
 * "Feature awareness" section already asks a human to close by hand.
 */
export async function run({ repoRoot }) {
  let registry;
  try {
    registry = await loadRegistry(repoRoot);
  } catch (err) {
    return {
      classId: CLASS_ID,
      title: TITLE,
      verdict: NO_SIGNAL,
      note: `memory/registry.yml could not be read: ${err.message}`,
      evidenceCommand: 'npm run knowledge:map -- --files <path>',
    };
  }

  const routeFiles = lsFiles(repoRoot, [
    'src/app/**/page.tsx',
    'src/app/**/route.ts',
  ]);

  if (routeFiles.length === 0) {
    return {
      classId: CLASS_ID,
      title: TITLE,
      verdict: NO_SIGNAL,
      note: 'No src/app/**/page.tsx or route.ts files found by git ls-files.',
      evidenceCommand: "git ls-files -- 'src/app/**/page.tsx' 'src/app/**/route.ts'",
    };
  }

  const mapped = mapFilesToFeatures(registry, routeFiles);
  const mappedFileSet = new Set(mapped.flatMap((f) => f.matchedFiles));
  const unmapped = routeFiles.filter((f) => !mappedFileSet.has(f)).sort();

  if (unmapped.length === 0) {
    return {
      classId: CLASS_ID,
      title: TITLE,
      verdict: ZERO_FINDINGS_VERIFIED,
      note: `All ${routeFiles.length} route file(s) (page.tsx + route.ts) matched at least one feature's code globs in memory/registry.yml.`,
      evidenceCommand: "npm run knowledge:map -- --files <path>",
    };
  }

  return {
    classId: CLASS_ID,
    title: TITLE,
    verdict: FINDINGS,
    note:
      `${unmapped.length} of ${routeFiles.length} route file(s) match zero features' code globs.` +
      (unmapped.length > MAX_FINDINGS ? ` Showing top ${MAX_FINDINGS}.` : ''),
    evidenceCommand: "npm run knowledge:map -- --files <path>",
    findings: unmapped.slice(0, MAX_FINDINGS).map((file, i) => ({
      id: `${CLASS_ID}-${i}`,
      summary: `${file} matches no feature in memory/registry.yml`,
      detail: file,
      scope: file,
      confidence: 'medium', // a route CAN legitimately be covered by a broader glob elsewhere the matcher missed
      sizeOfChange: 'small',
      proposedPr: `Add ${file} to the \`code.routes\` (or nearest matching) list of the feature it belongs to in memory/registry.yml, or explicitly mark it as a deliberate feature-awareness gap per AGENTS.md's "Feature awareness" section.`,
    })),
  };
}
