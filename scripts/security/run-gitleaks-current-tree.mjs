import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const tmpRoot = join(tmpdir(), `helm-gitleaks-current-${process.pid}`);
const reportPath = join(repoRoot, 'docs/operations/generated/gitleaks.json');

mkdirSync(tmpRoot, { recursive: true });
mkdirSync(dirname(reportPath), { recursive: true });

try {
  const files = spawnSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'buffer',
  });
  if (files.status !== 0) {
    process.stderr.write(files.stderr);
    process.exit(files.status ?? 1);
  }

  for (const raw of files.stdout.toString('utf8').split('\0')) {
    if (!raw) continue;
    const source = join(repoRoot, raw);
    if (!existsSync(source)) continue;
    const destination = join(tmpRoot, raw);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  }

  const scan = spawnSync(
    'gitleaks',
    ['dir', tmpRoot, '--redact', '--report-format', 'json', '--report-path', reportPath],
    { cwd: repoRoot, stdio: 'inherit' },
  );
  process.exit(scan.status ?? 1);
} finally {
  rmSync(tmpRoot, { recursive: true, force: true });
}
