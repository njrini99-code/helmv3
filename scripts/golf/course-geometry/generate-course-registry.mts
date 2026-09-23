/**
 * Generates `course-geometry/registry.generated.json` by joining the owner's
 * `course-geometry/approvals.json` with the checked-in catalog
 * (`course-geometry/catalog/`) and each approved package's own hole keys.
 *
 * Only a layout listed in `approvals.json` becomes a registry policy — an
 * un-approved catalogued layout stays catalogued only, drawn by nothing
 * (Factory v2 §3, §28). `course-registry.ts` hydrates this file with the
 * same zod schema this script writes it with
 * (`src/lib/golf/course-geometry/registry-wire.ts`), so a hand-edited file
 * cannot bypass validation, and `catalogProblems` / `checkRegistryInvariants`
 * still run against the hydrated result in tests.
 *
 * `--check`: non-mutating. Computes the expected file content and compares
 * byte-for-byte against what's on disk; exits 1 on drift or missing file.
 * Same pattern as `npm run flags:check`.
 *
 *   node_modules/.bin/tsx --tsconfig tsconfig.json scripts/golf/course-geometry/generate-course-registry.mts [--check]
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGeometryPackage } from '@/lib/golf/course-geometry/schema';
import { loadCourseCatalog } from '@/lib/golf/course-geometry/load-catalog';
import { checkRegistryInvariants } from '@/lib/golf/course-geometry/registry-invariants';
import { hydratePolicy, wireRegistrySchema, type WireCourseGeometryPolicy } from '@/lib/golf/course-geometry/registry-wire';
import { catalogProblems } from '@/lib/golf/course-geometry/catalog';

const ROOT = process.cwd();
const APPROVALS_PATH = join(ROOT, 'course-geometry', 'approvals.json');
const OUT_PATH = join(ROOT, 'course-geometry', 'registry.generated.json');
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

interface ApprovalPackage { packageBytesSha256: string; livePilot?: boolean }
interface ApprovalLayout {
  geometryFeatureFlag: string;
  syncFeatureFlag: string | null;
  renderWorld: 'v1' | 'v2';
  pilotAcceptsSourceCandidate: boolean;
  courseNamePatterns: { source: string; flags?: string }[];
  assetBaseUrl?: string;
  packages: Record<string, ApprovalPackage>;
}
interface Approvals { layouts: Record<string, ApprovalLayout> }

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function main() {
  const checkMode = process.argv.includes('--check');
  if (!existsSync(APPROVALS_PATH)) fail(`generate-course-registry: missing ${APPROVALS_PATH}`);
  const approvals = JSON.parse(readFileSync(APPROVALS_PATH, 'utf8')) as Approvals;
  const catalog = loadCourseCatalog(join(ROOT, 'course-geometry', 'catalog'));
  const layoutsById = new Map(catalog.layouts.map(l => [l.layoutId, l]));

  const wire: WireCourseGeometryPolicy[] = [];
  const errors: string[] = [];

  for (const [layoutId, approval] of Object.entries(approvals.layouts)) {
    const layout = layoutsById.get(layoutId);
    if (!layout) { errors.push(`${layoutId}: approved but not catalogued (course-geometry/catalog/layouts/${layoutId}.json is missing)`); continue; }
    if (layout.capabilityTier === 'C0' || layout.capabilityTier === 'C1') { errors.push(`${layoutId}: catalog tier ${layout.capabilityTier} is below the C2 floor a drawn layout needs`); continue; }
    if (!layout.geometry) { errors.push(`${layoutId}: catalog names no geometry package`); continue; }

    let packageBytes: Buffer;
    try { packageBytes = readFileSync(join(ROOT, layout.geometry.package)); }
    catch { errors.push(`${layoutId}: cannot read catalog package ${layout.geometry.package}`); continue; }
    let pkg: ReturnType<typeof parseGeometryPackage>;
    try { pkg = parseGeometryPackage(JSON.parse(packageBytes.toString('utf8'))); }
    catch (error) { errors.push(`${layoutId}: catalog package does not parse: ${error instanceof Error ? error.message : String(error)}`); continue; }

    const approvedHash = approval.packages[pkg.contentHash];
    if (!approvedHash) { errors.push(`${layoutId}: catalog package hash ${pkg.contentHash} has no matching entry in approvals.json packages`); continue; }
    const actualByteHash = sha256(packageBytes);
    if (actualByteHash !== approvedHash.packageBytesSha256) {
      errors.push(`${layoutId}: package bytes hash to ${actualByteHash}, approvals.json says ${approvedHash.packageBytesSha256}`);
      continue;
    }

    const approvedGeometryHashes = Object.keys(approval.packages);
    const approvedPackageByteHashes = Object.fromEntries(Object.entries(approval.packages).map(([h, p]) => [h, p.packageBytesSha256]));
    const holeBindings = { [pkg.contentHash]: Object.fromEntries([...pkg.holes].sort((a, b) => a.ordinal - b.ordinal).map((h, i) => [String(i + 1), h.key])) };
    const livePilotHashes = Object.entries(approval.packages).filter(([, p]) => p.livePilot).map(([h]) => h);

    wire.push({
      layoutId,
      facilityId: layout.facilityId,
      siteIds: layout.siteIds,
      geometryFeatureFlag: approval.geometryFeatureFlag,
      syncFeatureFlag: approval.syncFeatureFlag,
      approvedGeometryHashes,
      approvedPackageByteHashes,
      acceptedCapabilityTier: layout.capabilityTier,
      pilotAcceptsSourceCandidate: approval.pilotAcceptsSourceCandidate,
      dbCourseIds: layout.externalBindings.golfCourseIds,
      courseNamePatterns: approval.courseNamePatterns,
      renderWorld: approval.renderWorld,
      holeBindings,
      livePilot: livePilotHashes.length ? { layoutId, geometryHashes: livePilotHashes } : undefined,
      assetBaseUrl: approval.assetBaseUrl,
    });
  }
  if (errors.length) fail(`generate-course-registry: ${errors.length} problem(s):\n${errors.map(e => `  - ${e}`).join('\n')}`);

  // Stable order regardless of Object.entries iteration or another worker's
  // concurrent catalog edits: alphabetical by layoutId.
  wire.sort((a, b) => a.layoutId.localeCompare(b.layoutId));
  const parsed = wireRegistrySchema.parse(wire);
  const hydrated = parsed.map(hydratePolicy);

  const invariantProblems = [
    ...checkRegistryInvariants(hydrated, catalog.layouts),
    ...catalogProblems(catalog, hydrated),
  ];
  if (invariantProblems.length) fail(`generate-course-registry: ${invariantProblems.length} invariant violation(s):\n${invariantProblems.map(p => `  - ${p}`).join('\n')}`);

  const rendered = JSON.stringify(parsed, null, 2) + '\n';

  if (checkMode) {
    if (!existsSync(OUT_PATH)) fail(`generate-course-registry --check: ${OUT_PATH} does not exist. Run \`npm run course-geometry:registry:generate\`.`);
    const onDisk = readFileSync(OUT_PATH, 'utf8');
    if (onDisk !== rendered) fail('generate-course-registry --check: registry.generated.json is stale relative to approvals.json / the catalog. Run `npm run course-geometry:registry:generate` and commit the result.');
    console.log(`generate-course-registry --check: registry.generated.json is current (${parsed.length} layout(s)).`);
    return;
  }
  writeFileSync(OUT_PATH, rendered, 'utf8');
  console.log(`Wrote ${OUT_PATH} (${parsed.length} layout(s)).`);
}

main();
