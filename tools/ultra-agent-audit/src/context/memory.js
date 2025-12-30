/**
 * ProjectMemory - Persistent learning and knowledge storage
 * 
 * Features:
 * - Semantic search over past fixes
 * - Success/failure tracking
 * - Pattern detection from history
 * - Context retrieval for new issues
 */

import { promises as fs } from 'fs';
import path from 'path';

export class ProjectMemory {
  constructor(dataDir) {
    this.dataDir = dataDir || path.join(process.cwd(), 'data', 'memory');
    
    // In-memory stores
    this.fixes = [];
    this.insights = [];
    this.patterns = new Map();
    this.routeHistory = new Map();
    
    // Search index (simple keyword-based)
    this.searchIndex = new Map();
  }

  /**
   * Initialize and load persisted data
   */
  async initialize() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Load fixes
      try {
        const fixesData = await fs.readFile(path.join(this.dataDir, 'fixes.json'), 'utf-8');
        this.fixes = JSON.parse(fixesData);
        this.buildSearchIndex();
      } catch { /* No existing data */ }

      // Load insights
      try {
        const insightsData = await fs.readFile(path.join(this.dataDir, 'insights.json'), 'utf-8');
        this.insights = JSON.parse(insightsData);
      } catch { /* No existing data */ }

      // Load patterns
      try {
        const patternsData = await fs.readFile(path.join(this.dataDir, 'patterns.json'), 'utf-8');
        this.patterns = new Map(Object.entries(JSON.parse(patternsData)));
      } catch { /* No existing data */ }

