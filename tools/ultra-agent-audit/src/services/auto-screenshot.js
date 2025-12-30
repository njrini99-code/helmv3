/**
 * AutoScreenshotService - Automatically capture screenshots of all routes
 * Uses Puppeteer to capture desktop screenshots for visual analysis
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
    this.viewport = { width: 1440, height: 900 };
    this.captured = new Map();
    this.failed = new Map();
  }

  async initialize() {
    console.log('📸 Initializing Auto Screenshot Service...');
    await fs.mkdir(this.outputDir, { recursive: true });
    
    try {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
      this.page = await this.browser.newPage();
      await this.page.setViewport(this.viewport);
      this.page.setDefaultTimeout(30000);
      console.log('✅ Browser launched successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to launch browser:', error.message);
      return false;
    }
  }

  async captureRoute(routePath, options = {}) {
    if (!this.browser) {
      const initialized = await this.initialize();
      if (!initialized) return null;
    }
    
    const url = `${this.baseUrl}${routePath}`;
    const safeName = routePath.replace(/\//g, '_').replace(/^_/, '') || 'home';
    
    try {
      console.log(`📷 Capturing: ${routePath}`);
      await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await this.page.waitForTimeout(options.waitFor || 1500);
      
      const screenshotPath = path.join(this.outputDir, `${safeName}.png`);
      await this.page.screenshot({ path: screenshotPath, fullPage: false });
      
      const buffer = await fs.readFile(screenshotPath);
      const base64 = `data:image/png;base64,${buffer.toString('base64')}`;
      
      const result = { 
        route: routePath, 
        screenshot: base64, 
        capturedAt: Date.now(), 
        url,
        filePath: screenshotPath
      };
      this.captured.set(routePath, result);
      console.log(`✅ Captured: ${routePath}`);
      return result;
    } catch (error) {
      console.error(`❌ Failed to capture ${routePath}:`, error.message);
      this.failed.set(routePath, { 
        route: routePath, 
        error: error.message, 
        failedAt: Date.now() 
      });
      return null;
    }
  }

  async captureAllRoutes(routes, onProgress) {
    console.log(`📸 Starting capture of ${routes.length} routes...`);
    const results = [];
    
    for (let i = 0; i < routes.length; i++) {
      const result = await this.captureRoute(routes[i]);
      if (result) results.push(result);
      
      if (onProgress) {
        onProgress({ 
          completed: i + 1, 
          total: routes.length, 
          current: routes[i], 
          success: !!result 
        });
      }
    }
    
    console.log(`✅ Capture complete: ${results.length}/${routes.length} successful`);
    return { 
      captured: results, 
      failed: Array.from(this.failed.values()) 
    };
  }

  async checkDevServer() {
    try { 
      const r = await fetch(this.baseUrl); 
      return r.ok; 
    } catch { 
      return false; 
    }
  }

  async close() {
    if (this.browser) { 
      await this.browser.close(); 
      this.browser = null;
      this.page = null;
      console.log('🔒 Browser closed');
    }
  }

  getStatus() {
    return { 
      initialized: !!this.browser, 
      captured: this.captured.size, 
      failed: this.failed.size,
      capturedRoutes: Array.from(this.captured.keys()),
      failedRoutes: Array.from(this.failed.keys())
    };
  }

  getScreenshot(routePath) {
    return this.captured.get(routePath) || null;
  }

  getAllScreenshots() {
    return Array.from(this.captured.values());
  }
}

export default AutoScreenshotService;
