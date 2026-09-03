import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * StaleDeploymentRecoveryScript's inline deployment-staleness poll used to
 * compare /api/health's `deploymentId` field against a `x-deployment-id`
 * meta tag. /api/health stopped returning `deploymentId` (an unauthenticated
 * endpoint should not hand back a Vercel-internal identifier — see its own
 * header comment) and now returns `release` (the git SHA) instead.
 *
 * Left unfixed, EVERY poll after that change would have read `data.release`
 * as `undefined`, which is always `!== BOOT_RELEASE` for a real deployment —
 * showing the "new version available" banner to every user, every 5 minutes,
 * regardless of whether a deploy actually happened. This is a source-content
 * regression guard rather than a full script-execution test: the script is
 * a raw string injected via next/script, not a normal component, so pinning
 * the field name it compares against is the practical guard here.
 */
describe('StaleDeploymentRecoveryScript — compares against release, not the old deploymentId field', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/components/providers/StaleDeploymentRecoveryScript.tsx'),
    'utf8',
  );

  it('reads data.release from the /api/health response', () => {
    expect(source).toMatch(/data\.release\s*&&\s*data\.release\s*!==\s*BOOT_RELEASE/);
  });

  it('no longer reads the removed data.deploymentId field', () => {
    expect(source).not.toMatch(/data\.deploymentId/);
  });
});

describe('layout.tsx — the x-deployment-id meta tag carries a release, not the raw Vercel deployment id', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8');

  it('uses the same release-resolution formula as /api/health', () => {
    expect(source).toMatch(
      /process\.env\.NEXT_PUBLIC_SENTRY_RELEASE\s*\?\?\s*process\.env\.VERCEL_GIT_COMMIT_SHA\s*\?\?\s*'dev'/,
    );
  });

  it('no longer bakes the raw VERCEL_DEPLOYMENT_ID into the meta tag', () => {
    expect(source).not.toMatch(/content=\{process\.env\.VERCEL_DEPLOYMENT_ID/);
  });
});
