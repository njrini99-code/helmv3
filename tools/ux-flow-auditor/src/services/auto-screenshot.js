/**
 * AutoScreenshotService - Automatically capture screenshots of all routes
 * 
 * Uses Puppeteer to:
 * - Launch headless browser
 * - Navigate to each route
 * - Capture desktop and mobile screenshots
 * - Store for analysis
 */

import puppeteer from 'puppeteer';
import { promises as fs } from 'fs';
import path from 'path';

export class AutoScreenshotService {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || 'http://localhost:3000';
    this.outputDir = config.outputDir || './screenshots';
    this.browser = null;
    this.page = null;
    
    // Viewport sizes
    this.viewports = {
      desktop: { width: 1440, height: 900 },
      mobile: { width: 390, height: 844 },
    };
    
    // Track capture status
    this.captured = new Map();
    this.failed = new Map();
  }

  async initialize() {
    console.log('📸 Initializing Auto Screenshot Service...');
    
    await fs.mkdir(this.outputDir, { recursive: true });
    
    try {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });
      
      this.page = await this.browser.newPage();
      await this.page.setViewport(this.viewports.desktop);
      this.page.setDefaultTimeout(30000);
      
      console.log('   ✅ Browser ready');
      return true;
    } catch (error) {
      console.error('   ❌ Failed to launch browser:', error.message);
      return false;
    }
  }

  async captureRoute(routePath, options = {}) {
    if (!this.browser) {
      await this.initialize();
    }
    
    const { waitFor = 2000 } = options;
    const url = `${this.baseUrl}${routePath}`;
    const safeRouteName = routePath.replace(/\//g, '_').replace(/^_/, '') || 'home';
    
    try {
      await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await this.page.waitForTimeout(waitFor);
      
      await this.page.setViewport(this.viewports.desktop);
      const desktopPath = path.join(this.outputDir, `${safeRouteName}_desktop.png`);
      await this.page.screenshot({ path: desktopPath, fullPage: false });
      
      const desktopBuffer = await fs.readFile(desktopPath);
      const desktopBase64 = `data:image/png;base64,${desktopBuffer.toString('base64')}`;
      
      const result = {
        route: routePath,
        desktop: desktopBase64,
        capturedAt: Date.now(),
        url,
      };
      
      this.captured.set(routePath, result);
      return result;
    } catch (error) {
      this.failed.set(routePath, { route: routePath, error: error.message, failedAt: Date.now() });
      return null;
    }
  }

  async captureAllRoutes(routes, onProgress) {
    console.log(`\n📸 Capturing ${routes.length} routes...\n`);
    
    const results = [];
    for (let i = 0; i < routes.length; i++) {
      const result = await this.captureRoute(routes[i]);
      if (result) results.push(result);
      
      if (onProgress) {
        onProgress({
          completed: i + 1,
          total: routes.length,
          percent: Math.round(((i + 1) / routes.length) * 100),
          current: routes[i],
          success: !!result,
        });
      }
    }
    
    return {
      captured: results,
      failed: Array.from(this.failed.values()),
      stats: { total: routes.length, success: results.length, failed: this.failed.size },
    };
  }

  async checkDevServer() {
    try {
      const response = await fetch(this.baseUrl);
      return response.ok;
    } catch {
      return false;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  getStatus() {
    return {
      initialized: !!this.browser,
      captured: this.captured.size,
      failed: this.failed.size,
      baseUrl: this.baseUrl,
    };
  }
}

export default AutoScreenshotService;
