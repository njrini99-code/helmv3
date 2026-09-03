/**
 * Static regression test for config/launchd/*.plist: the 06:40 2026-09-02
 * Repair failure was a launchd config problem, not a code problem, and
 * nothing caught it because the plist lived only on the owner's Mac, outside
 * git and outside CI. Now that it is tracked at config/launchd/**, this test
 * asserts the exact shape of that failure can never ship again:
 *
 *   - the `claude -p` argument does not start with `-` or `$(` — the "unknown
 *     option '---'" trap, where SKILL.md's raw YAML frontmatter was passed
 *     with no leading sentence
 *   - `--strict-mcp-config` is present — a bare `claude -p` HUNG repeatedly
 *     reaching for an OAuth-gated Supabase MCP tool that doesn't exist here
 *   - `--mcp-config` points at a file that is the empty `{"mcpServers": {}}`
 *     config, not some other (potentially OAuth-gated) config
 *
 * Regex over a known, small, hand-authored plist's ProgramArguments string —
 * not a general plist/XML parser — matching scripts/selfheal-repair-doctor.mjs's
 * own parsing approach.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const LAUNCHD_DIR = join(REPO_ROOT, 'config', 'launchd');

/** Undo XML entity escaping, `&amp;` last so an already-escaped `&lt;` never
 * becomes a literal `<` via a second pass — same order as the doctor script. */
function unescapeXml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function expandHome(p: string): string {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p;
}

function plistFiles(): string[] {
  if (!existsSync(LAUNCHD_DIR)) return [];
  return readdirSync(LAUNCHD_DIR)
    .filter((f) => f.endsWith('.plist'))
    .map((f) => join(LAUNCHD_DIR, f));
}

/** Extract the zsh -lc command string (the last <string> in ProgramArguments)
 * from a plist's raw XML. Returns '' if the shape isn't there — callers
 * assert on that, rather than this function throwing. */
function extractCommand(xml: string): string {
  const programArgsMatch = xml.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/);
  if (!programArgsMatch) return '';
  const inner = programArgsMatch[1] ?? '';
  const strings = [...inner.matchAll(/<string>([\s\S]*?)<\/string>/g)].map((m) => unescapeXml(m[1] ?? ''));
  return strings.length > 0 ? (strings[strings.length - 1] ?? '') : '';
}

describe('config/launchd/*.plist — the frontmatter trap can never regress', () => {
  const files = plistFiles();

  // Never pass vacuously: this test exists specifically to check the tracked
  // Repair plist, so an empty directory is a failure of the test's own setup,
  // not a pass.
  it('at least one plist is tracked under config/launchd/', () => {
    expect(files.length).toBeGreaterThanOrEqual(1);
  });

  for (const file of files) {
    const name = file.split('/').pop() ?? file;

    describe(name, () => {
      const command = extractCommand(readFileSync(file, 'utf8'));

      it('has a ProgramArguments command string to check', () => {
        expect(command.length).toBeGreaterThan(0);
      });

      it("the claude -p argument's first character is a letter (never '-' or '$(')", () => {
        const pMatch = command.match(/-p "([\s\S]*?)" --permission-mode/);
        expect(pMatch, 'expected a `-p "..." --permission-mode` argument in the plist command').not.toBeNull();
        const value = pMatch?.[1] ?? '';
        const firstChar = value.trimStart()[0] ?? '';
        expect(firstChar).toMatch(/[A-Za-z]/);
      });

      it('--strict-mcp-config is present', () => {
        expect(command).toContain('--strict-mcp-config');
      });

      it('--mcp-config argument names the known empty helm-bridge-rca-repair/mcp.json path, not some other config', () => {
        // Hard, self-contained: derived only from the tracked plist text, so
        // it holds on any machine including a CI runner that has never seen
        // ~/.claude/scheduled-tasks/**. A bare `.json$` check would pass for
        // ANY .json path, including one repointed at an OAuth-gated config —
        // exactly the shape of the hang this contract exists to prevent (see
        // this describe block's header comment). Anchoring on the directory
        // AND filename is what actually proves it is the empty config, short
        // of reading file contents (which the skipped test below does, only
        // where the path exists on disk).
        const mcpMatch = command.match(/--mcp-config\s+(\S+)/);
        expect(mcpMatch, 'expected an --mcp-config argument').not.toBeNull();
        expect(mcpMatch?.[1] ?? '').toMatch(/helm-bridge-rca-repair\/mcp\.json$/);
      });

      // Soft, machine-dependent: the referenced mcp.json lives under the
      // owner's ~/.claude/scheduled-tasks/**, outside this repo and outside
      // any CI runner's filesystem — the self-heal loop is local-only by
      // design (see docs/ai-system/selfheal/README.md). Skip rather than fail
      // when it is absent, same pattern as
      // check-helm-bridge-env.test.ts's "CI without secrets" skip; on the
      // owner's own machine (where npm run selfheal:repair:doctor also runs)
      // it DOES execute and catches drift for real.
      const mcpMatch = command.match(/--mcp-config\s+(\S+)/);
      const mcpArg = mcpMatch?.[1] ?? null;
      const mcpPath = mcpArg ? expandHome(mcpArg) : null;
      const mcpConfigAvailable = !!mcpPath && existsSync(mcpPath);

      it.skipIf(!mcpConfigAvailable)(
        '--mcp-config points at the empty {"mcpServers": {}} config (this machine only)',
        () => {
          const parsed = JSON.parse(readFileSync(mcpPath as string, 'utf8'));
          expect(parsed).toEqual({ mcpServers: {} });
        },
      );
    });
  }
});
