/**
 * UIReviewAgent - Visual validation with YOUR design system built-in
 * 
 * Capabilities:
 * - Screenshot capture and comparison
 * - Design system validation
 * - Responsive checking
 * - Loading state validation
 * - Animation validation
 */
import { BaseAgent } from './coordination/base-agent.js';
import { chromium } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';

export class UIReviewAgent extends BaseAgent {
  constructor(config = {}) {
    super('ui-review', [
      'visual-validation',
      'screenshot-capture',
      'responsive-check',
      'animation-validation',
      'design-system',
    ]);
    
    this.projectRoot = config.projectRoot;
    this.config = {
      baseUrl: config.baseUrl || 'http://localhost:3000',
      screenshotDir: path.join(config.projectRoot || '.', '.helmdev', 'screenshots'),
      viewports: config.viewports || [
        { name: 'mobile', width: 375, height: 667 },
        { name: 'tablet', width: 768, height: 1024 },
        { name: 'desktop', width: 1440, height: 900 },
      ],
      waitForNetwork: config.waitForNetwork || 'networkidle',
      ...config,
    };
    
    this.browser = null;
    this.page = null;
    
    // YOUR design system rules
    this.designSystem = {
      spacing: [4, 8, 12, 16, 24, 32, 48, 64],
      radii: {
        input: 8,
        button: 12,
        card: 16,
        modal: 24,
      },
      transitions: {
        hover: '150ms',
        state: '220ms',
        modal: '300ms',
      },
      colors: {
        primary: '#10b981',
        background: {
          dark: ['#0a0a0f', '#12121a', '#1a1a24'],
          light: ['#ffffff', '#f4f4f5', '#e4e4e7'],
        },
        accent: {
          green: '#10b981',
          red: '#ef4444',
          yellow: '#f59e0b',
          blue: '#3b82f6',
        },
      },
      glassElements: ['nav', 'toolbar', 'modal', 'sidebar'],
      noGlass: ['table', 'form', 'card-content', 'list'],
    };
  }

  /**
   * Start the agent
   */
  async start(sharedState) {
    super.start(sharedState);
    
    try {
      // Launch browser
      this.browser = await chromium.launch({
        headless: true,
      });
      
      this.page = await this.browser.newPage();
      
      // Ensure screenshot directory exists
      await fs.mkdir(this.config.screenshotDir, { recursive: true });
      
      console.log('   📸 Screenshot capture ready');
    } catch (error) {
      console.error('   ⚠️ Browser launch failed:', error.message);
    }
  }

