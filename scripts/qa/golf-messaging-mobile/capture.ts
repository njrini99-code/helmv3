import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { fixtureIds } from './fixtures';

const harnessRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(harnessRoot, '../../..');
const outputRoot = path.join(repositoryRoot, 'docs/qa/golf-messaging-mobile-2026-09-04');
const port = 4176;
const widths = [320, 390, 430] as const;
const height = 844;

function waitForServer(url: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise<void>((resolve, reject) => {
    const poll = async () => {
      try {
        const response = await fetch(url);
        if (response.ok) return resolve();
      } catch {
        // The dev server has not bound its port yet.
      }
      if (Date.now() >= deadline) return reject(new Error(`Vite did not become ready at ${url}`));
      setTimeout(poll, 100);
    };
    void poll();
  });
}

async function preparePrivateGroup(page: import('@playwright/test').Page) {
  await page.getByText('Group', { exact: true }).click();
  await page.getByRole('button', { name: /Alexis Bennett/ }).click();
  await page.getByRole('button', { name: /Jordan Rivera/ }).click();
  await page.getByLabel('Group name').fill('Tournament travel planning');
  await page.getByRole('button', { name: 'Create group' }).waitFor();
}

async function main() {
  await mkdir(outputRoot, { recursive: true });
  const vite = spawn(
    path.join(repositoryRoot, 'node_modules/.bin/vite'),
    ['--force', '--config', path.join(harnessRoot, 'vite.config.ts'), '--host', '127.0.0.1', '--port', String(port)],
    { cwd: repositoryRoot, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let viteOutput = '';
  vite.stdout.on('data', (data) => { viteOutput += data.toString(); });
  vite.stderr.on('data', (data) => { viteOutput += data.toString(); });

  try {
    await waitForServer(`http://127.0.0.1:${port}/`);
    const browser = await chromium.launch({ headless: true });
    const results: Array<{ fixture: string; width: number; scrollWidth: number; clientWidth: number; png: string }> = [];

    try {
      for (const fixture of fixtureIds) {
        for (const width of widths) {
          const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
          const page = await context.newPage();
          const browserErrors: string[] = [];
          page.on('pageerror', (error) => browserErrors.push(error.message));
          page.on('console', (message) => {
            if (message.type() === 'error') browserErrors.push(message.text());
          });
          await page.emulateMedia({ reducedMotion: 'reduce' });
          await page.goto(`http://127.0.0.1:${port}/?fixture=${fixture}`, { waitUntil: 'networkidle' });
          await page.locator(`main[data-fixture="${fixture}"]`).waitFor();
          if (fixture === 'thread-group-details') {
            await page.getByRole('button', { name: /Conversation details for/ }).first().click();
          }
          if (fixture === 'new-private-group') await preparePrivateGroup(page);
          if (browserErrors.length) throw new Error(`${fixture} ${width}px browser errors: ${browserErrors.join(' | ')}`);

          const dimensions = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }));
          if (dimensions.scrollWidth > dimensions.clientWidth) {
            throw new Error(`${fixture} ${width}px overflowed: ${dimensions.scrollWidth} > ${dimensions.clientWidth}`);
          }

          const png = `${fixture}-${width}.png`;
          await page.screenshot({ path: path.join(outputRoot, png), fullPage: true });
          results.push({ fixture, width, ...dimensions, png });
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }

    await writeFile(
      path.join(outputRoot, 'manifest.json'),
      `${JSON.stringify({
        command: 'npx tsx scripts/qa/golf-messaging-mobile/capture.ts',
        renderer: 'Vite browser page importing the product messaging components and product Tailwind/token CSS',
        viewportHeight: height,
        overflowAssertion: 'document.documentElement.scrollWidth <= document.documentElement.clientWidth',
        observedLimitations: [
          'Chromium component evidence does not prove physical iPhone Safari/WebView keyboard, safe-area, touch, or native-sheet behavior.',
        ],
        failedSendVisualCheck: 'After the flat mobile reset, visual inspection confirmed reply, body, and retry metadata remain inside the viewport at 320px, 390px, and 430px. Document overflow remained zero at every width.',
        results,
      }, null, 2)}\n`,
    );
    console.log(`Captured ${results.length} mobile component renders with no document overflow.`);
  } catch (error) {
    // `viteOutput` exists to make a startup failure diagnosable, and until now
    // nothing ever read it — the harness collected every line Vite wrote and
    // threw them away, so a config or port failure surfaced as a bare
    // `waitForServer` timeout with the actual reason discarded. The `finally`
    // below asserted this had "already surfaced any Vite startup failure
    // above"; it had not. Now it has.
    if (viteOutput.trim()) {
      console.error(`--- vite output ---\n${viteOutput.trim()}\n--- end vite output ---`);
    }
    throw error;
  } finally {
    vite.kill('SIGTERM');
    if (vite.exitCode === null) await new Promise<void>((resolve) => vite.once('exit', () => resolve()));
  }
}

void main();
