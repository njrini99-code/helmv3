import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const repoRoot = process.cwd();
const reportDir = join(repoRoot, '.cleanup/reports');
const reportPath = join(reportDir, 'secret-pattern-scan.redacted.txt');
const MAX_LINES = 5000;

const SECRET_VALUE_PATTERNS = [
  /(["']?(?:api[_-]?key|secret|token|password|bearer)["']?\s*[:=]\s*["']?)([^"'\s]{4,})/gi,
  /(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/gi,
  /(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g,
];

function redactLine(line) {
  let redacted = line;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    redacted = redacted.replace(pattern, (...args) => {
      if (pattern === SECRET_VALUE_PATTERNS[0]) {
        return `${args[1]}[REDACTED]`;
      }
      if (pattern === SECRET_VALUE_PATTERNS[1]) {
        return `${args[1]}[REDACTED]${args[3]}`;
      }
      return '[REDACTED_JWT]';
    });
  }
  return redacted;
}

mkdirSync(reportDir, { recursive: true });

const grepArgs = [
  '-RIn',
  '--exclude-dir=node_modules',
  '--exclude-dir=.next',
  '--exclude-dir=.git',
  '--exclude-dir=.cleanup',
  '--exclude-dir=docs/operations/generated',
  '--exclude-dir=.ultracode',
  '--exclude=.env',
  '--exclude=.env.*',
  '--exclude=*.pem',
  '--exclude=*.key',
  '-e',
  'api[_-]?key',
  '-e',
  'secret',
  '-e',
  'token',
  '-e',
  'password',
  '-e',
  'bearer',
  '.',
];

const grep = spawn('grep', grepArgs, { cwd: repoRoot });
const output = createWriteStream(reportPath, { encoding: 'utf8' });
output.write('# Redacted secret-pattern scan\n');
output.write(`# Generated: ${new Date().toISOString()}\n`);
output.write('# Raw grep output is never written. Values are redacted before save.\n\n');

let lineCount = 0;
let truncated = false;

const rl = createInterface({ input: grep.stdout });
rl.on('line', (line) => {
  if (lineCount >= MAX_LINES) {
    truncated = true;
    return;
  }
  output.write(`${redactLine(line)}\n`);
  lineCount += 1;
});

grep.stderr.on('data', (chunk) => process.stderr.write(chunk));

await new Promise((resolve, reject) => {
  grep.on('error', reject);
  grep.on('close', (code) => {
  if (code !== 0 && code !== 1) {
    reject(new Error(`grep exited with code ${code}`));
    return;
  }
  resolve();
  });
  rl.on('close', () => {
    if (truncated) {
      output.write(`\n# Truncated after ${MAX_LINES} lines. Narrow the scan if you need more.\n`);
    }
    output.end();
  });
});

console.log(`Wrote redacted secret-pattern scan to ${reportPath} (${lineCount} lines).`);
