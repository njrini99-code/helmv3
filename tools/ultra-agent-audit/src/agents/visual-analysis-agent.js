/**
 * VisualAnalysisAgent - Analyzes screenshots WITHOUT paid API calls
 * 
 * This agent:
 * - Loads screenshots from disk
 * - Analyzes metadata (dimensions, file size)
 * - Tracks screenshot versions over time
 * - Communicates with other agents about visual state
 * 
 * NO PAID API CALLS - just file-based analysis
 */

import { BaseAgent } from './coordination/base-agent.js';
import { promises as fs } from 'fs';
import path from 'path';

export class VisualAnalysisAgent extends BaseAgent {
  constructor(config = {}) {
    super('visual-analysis', [
      'screenshot-loading',
      'screenshot-tracking',
      'visual-metadata',
      'version-history',
    ]);

    this.config = {
      icon: '👁️',
      color: '#8b5cf6',
      description: 'Loads and tracks screenshots (no API costs)',
    };

    this.screenshotDir = config.screenshotDir || path.join(process.cwd(), 'screenshots');
    this.screenshots = new Map(); // routePath -> screenshot data
    this.versionHistory = new Map(); // routePath -> versions[]
  }

  async initialize() {
    this.log('info', 'Initializing screenshot loader...');
    
    // Ensure screenshot directory exists
    try {
      await fs.mkdir(this.screenshotDir, { recursive: true });
    } catch (e) { /* exists */ }
    
    // Load existing screenshots
    await this.loadExistingScreenshots();
    
    this.log('success', `Loaded ${this.screenshots.size} screenshots`);
    return true;
  }

  /**
   * Load all existing screenshots from disk
   */
  async loadExistingScreenshots() {
    try {
      const files = await fs.readdir(this.screenshotDir);
      
      for (const file of files) {
        if (file.endsWith('.png') || file.endsWith('.jpg')) {
          const filePath = path.join(this.screenshotDir, file);
          const stats = await fs.stat(filePath);
          
          // Extract route path from filename
          const routePath = this.filenameToRoute(file);
          
          this.screenshots.set(routePath, {
            filename: file,
            filePath,
            routePath,
            size: stats.size,
            modified: stats.mtime,
            loaded: Date.now(),
          });
        }
      }
    } catch (error) {
      this.log('warning', `Could not load screenshots: ${error.message}`);
    }
  }

  /**
   * Convert filename to route path
   * e.g., "baseball--dashboard--overview.png" -> "/baseball/dashboard/overview"
   */
  filenameToRoute(filename) {
    const name = filename.replace(/\.(png|jpg|jpeg)$/, '');
    const parts = name.split('--');
    return '/' + parts.join('/');
  }

  /**
   * Convert route path to filename
   * e.g., "/baseball/dashboard/overview" -> "baseball--dashboard--overview.png"
   */
  routeToFilename(routePath) {
    const clean = routePath.replace(/^\//, '').replace(/\//g, '--');
    return `${clean}.png`;
  }

  /**
   * Get screenshot for a route
   */
  async getScreenshot(routePath) {
    return this.executeTask(`Get screenshot: ${routePath}`, async () => {
      // Check memory cache first
      let screenshot = this.screenshots.get(routePath);
      
      if (!screenshot) {
        // Try to load from disk
        const filename = this.routeToFilename(routePath);
        const filePath = path.join(this.screenshotDir, filename);
        
        try {
          const stats = await fs.stat(filePath);
          screenshot = {
            filename,
            filePath,
            routePath,
            size: stats.size,
            modified: stats.mtime,
            loaded: Date.now(),
          };
          this.screenshots.set(routePath, screenshot);
        } catch {
          // No screenshot exists
          return null;
        }
      }

      // Read as base64 for display
      try {
        const buffer = await fs.readFile(screenshot.filePath);
        screenshot.base64 = buffer.toString('base64');
        screenshot.dataUrl = `data:image/png;base64,${screenshot.base64}`;
      } catch (error) {
        this.log('error', `Could not read screenshot: ${error.message}`);
      }

      return screenshot;
    });
  }

  /**
   * Save a screenshot
   */
  async saveScreenshot(routePath, imageBuffer) {
    return this.executeTask(`Save screenshot: ${routePath}`, async () => {
      const filename = this.routeToFilename(routePath);
      const filePath = path.join(this.screenshotDir, filename);
      
      // Save old version to history
      const existing = this.screenshots.get(routePath);
      if (existing) {
        this.addToHistory(routePath, existing);
      }
      
      // Write new screenshot
      await fs.writeFile(filePath, imageBuffer);
      const stats = await fs.stat(filePath);
      
      const screenshot = {
        filename,
        filePath,
        routePath,
        size: stats.size,
        modified: stats.mtime,
        loaded: Date.now(),
      };
      
      this.screenshots.set(routePath, screenshot);
      
      // Share discovery with other agents
      this.shareDiscovery('screenshot-updated', {
        routePath,
        filename,
        size: stats.size,
      });
      
      return screenshot;
    });
  }

  /**
   * Add screenshot to version history
   */
  addToHistory(routePath, screenshot) {
    if (!this.versionHistory.has(routePath)) {
      this.versionHistory.set(routePath, []);
    }
    
    const history = this.versionHistory.get(routePath);
    history.unshift({
      ...screenshot,
      version: history.length + 1,
      archivedAt: Date.now(),
    });
    
    // Keep last 10 versions
    if (history.length > 10) {
      this.versionHistory.set(routePath, history.slice(0, 10));
    }
  }

  /**
   * Get version history for a route
   */
  getVersionHistory(routePath) {
    return this.versionHistory.get(routePath) || [];
  }

  /**
   * Get all screenshots summary
   */
  getAllScreenshots() {
    const screenshots = [];
    
    for (const [routePath, data] of this.screenshots) {
      screenshots.push({
        routePath,
        filename: data.filename,
        size: data.size,
        modified: data.modified,
        hasVersions: this.versionHistory.has(routePath),
        versionCount: (this.versionHistory.get(routePath) || []).length,
      });
    }
    
    return screenshots;
  }

  /**
   * Check if screenshot exists for route
   */
  hasScreenshot(routePath) {
    return this.screenshots.has(routePath);
  }

  /**
   * Delete screenshot
   */
  async deleteScreenshot(routePath) {
    const screenshot = this.screenshots.get(routePath);
    if (!screenshot) return false;
    
    try {
      await fs.unlink(screenshot.filePath);
      this.screenshots.delete(routePath);
      
      this.shareDiscovery('screenshot-deleted', { routePath });
      
      return true;
    } catch (error) {
      this.log('error', `Could not delete screenshot: ${error.message}`);
      return false;
    }
  }

  /**
   * Handle messages from other agents
   */
  handleMessage(message) {
    switch (message.type) {
      case 'request-screenshot':
        // Another agent wants a screenshot
        this.getScreenshot(message.payload.routePath).then(screenshot => {
          if (screenshot) {
            this.sendToAgent(message.from, 'screenshot-response', {
              routePath: message.payload.routePath,
              screenshot,
            });
          }
        });
        break;
        
      case 'discovery':
        // React to discoveries from other agents
        if (message.payload.type === 'route-analyzed') {
          // Could trigger screenshot capture here if integrated with puppeteer
          this.log('info', `Route analyzed: ${message.payload.data.routePath}`);
        }
        break;
    }
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      ...this.getStats(),
      screenshotCount: this.screenshots.size,
      screenshotDir: this.screenshotDir,
      routesWithHistory: this.versionHistory.size,
    };
  }
}

export default VisualAnalysisAgent;