  /**
   * Stop the agent
   */
  async stop() {
    super.stop();
    
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  /**
   * Review a route with visual analysis
   */
  async reviewRoute(routePath, screenshotData, codeContent) {
    const suggestions = [];
    const scores = {
      overall: 70,
      spacing: 80,
      consistency: 75,
      responsiveness: 70,
      animations: 65,
    };
    
    // Analyze code for design system compliance
    if (codeContent) {
      const codeIssues = this.analyzeCode(codeContent, routePath);
      suggestions.push(...codeIssues);
      
      // Adjust scores based on issues
      const spacingIssues = codeIssues.filter(i => i.category === 'spacing');
      const glassIssues = codeIssues.filter(i => i.category === 'glass');
      const animationIssues = codeIssues.filter(i => i.category === 'animation');
      
      scores.spacing = Math.max(0, 100 - spacingIssues.length * 10);
      scores.consistency = Math.max(0, 100 - glassIssues.length * 15);
      scores.animations = Math.max(0, 100 - animationIssues.length * 10);
      scores.overall = Math.round((scores.spacing + scores.consistency + scores.responsiveness + scores.animations) / 4);
    }
    
    return {
      routePath,
      review: {
        scores,
        timestamp: Date.now(),
      },
      suggestions,
    };
  }

  /**
   * Analyze code for design system violations
   */
  analyzeCode(code, routePath) {
    const issues = [];
    const lines = code.split('\n');
    
    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      
      // Check for wrong spacing values
      const spacingMatch = line.match(/(?:p|m|gap|space)-(\d+)/g);
      if (spacingMatch) {
        spacingMatch.forEach(match => {
          const value = parseInt(match.match(/\d+/)[0]);
          const pxValue = value * 4; // Tailwind uses 4px scale
          if (!this.designSystem.spacing.includes(pxValue) && value > 0) {
            issues.push({
              id: `spacing-${routePath}-${lineNumber}`,
              category: 'spacing',
              severity: 'warning',
              title: `Non-standard spacing: ${match}`,
              description: `Line ${lineNumber}: Using ${match} (${pxValue}px). Use standard values: ${this.designSystem.spacing.join(', ')}px`,
              line: lineNumber,
              suggestedFix: `Replace with nearest standard value`,
            });
          }
        });
      }
      
      // Check for glass on wrong elements
      if (line.includes('backdrop-blur') || line.includes('bg-opacity') || line.includes('glass')) {
        const isValidGlass = this.designSystem.glassElements.some(el => 
          line.toLowerCase().includes(el) || 
          routePath.toLowerCase().includes(el)
        );
        const isInvalidGlass = this.designSystem.noGlass.some(el => 
          line.toLowerCase().includes(el)
        );
        
        if (isInvalidGlass && !isValidGlass) {
          issues.push({
            id: `glass-${routePath}-${lineNumber}`,
            category: 'glass',
            severity: 'warning',
            title: 'Glass effect on wrong element',
            description: `Line ${lineNumber}: Glass effects should only be used on: ${this.designSystem.glassElements.join(', ')}`,
            line: lineNumber,
            suggestedFix: 'Remove glassmorphism from this element',
          });
        }
      }
      
      // Check for missing transitions on interactive elements
      if ((line.includes('hover:') || line.includes('onClick')) && 
          !line.includes('transition') && 
          !line.includes('animate-')) {
        issues.push({
          id: `transition-${routePath}-${lineNumber}`,
          category: 'animation',
          severity: 'info',
          title: 'Missing transition on interactive element',
          description: `Line ${lineNumber}: Interactive elements should have transitions for smooth state changes`,
          line: lineNumber,
          suggestedFix: `Add transition-colors or transition-all with duration-150`,
        });
      }
      
      // Check for wrong border radius
      const radiusMatch = line.match(/rounded-(\w+)/);
      if (radiusMatch) {
        const radius = radiusMatch[1];
        // Map Tailwind to px values
        const radiusMap = {
          'sm': 2, 'md': 6, 'lg': 8, 'xl': 12, '2xl': 16, '3xl': 24, 'full': 9999
        };
        const pxValue = radiusMap[radius];
        
        // Check context for appropriate radius
        if (line.includes('input') || line.includes('Input')) {
          if (pxValue !== this.designSystem.radii.input) {
            issues.push({
              id: `radius-input-${routePath}-${lineNumber}`,
              category: 'consistency',
              severity: 'info',
              title: 'Input radius should be rounded-lg (8px)',
              description: `Line ${lineNumber}: Inputs should use rounded-lg for consistency`,
              line: lineNumber,
              suggestedFix: 'Change to rounded-lg',
            });
          }
        } else if (line.includes('button') || line.includes('Button') || line.includes('btn')) {
          if (pxValue !== this.designSystem.radii.button && pxValue !== 9999) {
            issues.push({
              id: `radius-button-${routePath}-${lineNumber}`,
              category: 'consistency',
              severity: 'info',
              title: 'Button radius should be rounded-xl (12px)',
              description: `Line ${lineNumber}: Buttons should use rounded-xl for consistency`,
              line: lineNumber,
              suggestedFix: 'Change to rounded-xl',
            });
          }
        }
      }
    });
    