      return {
        fixes: this.fixes.length,
        insights: this.insights.length,
        patterns: this.patterns.size,
      };
    } catch (error) {
      console.error('Memory initialization error:', error.message);
      return { fixes: 0, insights: 0, patterns: 0 };
    }
  }

  /**
   * Save all data to disk
   */
  async save() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      
      await fs.writeFile(
        path.join(this.dataDir, 'fixes.json'),
        JSON.stringify(this.fixes, null, 2)
      );
      
      await fs.writeFile(
        path.join(this.dataDir, 'insights.json'),
        JSON.stringify(this.insights, null, 2)
      );
      
      await fs.writeFile(
        path.join(this.dataDir, 'patterns.json'),
        JSON.stringify(Object.fromEntries(this.patterns), null, 2)
      );

      return true;
    } catch (error) {
      console.error('Memory save error:', error.message);
      return false;
    }
  }

  /**
   * Record a fix attempt
   */
  recordFix(fix) {
    const record = {
      id: `fix-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      issueType: fix.issueType,
      issueCategory: fix.issueCategory,
      routePath: fix.routePath,
      approach: fix.approach,
      description: fix.description,
      success: fix.success,
      scoreBefore: fix.scoreBefore,
      scoreAfter: fix.scoreAfter,
      delta: (fix.scoreAfter || 0) - (fix.scoreBefore || 0),
      codeSnippet: fix.codeSnippet?.substring(0, 500),
      duration: fix.duration,
      tags: fix.tags || [],
    };

    this.fixes.unshift(record);
    
    // Limit size
    if (this.fixes.length > 500) {
      this.fixes = this.fixes.slice(0, 500);
    }

    // Update search index
    this.indexFix(record);

    // Detect patterns
    this.detectPatterns(record);

    // Update route history
    this.updateRouteHistory(record);

    // Auto-save periodically
    if (this.fixes.length % 5 === 0) {
      this.save();
    }

    return record;
  }

  /**
   * Record an insight
   */
  recordInsight(insight) {
    const record = {
      id: `insight-${Date.now()}`,
      timestamp: Date.now(),
      type: insight.type,
      summary: insight.summary,
      details: insight.details,
      source: insight.source,
      confidence: insight.confidence || 0.5,
      tags: insight.tags || [],
    };

    this.insights.unshift(record);
    
    if (this.insights.length > 200) {
      this.insights = this.insights.slice(0, 200);
    }

    return record;
  }

  /**
   * Build search index from fixes
   */
  buildSearchIndex() {
    this.searchIndex.clear();
    
    for (const fix of this.fixes) {
      this.indexFix(fix);
    }
  }

  /**
   * Index a fix for search
   */
  indexFix(fix) {
    const keywords = this.extractKeywords(fix);
    
    for (const keyword of keywords) {
      if (!this.searchIndex.has(keyword)) {
        this.searchIndex.set(keyword, []);
      }
      this.searchIndex.get(keyword).push(fix.id);
    }
  }

  /**
   * Extract keywords from a fix
   */
  extractKeywords(fix) {
    const text = [
      fix.issueType,
      fix.issueCategory,
      fix.approach,
      fix.description,
      fix.routePath,
      ...(fix.tags || []),
    ].filter(Boolean).join(' ').toLowerCase();

    // Simple tokenization
    const words = text.match(/\b\w{3,}\b/g) || [];
    return [...new Set(words)];
  }

  /**
   * Search for similar fixes
   */
  search(query, limit = 10) {
    const queryKeywords = query.toLowerCase().match(/\b\w{3,}\b/g) || [];
    const scores = new Map();

    for (const keyword of queryKeywords) {
      const matchingIds = this.searchIndex.get(keyword) || [];
      for (const id of matchingIds) {
        scores.set(id, (scores.get(id) || 0) + 1);
      }
    }

    // Sort by score
    const sortedIds = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);

    // Return matching fixes
    return sortedIds
      .map(id => this.fixes.find(f => f.id === id))
      .filter(Boolean);
  }

  /**
   * Find similar issues
   */
  findSimilar(issue) {
    const query = `${issue.type || ''} ${issue.category || ''} ${issue.title || ''} ${issue.description || ''}`;
    return this.search(query, 5);
  }

  /**
   * Get successful fixes for an issue type
   */
  getSuccessfulFixes(issueType) {
    return this.fixes
      .filter(f => f.issueType === issueType && f.success)
      .sort((a, b) => b.delta - a.delta);
  }

  /**
   * Get recommended approach for an issue
   */
  getRecommendedApproach(issueType) {
    const successful = this.getSuccessfulFixes(issueType);
    
    if (successful.length === 0) {
      return null;
    }

    // Count approach occurrences
    const approachCounts = {};
    for (const fix of successful) {
      if (fix.approach) {
        approachCounts[fix.approach] = (approachCounts[fix.approach] || 0) + 1;
      }
    }

    // Find most common successful approach
    const sorted = Object.entries(approachCounts).sort((a, b) => b[1] - a[1]);
    
    if (sorted.length === 0) return null;

    const [bestApproach, count] = sorted[0];
    const avgDelta = successful
      .filter(f => f.approach === bestApproach)
      .reduce((sum, f) => sum + f.delta, 0) / count;

    return {
      approach: bestApproach,
      usedCount: count,
      avgDelta: avgDelta.toFixed(1),
      confidence: Math.min(count / 5, 1), // Max confidence at 5 uses
    };
  }

  /**
   * Detect patterns from fix history
   */
  detectPatterns(fix) {
    const patternKey = `${fix.issueType}::${fix.approach}`;
    
    const existing = this.patterns.get(patternKey) || {
      issueType: fix.issueType,
      approach: fix.approach,
      attempts: 0,
      successes: 0,
      totalDelta: 0,
      lastUsed: 0,
    };

    existing.attempts++;
    if (fix.success) {
      existing.successes++;
      existing.totalDelta += fix.delta;
    }
    existing.lastUsed = Date.now();
    existing.successRate = ((existing.successes / existing.attempts) * 100).toFixed(1);
    existing.avgDelta = existing.successes > 0 
      ? (existing.totalDelta / existing.successes).toFixed(1)
      : 0;

    this.patterns.set(patternKey, existing);

    // Record insight if pattern is significant
    if (existing.attempts === 3 && parseFloat(existing.successRate) >= 66) {
      this.recordInsight({
        type: 'pattern-discovered',
        summary: `"${fix.approach}" works well for "${fix.issueType}" (${existing.successRate}% success)`,
        details: existing,
        source: 'pattern-detection',
        confidence: parseFloat(existing.successRate) / 100,
      });
    }
  }

  /**
   * Update route history
   */
  updateRouteHistory(fix) {
    const history = this.routeHistory.get(fix.routePath) || {
      routePath: fix.routePath,
      fixes: [],
      totalFixes: 0,
      successfulFixes: 0,
      lastFix: 0,
    };

    history.fixes.unshift({
      id: fix.id,
      timestamp: fix.timestamp,
      issueType: fix.issueType,
      success: fix.success,
      delta: fix.delta,
    });

    // Keep last 20 fixes per route
    if (history.fixes.length > 20) {
      history.fixes = history.fixes.slice(0, 20);
    }

    history.totalFixes++;
    if (fix.success) history.successfulFixes++;
    history.lastFix = fix.timestamp;
    history.successRate = ((history.successfulFixes / history.totalFixes) * 100).toFixed(1);

    this.routeHistory.set(fix.routePath, history);
  }

  /**
   * Get route history
   */
  getRouteHistory(routePath) {
    return this.routeHistory.get(routePath);
  }

  /**
   * Get patterns that are working
   */
  getWorkingPatterns() {
    return Array.from(this.patterns.values())
      .filter(p => p.attempts >= 2 && parseFloat(p.successRate) >= 60)
      .sort((a, b) => parseFloat(b.successRate) - parseFloat(a.successRate));
  }

  /**
   * Get patterns that are failing
   */
  getFailingPatterns() {
    return Array.from(this.patterns.values())
      .filter(p => p.attempts >= 2 && parseFloat(p.successRate) < 40)
      .sort((a, b) => parseFloat(a.successRate) - parseFloat(b.successRate));
  }

  /**
   * Get memory statistics
   */
  getStats() {
    const successfulFixes = this.fixes.filter(f => f.success);
    
    return {
      totalFixes: this.fixes.length,
      successfulFixes: successfulFixes.length,
      failedFixes: this.fixes.length - successfulFixes.length,
      successRate: this.fixes.length > 0
        ? ((successfulFixes.length / this.fixes.length) * 100).toFixed(1)
        : 100,
      avgDelta: successfulFixes.length > 0
        ? (successfulFixes.reduce((sum, f) => sum + f.delta, 0) / successfulFixes.length).toFixed(1)
        : 0,
      insights: this.insights.length,
      patterns: this.patterns.size,
      routesTracked: this.routeHistory.size,
      workingPatterns: this.getWorkingPatterns().length,
      failingPatterns: this.getFailingPatterns().length,
    };
  }

  /**
   * Get context for a new issue (combines similar fixes + patterns)
   */
  getContextForIssue(issue) {
    const similar = this.findSimilar(issue);
    const recommended = this.getRecommendedApproach(issue.type);
    const failing = this.getFailingPatterns().filter(p => p.issueType === issue.type);

    return {
      similarFixes: similar.slice(0, 3),
      recommendedApproach: recommended,
      avoidApproaches: failing.map(p => ({
        approach: p.approach,
        successRate: p.successRate,
        reason: `Only ${p.successRate}% success rate`,
      })),
      hasContext: similar.length > 0 || recommended !== null,
    };
  }
}

export default ProjectMemory;
