/**
 * ImprovementAgent - Learns from fixes
 * 
 * AGENT COMMUNICATION:
 * - Receives issue notifications from other agents
 * - Shares learning discoveries
 * - Provides recommendations to agent router
 */

import { BaseAgent } from './coordination/base-agent.js';
import { promises as fs } from 'fs';
import path from 'path';

export class ImprovementAgent extends BaseAgent {
  constructor(config = {}) {
    super('improvement', [
      'learning',
      'pattern-detection',
      'fix-recommendation',
      'success-tracking',
    ]);

    this.config = {
      icon: '🧠',
      color: '#10b981',
      description: 'Learns from fixes to improve recommendations',
    };

    this.dataDir = config.dataDir || path.join(process.cwd(), 'data');
    
    // Learning data
    this.fixes = [];
    this.patterns = new Map();
    this.issueTracker = new Map(); // Track issues as they're reported
    
    this.stats = {
      totalFixes: 0,
      successfulFixes: 0,
      failedFixes: 0,
      patternsDetected: 0,
    };
  }

  async initialize() {
    this.log('info', 'Initializing learning system...');
    await this.loadData();
    this.log('success', `Loaded ${this.fixes.length} fixes, ${this.patterns.size} patterns`);
    return true;
  }

  /**
   * Load persisted data
   */
  async loadData() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      
      const fixesPath = path.join(this.dataDir, 'fixes.json');
      try {
        const data = await fs.readFile(fixesPath, 'utf-8');
        this.fixes = JSON.parse(data);
        this.updateStats();
      } catch { /* No existing data */ }
      
