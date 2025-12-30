#!/usr/bin/env node

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OUTPUT_DIR = path.join(__dirname, '../snapshots');

async function captureAllRoutes(routes, timestamp = new Date().toISOString()) {
  console.log('🚀 Starting screenshot capture...');
  console.log(`📸 Base URL: ${BASE_URL}`);
  console.log(`🗂️  Routes to capture: ${routes.length}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // Retina quality
  });

  const screenshots = {};
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    const routePath = route.path || route;

    console.log(`\n[${i + 1}/${routes.length}] Capturing: ${routePath}`);

    const page = await context.newPage();

    // Collect console errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Collect network errors
    const networkErrors = [];
    page.on('requestfailed', request => {
      networkErrors.push({
        url: request.url(),
        error: request.failure().errorText
      });
    });

    // Handle dynamic routes with example params
    let url = routePath;
    if (url.includes('[')) {
      url = url
        .replace(/\[id\]/g, 'example-id')
        .replace(/\[slug\]/g, 'example-slug')
        .replace(/\[(\w+)\]/g, 'example-$1');
    }

    const fullUrl = BASE_URL + url;

    try {
      console.log(`  → Loading: ${fullUrl}`);

      // Navigate with timeout
      const response = await page.goto(fullUrl, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      const statusCode = response?.status() || 0;
      console.log(`  ✓ Status: ${statusCode}`);

      // Wait for animations to settle
      await page.waitForTimeout(500);

      // Capture desktop screenshot
      console.log('  📸 Capturing desktop...');
      const desktopBuffer = await page.screenshot({
        fullPage: false,
        animations: 'disabled'
      });

      // Capture mobile screenshot
      console.log('  📱 Capturing mobile...');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);
      const mobileBuffer = await page.screenshot({
        fullPage: false,
        animations: 'disabled'
      });

      // Capture full page scroll (desktop)
      console.log('  📜 Capturing full page...');
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(300);
      const fullPageBuffer = await page.screenshot({
        fullPage: true,
        animations: 'disabled'
      });

      screenshots[routePath] = {
        desktop: desktopBuffer.toString('base64'),
        mobile: mobileBuffer.toString('base64'),
        fullPage: fullPageBuffer.toString('base64'),
        capturedAt: new Date().toISOString(),
        status: 'success',
        statusCode,
        url: fullUrl,
        consoleErrors: consoleErrors.length > 0 ? consoleErrors : undefined,
        networkErrors: networkErrors.length > 0 ? networkErrors : undefined,
        viewport: {
          desktop: { width: 1440, height: 900 },
          mobile: { width: 390, height: 844 }
        }
      };

      successCount++;
      console.log(`  ✅ Success (${successCount}/${routes.length})`);

    } catch (error) {
      console.error(`  ❌ Error: ${error.message}`);
      screenshots[routePath] = {
        status: 'error',
        error: error.message,
        url: fullUrl,
        capturedAt: new Date().toISOString(),
        consoleErrors: consoleErrors.length > 0 ? consoleErrors : undefined,
        networkErrors: networkErrors.length > 0 ? networkErrors : undefined
      };
      errorCount++;
    }

    await page.close();
  }

  await browser.close();

  console.log('\n📊 Capture Summary:');
  console.log(`  ✅ Success: ${successCount}`);
  console.log(`  ❌ Errors: ${errorCount}`);
  console.log(`  📁 Total: ${routes.length}`);

  return {
    screenshots,
    summary: {
      total: routes.length,
      success: successCount,
      errors: errorCount,
      timestamp,
      baseUrl: BASE_URL
    }
  };
}

async function saveScreenshots(data, timestamp) {
  const snapshotDir = path.join(OUTPUT_DIR, timestamp.replace(/:/g, '-').split('.')[0]);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  if (!fs.existsSync(snapshotDir)) {
    fs.mkdirSync(snapshotDir, { recursive: true });
  }

  // Save screenshots.json
  const screenshotsPath = path.join(snapshotDir, 'screenshots.json');
  fs.writeFileSync(screenshotsPath, JSON.stringify(data, null, 2));

  console.log(`\n💾 Saved to: ${snapshotDir}`);

  // Update 'latest' symlink
  const latestLink = path.join(OUTPUT_DIR, 'latest');
  if (fs.existsSync(latestLink)) {
    fs.unlinkSync(latestLink);
  }
  fs.symlinkSync(snapshotDir, latestLink);

  console.log(`🔗 Updated latest symlink`);

  return snapshotDir;
}

// CLI mode
if (require.main === module) {
  const routesFile = process.argv[2];

  if (!routesFile) {
    console.error('Usage: node capture.js <routes.json>');
    console.error('Example: node capture.js routes.json');
    process.exit(1);
  }

  if (!fs.existsSync(routesFile)) {
    console.error(`Error: Routes file not found: ${routesFile}`);
    process.exit(1);
  }

  const routesData = JSON.parse(fs.readFileSync(routesFile, 'utf8'));
  const routes = Array.isArray(routesData) ? routesData : Object.keys(routesData);

  const timestamp = new Date().toISOString();

  captureAllRoutes(routes, timestamp)
    .then(data => saveScreenshots(data, timestamp))
    .then(() => {
      console.log('\n✨ Screenshot capture complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { captureAllRoutes, saveScreenshots };
