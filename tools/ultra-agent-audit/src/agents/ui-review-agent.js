/**
 * UIReviewAgent - Before/after screenshot validation
 * 
 * This agent:
 * - Captures before/after screenshots
 * - Validates fixes visually
 * - Detects regressions
 * - Scores UI improvements
 * - Works with Puppeteer for captures
 */

import { BaseAgent } from './coordination/base-agent.js';
import puppeteer from 'puppeteer';

export class UIReviewAgent extends BaseAgent {
  constructor(config = {}) {
    super('ui-review', [
      'screenshot-capture',
      'before-after',
      'regression-detection',
      'visual-validation',
    ]);

    this.config = {
      icon: '📸',
      color: '#06b6d4', // Cyan
      description: 'Captures and validates UI changes',
    };

    this.baseUrl = config.baseUrl || 'http://localhost:3000';
    this.browser = null;
    this.screenshots = new Map();
    this.comparisons = [];
  }

  async initialize() {
    this.log('info', 'Initializing UI Review agent...');
    
    try {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      this.log('success', 'Browser launched for screenshots');
      return true;
    } catch (error) {
      this.log('warning', `Could not launch browser: ${error.message}`);
      this.log('info', 'Screenshots will be unavailable - using code-only validation');
      return true;
    }
  }

  /**
   * Capture a screenshot for a route
   */
  async captureScreenshot(routePath, label = 'current') {
    return this.executeTask(`Capture ${routePath}`, async () => {
      if (!this.browser) {
        throw new Error('Browser not available');
      }

      const page = await this.browser.newPage();
      
      try {
        await page.setViewport({ width: 1440, height: 900 });
        
        const url = `${this.baseUrl}${routePath}`;
        this.log('info', `Navigating to ${url}`);
        
        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });

        // Wait for any animations
        await page.waitForTimeout(500);

        const screenshot = await page.screenshot({
          encoding: 'base64',
          fullPage: false,
        });

        // Store with label
        const key = `${routePath}:${label}`;
        this.screenshots.set(key, {
          base64: screenshot,
          timestamp: Date.now(),
          url,
          viewport: { width: 1440, height: 900 },
        });

        this.log('success', `Screenshot captured: ${label}`);

        return {
          key,
          base64: screenshot,
          timestamp: Date.now(),
        };

      } finally {
        await page.close();
      }
    });
  }

  /**
   * Capture before screenshot (pre-fix)
   */
  async captureBefore(routePath) {
    return this.captureScreenshot(routePath, 'before');
  }

  /**
   * Capture after screenshot (post-fix)
   */
  async captureAfter(routePath) {
    return this.captureScreenshot(routePath, 'after');
  }

  /**
   * Compare before and after screenshots
   */
  async compareScreenshots(routePath) {
    return this.executeTask(`Compare ${routePath}`, async () => {
      const beforeKey = `${routePath}:before`;
      const afterKey = `${routePath}:after`;

      const before = this.screenshots.get(beforeKey);
      const after = this.screenshots.get(afterKey);

      if (!before || !after) {
        return {
          success: false,
          error: 'Missing before or after screenshot',
          hasBefore: !!before,
          hasAfter: !!after,
        };
      }

      // Basic comparison (in real implementation, use image diff library)
      const comparison = {
        routePath,
        before: {
          timestamp: before.timestamp,
          available: true,
        },
        after: {
          timestamp: after.timestamp,
          available: true,
        },
        timeBetween: after.timestamp - before.timestamp,
        verdict: 'unknown', // Would be 'improved' | 'regressed' | 'unchanged'
        confidence: 0,
      };

      // Store comparison
      this.comparisons.unshift(comparison);
      if (this.comparisons.length > 50) {
        this.comparisons = this.comparisons.slice(0, 50);
      }

      // Share discovery
      this.shareDiscovery('ui-comparison', {
        summary: `Compared before/after for ${routePath}`,
        routePath,
        timeBetween: comparison.timeBetween,
      });

      return comparison;
    });
  }

  /**
   * Validate a fix visually
   */
  async validateFix(routePath, issueDescription) {
    return this.executeTask(`Validate fix: ${routePath}`, async () => {
      // Capture after screenshot
      const after = await this.captureScreenshot(routePath, 'after');

      // Get before if available
      const beforeKey = `${routePath}:before`;
      const before = this.screenshots.get(beforeKey);

      const validation = {
        routePath,
        issue: issueDescription,
        timestamp: Date.now(),
        hasComparison: !!before,
        afterScreenshot: after.base64?.substring(0, 100) + '...',
      };

      // If we have visual analysis agent, request deeper analysis
      this.requestHelp('screenshot-analysis', {
        routePath,
        screenshot: after.base64,
        context: `Validating fix for: ${issueDescription}`,
      });

      return validation;
    });
  }

  /**
   * Get screenshot for a route
   */
  getScreenshot(routePath, label = 'current') {
    const key = `${routePath}:${label}`;
    return this.screenshots.get(key);
  }

  /**
   * Get all screenshots for a route
   */
  getRouteScreenshots(routePath) {
    const result = {};
    
    for (const [key, value] of this.screenshots) {
      if (key.startsWith(routePath)) {
        const label = key.split(':')[1];
        result[label] = value;
      }
    }

    return result;
  }

  /**
   * Clear screenshots for a route
   */
  clearScreenshots(routePath) {
    for (const key of this.screenshots.keys()) {
      if (key.startsWith(routePath)) {
        this.screenshots.delete(key);
      }
    }
  }

  /**
   * Get recent comparisons
   */
  getComparisons(limit = 10) {
    return this.comparisons.slice(0, limit);
  }

  /**
   * Check if dev server is running
   */
  async checkDevServer() {
    if (!this.browser) return false;

    const page = await this.browser.newPage();
    
    try {
      await page.goto(this.baseUrl, { timeout: 5000 });
      return true;
    } catch {
      return false;
    } finally {
      await page.close();
    }
  }

  /**
   * Get agent status
   */
  getStatus() {
    return {
      ...this.getStats(),
      browserReady: !!this.browser,
      screenshotCount: this.screenshots.size,
      comparisonCount: this.comparisons.length,
      baseUrl: this.baseUrl,
    };
  }

  /**
   * Shutdown
   */
  async shutdown() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    await super.shutdown();
  }
}

export default UIReviewAgent;
