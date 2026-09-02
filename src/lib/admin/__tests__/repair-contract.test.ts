/**
 * `docs/ai-system/selfheal/repair-contract.md` is executable instruction, not
 * prose. The Repair stage reads it fresh each run and follows it exactly, so a
 * stale command in a fenced block is a stale command in production.
 *
 * WHAT DRIFTED. The contract told Repair to build its own workspace:
 *
 *     git worktree add --no-track /private/tmp/helmv3-repair-<fp> \
 *       -b fix/rca-<fp> origin/main
 *     ln -sfn <canonical>/node_modules  <worktree>/node_modules
 *     ln -sfn <canonical>/.env.local    <worktree>/.env.local
 *
 * Every line of that now contradicts a repository authority:
 *
 *   - `scripts/new-worktree.sh` is the ONE supported creator. It exists because
 *     three sessions once contended over one HEAD, and it guarantees an external
 *     managed location, `--no-track`, and an ISOLATED dependency install.
 *   - the shared-`node_modules` symlink is the exact practice that creator
 *     removed: two trees with different lockfiles testing against whichever was
 *     installed last manufactures both fake failures and fake passes.
 *   - symlinking `.env.local` puts production credentials INSIDE a task
 *     worktree. `.worktreeinclude` withholds that file on purpose.
 *   - `fix/rca-<fp>` cannot be produced by the supported creator at all, which
 *     is how #1658 ended up on `agent/repair-qualifier-closed-code`.
 *
 * WHY THE ASSERTIONS READ FENCED BLOCKS, NOT THE WHOLE FILE. A document that
 * EXPLAINS why the old symlink was wrong necessarily contains the string
 * `ln -s ... .env.local`. Asserting over the raw markdown would either fail on
 * an honest explanation or pass on a live instruction, depending on wording.
 * Only ```bash blocks are commands, so only they are checked.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONTRACT = resolve(__dirname, '../../../../docs/ai-system/selfheal/repair-contract.md');
const text = readFileSync(CONTRACT, 'utf-8');

/** Every ```bash / ```sh fenced block, joined. These are the ACTIVE commands. */
function fencedCommands(md: string): string {
  const blocks: string[] = [];
  const re = /```(?:bash|sh|shell)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) blocks.push(m[1] ?? '');
  return blocks.join('\n');
}

const commands = fencedCommands(text);

describe('repair-contract — the worktree authority', () => {
  it('has fenced command blocks at all (guards the parser itself)', () => {
    // If the fence syntax ever changes, every "does not contain" assertion
    // below would pass vacuously against an empty string. Pin that first.
    expect(commands.length).toBeGreaterThan(200);
    expect(commands).toContain('gh pr create');
  });

  it('creates workspaces through the one supported creator', () => {
    expect(commands).toContain('scripts/new-worktree.sh');
  });

  it('does NOT tell Repair to hand-build a worktree', () => {
    expect(commands).not.toMatch(/git\s+(-C\s+\S+\s+)?worktree\s+add/);
  });

  it('does NOT symlink the canonical node_modules into a task worktree', () => {
    expect(commands).not.toMatch(/ln\s+-s\S*\s+\S*node_modules/);
  });

  it('does NOT symlink the canonical .env.local into a task worktree', () => {
    expect(commands).not.toMatch(/ln\s+-s\S*\s+\S*\.env\.local/);
  });

  it('still reads production through an explicit --env-file, never a copied secret', () => {
    // The secret is used BY the process without becoming a file in the
    // workspace. This is the pattern that survived #1658 and must not be
    // removed while deleting the symlink.
    expect(commands).toContain('--env-file');
  });
});

describe('repair-contract — incident linkage authority', () => {
  it('requires the /admin/errors/<fingerprint> body link', () => {
    // The durable forward join. `extractRepairIncidentIds` reads it, and it is
    // what let Mission Control connect #1658 to its incident at all.
    expect(text).toMatch(/\/admin\/errors\/<fingerprint>|\/admin\/errors\/<fp>/);
  });

  it('does NOT require a fix/rca-* branch name in any active command', () => {
    // Branch naming is legacy compatibility for historical PRs, parsed by
    // repair-link.ts. It is no longer something new Repair work must produce,
    // because the supported creator cannot produce it.
    expect(commands).not.toContain('fix/rca-');
  });
});