    return issues;
  }

  /**
   * Capture screenshots for a route
   */
  async captureRoute(routePath, options = {}) {
    if (!this.browser || !this.page) {
      return [{ error: 'Browser not initialized', success: false }];
    }
    
    const url = `${this.config.baseUrl}${routePath}`;
    const results = [];
    
    for (const viewport of this.config.viewports) {
      await this.page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      
      try {
        await this.page.goto(url, {
          waitUntil: this.config.waitForNetwork,
          timeout: 30000,
        });
        
        // Wait for any animations to complete
        await this.page.waitForTimeout(500);
        
        // Capture full page screenshot
        const screenshotPath = path.join(
          this.config.screenshotDir,
          `${routePath.replace(/\//g, '_')}_${viewport.name}_${Date.now()}.png`
        );
        
        await this.page.screenshot({
          path: screenshotPath,
          fullPage: options.fullPage ?? true,
        });
        
        results.push({
          viewport: viewport.name,
          url,
          screenshotPath,
          success: true,
        });
        
        this.discover({
          summary: `Captured ${viewport.name} screenshot for ${routePath}`,
          routePath,
          viewport: viewport.name,
        });
        
      } catch (error) {
        results.push({
          viewport: viewport.name,
          url,
          error: error.message,
          success: false,
        });
      }
    }
    
    return results;
  }

  /**
   * Validate that a loading state exists and works
   */
  async validateLoadingState(routePath) {
    if (!this.browser || !this.page) {
      return { hasLoadingState: false, error: 'Browser not initialized' };
    }
    
    const url = `${this.config.baseUrl}${routePath}`;
    
    await this.page.setViewportSize({ width: 1440, height: 900 });
    
    try {
      // Throttle network to make loading state visible
      const cdpSession = await this.page.context().newCDPSession(this.page);
      await cdpSession.send('Network.emulateNetworkConditions', {
        offline: false,
        downloadThroughput: 100 * 1024, // 100kb/s
        uploadThroughput: 50 * 1024,
        latency: 1000, // 1s latency
      });
      
      // Navigate and capture loading state
      const loadingPromise = this.page.goto(url, {
        waitUntil: 'commit', // Don't wait for full load
      });
      
      // Wait a bit for loading state to appear
      await this.page.waitForTimeout(200);
      
      // Check for loading indicators
      const hasLoadingIndicator = await this.page.evaluate(() => {
        const spinners = document.querySelectorAll('[class*="spin"], [class*="loading"], [class*="skeleton"]');
        const animatedElements = document.querySelectorAll('[class*="animate-pulse"], [class*="animate-spin"]');
        const loadingText = document.body.innerText.toLowerCase().includes('loading');
        
        return {
          hasSpinner: spinners.length > 0,
          hasAnimations: animatedElements.length > 0,
          hasLoadingText: loadingText,
          count: spinners.length + animatedElements.length,
        };
      });
      
      // Wait for full load
      await loadingPromise;
      
      // Reset network conditions
      await cdpSession.send('Network.emulateNetworkConditions', {
        offline: false,
        downloadThroughput: -1,
        uploadThroughput: -1,
        latency: 0,
      });
      
      const hasValidLoadingState = 
        hasLoadingIndicator.hasSpinner || 
        hasLoadingIndicator.hasAnimations ||
        hasLoadingIndicator.hasLoadingText;
      
      return {
        routePath,
        hasLoadingState: hasValidLoadingState,
        loadingIndicators: hasLoadingIndicator,
      };
    } catch (error) {
      return {
        routePath,
        hasLoadingState: false,
        error: error.message,
      };
    }
  }

  /**
   * Check responsive behavior
   */
  async checkResponsive(routePath) {
    if (!this.browser || !this.page) {
      return { hasIssues: false, error: 'Browser not initialized' };
    }
    
    const results = [];
    
    for (const viewport of this.config.viewports) {
      await this.page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      
      await this.page.goto(`${this.config.baseUrl}${routePath}`, {
        waitUntil: this.config.waitForNetwork,
      });
      
      // Check for horizontal overflow
      const hasOverflow = await this.page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      
      results.push({
        viewport: viewport.name,
        width: viewport.width,
        hasHorizontalOverflow: hasOverflow,
        issues: hasOverflow ? [`Horizontal overflow detected at ${viewport.width}px`] : [],
      });
    }
    
    return {
      routePath,
      results,
      hasIssues: results.some(r => r.hasHorizontalOverflow),
    };
  }

  /**
   * Validate proposal against design system
   */
  async validate(proposal) {
    // Check if proposal follows design system rules
    const code = proposal.code || proposal.suggestedFix || '';
    const issues = this.analyzeCode(code, proposal.routePath || '/');
    
    const hasDesignIssues = issues.some(i => i.severity === 'warning' || i.severity === 'error');
    
    return {
      approved: !hasDesignIssues,
      confidence: hasDesignIssues ? 0.3 : 0.8,
      feedback: hasDesignIssues 
        ? `Proposal has ${issues.length} design system violations`
        : 'Proposal follows design system guidelines',
    };
  }
}

export default UIReviewAgent;