      const patternsPath = path.join(this.dataDir, 'patterns.json');
      try {
        const data = await fs.readFile(patternsPath, 'utf-8');
        this.patterns = new Map(Object.entries(JSON.parse(data)));
      } catch { /* No existing data */ }
      
    } catch (error) {
      this.log('warning', `Could not load learning data: ${error.message}`);
    }
  }

  /**
   * Save data
   */
  async saveData() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      
      await fs.writeFile(
        path.join(this.dataDir, 'fixes.json'),
        JSON.stringify(this.fixes, null, 2)
      );
      
      await fs.writeFile(
        path.join(this.dataDir, 'patterns.json'),
        JSON.stringify(Object.fromEntries(this.patterns), null, 2)
      );
      
    } catch (error) {
      this.log('error', `Could not save: ${error.message}`);
    }
  }

  /**
   * Record a fix
   */
  async recordFix(fix) {
    const record = {
      id: `fix-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: Date.now(),
      issueType: fix.issueType,
      issueCategory: fix.issueCategory,
      routePath: fix.routePath,
      approach: fix.approach,
      success: fix.success,
      scoreBefore: fix.scoreBefore,
      scoreAfter: fix.scoreAfter,
      delta: (fix.scoreAfter || 0) - (fix.scoreBefore || 0),
    };

    this.fixes.unshift(record);
    if (this.fixes.length > 500) {
      this.fixes = this.fixes.slice(0, 500);
    }

    // Track patterns
    this.trackPattern(record);
    this.updateStats();
    
    // Save periodically
    if (this.fixes.length % 5 === 0) {
      await this.saveData();
    }

    // AGENT COMMUNICATION: Share learning
    if (record.success) {
      this.shareDiscovery('successful-fix', {
        approach: record.approach,
        issueType: record.issueType,
        delta: record.delta,
      });
    }

    return record;
  }

  /**
   * Track patterns
   */
  trackPattern(fix) {
    const key = `${fix.issueType}::${fix.approach}`;
    const existing = this.patterns.get(key) || {
      issueType: fix.issueType,
      approach: fix.approach,
      attempts: 0,
      successes: 0,
      totalDelta: 0,
    };

    existing.attempts++;
    if (fix.success) {
      existing.successes++;
      existing.totalDelta += fix.delta;
    }
    existing.successRate = ((existing.successes / existing.attempts) * 100).toFixed(1);
    existing.avgDelta = existing.successes > 0 
      ? (existing.totalDelta / existing.successes).toFixed(1) 
      : 0;

    this.patterns.set(key, existing);

    // Pattern discovery
    if (existing.attempts === 3 && parseFloat(existing.successRate) >= 66) {
      this.stats.patternsDetected++;
      this.shareDiscovery('pattern-detected', {
        issueType: fix.issueType,
        approach: fix.approach,
        successRate: existing.successRate,
      });
    }
  }

  /**
   * Update stats
   */
  updateStats() {
    this.stats.totalFixes = this.fixes.length;
    this.stats.successfulFixes = this.fixes.filter(f => f.success).length;
    this.stats.failedFixes = this.fixes.filter(f => !f.success).length;
    this.stats.successRate = this.stats.totalFixes > 0
      ? ((this.stats.successfulFixes / this.stats.totalFixes) * 100).toFixed(1)
      : 0;
  }

  /**
   * Get recommendation for an issue type
   */
  getRecommendation(issueType) {
    const recommendations = [];
    const warnings = [];
    
    for (const [key, pattern] of this.patterns) {
      if (pattern.issueType === issueType && pattern.attempts >= 2) {
        if (parseFloat(pattern.successRate) >= 60) {
          recommendations.push({
            approach: pattern.approach,
            successRate: parseFloat(pattern.successRate),
            avgDelta: parseFloat(pattern.avgDelta),
            timesUsed: pattern.attempts,
          });
        } else if (parseFloat(pattern.successRate) < 40) {
          warnings.push({
            approach: pattern.approach,
            successRate: parseFloat(pattern.successRate),
            message: `Low success rate (${pattern.successRate}%)`,
          });
        }
      }
    }

    return {
      issueType,
      recommendations: recommendations.sort((a, b) => b.successRate - a.successRate).slice(0, 3),
      warnings,
      hasData: recommendations.length > 0,
    };
  }

  /**
   * Get proven approaches
   */
  getProvenApproaches() {
    const proven = [];
    for (const [key, pattern] of this.patterns) {
      if (pattern.attempts >= 3 && parseFloat(pattern.successRate) >= 70) {
        proven.push({
          name: pattern.approach,
          successRate: pattern.successRate,
          avgDelta: pattern.avgDelta,
          timesUsed: pattern.attempts,
        });
      }
    }
    return proven.sort((a, b) => parseFloat(b.successRate) - parseFloat(a.successRate));
  }

  /**
   * Get summary
   */
  getSummary() {
    return {
      stats: this.stats,
      provenApproaches: this.getProvenApproaches(),
      patternsCount: this.patterns.size,
      recentFixes: this.fixes.slice(0, 10),
    };
  }

  /**
   * Handle messages from other agents
   */
  handleMessage(message) {
    switch (message.type) {
      case 'issues-detected':
        // Track issues as they're detected
        for (const issue of message.payload.issues || []) {
          const key = `${message.payload.filePath}::${issue.id}`;
          this.issueTracker.set(key, {
            ...issue,
            filePath: message.payload.filePath,
            detectedAt: Date.now(),
            detectedBy: message.from,
          });
        }
        this.log('receive', `Tracking ${message.payload.issues?.length || 0} issues from ${message.from}`);
        break;
        
      case 'proposals-available':
        this.log('receive', `${message.payload.proposals?.length || 0} proposals available for ${message.payload.routePath}`);
        break;
        
      case 'discovery':
        if (message.payload.type === 'successful-fix') {
          this.log('info', `Learning from successful fix: ${message.payload.data.approach}`);
        }
        break;
    }
  }

  async shutdown() {
    await this.saveData();
    await super.shutdown();
  }

  getStatus() {
    return {
      ...this.getStats(),
      learning: this.getSummary(),
      trackedIssues: this.issueTracker.size,
    };
  }
}

export default ImprovementAgent;
