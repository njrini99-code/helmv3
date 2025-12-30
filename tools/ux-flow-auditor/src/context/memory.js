/**
 * ProjectMemory - Persistent memory of past fixes and learnings
 * 
 * This helps Claude Code:
 * - Know what approaches have worked before
 * - Avoid repeating mistakes
 * - Learn the project's style preferences
 * - Build on successful patterns
 */

import { promises as fs } from 'fs';
import path from 'path';

export class ProjectMemory {
  constructor(helmdevDir) {
    this.helmdevDir = helmdevDir;
    this.memoryDir = path.join(helmdevDir, 'memory');
    this.fixes = [];
    this.failures = [];
    this.insights = [];
    this.stylePreferences = {};
    this.totalFixes = 0;
  }

  /**
   * Load memory from disk
   */
  async load() {
    try {
      // Load successful fixes
      const fixesPath = path.join(this.memoryDir, 'fixes.json');
      try {
        const fixesData = await fs.readFile(fixesPath, 'utf8');
        this.fixes = JSON.parse(fixesData);
      } catch {
        this.fixes = [];
      }
      
      // Load failures
      const failuresPath = path.join(this.memoryDir, 'failures.json');
      try {
        const failuresData = await fs.readFile(failuresPath, 'utf8');
        this.failures = JSON.parse(failuresData);
      } catch {
        this.failures = [];
      }
      
      // Load insights
      const insightsPath = path.join(this.memoryDir, 'insights.json');
      try {
        const insightsData = await fs.readFile(insightsPath, 'utf8');
        this.insights = JSON.parse(insightsData);
      } catch {
        this.insights = [];
      }
      
      // Load style preferences
      const stylePath = path.join(this.memoryDir, 'style.json');
      try {
        const styleData = await fs.readFile(stylePath, 'utf8');
        this.stylePreferences = JSON.parse(styleData);
      } catch {
        this.stylePreferences = {};
      }
      
      this.totalFixes = this.fixes.length;
      
    } catch (error) {
      // Memory doesn't exist yet, that's fine
    }
  }

  /**
   * Save memory to disk
   */
  async save() {
    await fs.mkdir(this.memoryDir, { recursive: true });
    
    await fs.writeFile(
      path.join(this.memoryDir, 'fixes.json'),
      JSON.stringify(this.fixes, null, 2)
    );
    
    await fs.writeFile(
      path.join(this.memoryDir, 'failures.json'),
      JSON.stringify(this.failures, null, 2)
    );
    
    await fs.writeFile(
      path.join(this.memoryDir, 'insights.json'),
      JSON.stringify(this.insights, null, 2)
    );
    
    await fs.writeFile(
      path.join(this.memoryDir, 'style.json'),
      JSON.stringify(this.stylePreferences, null, 2)
    );
  }

  /**
   * Record a successful fix
   */
  async recordSuccess(data) {
    const record = {
      id: data.taskId,
      type: data.type,
      filePath: data.filePath,
      approach: data.approach,
      duration: data.duration,
      timestamp: new Date().toISOString(),
    };
    
    this.fixes.push(record);
    this.totalFixes++;
    
    // Keep last 100 fixes
    if (this.fixes.length > 100) {
      this.fixes = this.fixes.slice(-100);
    }
    
    // Extract insights
    this.extractInsights(record, 'success');
    
    await this.save();
  }

  /**
   * Record a failed fix
   */
  async recordFailure(data) {
    const record = {
      id: data.taskId,
      type: data.type,
      filePath: data.filePath,
      approach: data.approach,
      reason: data.reason,
      timestamp: new Date().toISOString(),
    };
    
    this.failures.push(record);
    
    // Keep last 50 failures
    if (this.failures.length > 50) {
      this.failures = this.failures.slice(-50);
    }
    
    // Extract insights
    this.extractInsights(record, 'failure');
    
    await this.save();
  }

  /**
   * Extract insights from fix records
   */
  extractInsights(record, type) {
    // Group by task type to find patterns
    const typeRecords = type === 'success' 
      ? this.fixes.filter(f => f.type === record.type)
      : this.failures.filter(f => f.type === record.type);
    
    if (typeRecords.length >= 3) {
      // Look for common approaches
      const approaches = typeRecords.map(r => r.approach).filter(Boolean);
      const approachCounts = {};
      
      for (const approach of approaches) {
        approachCounts[approach] = (approachCounts[approach] || 0) + 1;
      }
      
      // Find dominant approach
      const sortedApproaches = Object.entries(approachCounts)
        .sort((a, b) => b[1] - a[1]);
      
      if (sortedApproaches.length > 0 && sortedApproaches[0][1] >= 2) {
        const insight = type === 'success'
          ? `For "${record.type}" issues, "${sortedApproaches[0][0]}" has worked ${sortedApproaches[0][1]} times`
          : `For "${record.type}" issues, avoid "${sortedApproaches[0][0]}" - failed ${sortedApproaches[0][1]} times`;
        
        if (!this.insights.includes(insight)) {
          this.insights.push(insight);
          
          // Keep last 50 insights
          if (this.insights.length > 50) {
            this.insights = this.insights.slice(-50);
          }
        }
      }
    }
  }

  /**
   * Learn code style from codebase
   */
  async learnCodeStyle(graph) {
    const files = Array.from(graph.files.values());
    
    // Sample a few files to detect style
    const sampleFiles = files.slice(0, 20);
    
    const styleVotes = {
      quotes: { single: 0, double: 0 },
      semicolons: { yes: 0, no: 0 },
      indentation: { spaces: 0, tabs: 0 },
      indentSize: { 2: 0, 4: 0 },
      trailingCommas: { es5: 0, all: 0, none: 0 },
    };
    
    for (const file of sampleFiles) {
      const content = file.content;
      
      // Detect quote style
      const singleQuotes = (content.match(/'/g) || []).length;
      const doubleQuotes = (content.match(/"/g) || []).length;
      if (singleQuotes > doubleQuotes) {
        styleVotes.quotes.single++;
      } else if (doubleQuotes > singleQuotes) {
        styleVotes.quotes.double++;
      }
      
      // Detect semicolons
      const hasManySemis = (content.match(/;$/gm) || []).length > 5;
      if (hasManySemis) {
        styleVotes.semicolons.yes++;
      } else {
        styleVotes.semicolons.no++;
      }
      
      // Detect indentation
      const lines = content.split('\n');
      let spacesCount = 0;
      let tabsCount = 0;
      let indent2 = 0;
      let indent4 = 0;
      
      for (const line of lines.slice(0, 50)) {
        const match = line.match(/^(\s+)/);
        if (match) {
          const indent = match[1];
          if (indent.includes('\t')) {
            tabsCount++;
          } else {
            spacesCount++;
            if (indent.length % 4 === 0) indent4++;
            if (indent.length % 2 === 0) indent2++;
          }
        }
      }
      
      if (spacesCount > tabsCount) {
        styleVotes.indentation.spaces++;
      } else {
        styleVotes.indentation.tabs++;
      }
      
      if (indent4 > indent2 / 2) {
        styleVotes.indentSize[4]++;
      } else {
        styleVotes.indentSize[2]++;
      }
      
      // Detect trailing commas
      if (/,\s*\n\s*[}\]]/.test(content)) {
        styleVotes.trailingCommas.all++;
      } else if (/[^,]\s*\n\s*[}\]]/.test(content)) {
        styleVotes.trailingCommas.none++;
      } else {
        styleVotes.trailingCommas.es5++;
      }
    }
    
    // Determine winning styles
    this.stylePreferences = {
      quotes: styleVotes.quotes.single > styleVotes.quotes.double ? 'single' : 'double',
      semicolons: styleVotes.semicolons.yes > styleVotes.semicolons.no,
      indentation: styleVotes.indentation.spaces > styleVotes.indentation.tabs ? 'spaces' : 'tabs',
      indentSize: styleVotes.indentSize[2] > styleVotes.indentSize[4] ? 2 : 4,
      trailingCommas: Object.entries(styleVotes.trailingCommas)
        .sort((a, b) => b[1] - a[1])[0][0],
    };
    
    await this.save();
    
    return this.stylePreferences;
  }

  /**
   * Get context for a specific task type
   */
  getContextFor(taskType, filePath) {
    // Get successful fixes for this type
    const successfulFixes = this.fixes
      .filter(f => f.type === taskType || f.filePath?.includes(filePath?.split('/').pop()))
      .slice(-5)
      .map(f => ({
        type: f.type,
        approach: f.approach,
        duration: f.duration,
      }));
    
    // Get failures to avoid
    const failedFixes = this.failures
      .filter(f => f.type === taskType)
      .slice(-3)
      .map(f => ({
        type: f.type,
        approach: f.approach,
        reason: f.reason,
      }));
    
    // Get relevant insights
    const relevantInsights = this.insights
      .filter(i => i.toLowerCase().includes(taskType.toLowerCase()))
      .slice(-5);
    
    return {
      successfulFixes,
      failedFixes,
      insights: relevantInsights,
    };
  }

  /**
   * Get style preferences
   */
  getStylePreferences() {
    return this.stylePreferences;
  }

  /**
   * Get statistics
   */
  getStats() {
    const now = new Date();
    const today = this.fixes.filter(f => 
      new Date(f.timestamp).toDateString() === now.toDateString()
    ).length;
    
    const thisWeek = this.fixes.filter(f => {
      const fixDate = new Date(f.timestamp);
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return fixDate > weekAgo;
    }).length;
    
    // Calculate success rate
    const totalAttempts = this.fixes.length + this.failures.length;
    const successRate = totalAttempts > 0 
      ? Math.round((this.fixes.length / totalAttempts) * 100) 
      : 0;
    
    // Calculate average fix time
    const fixTimes = this.fixes
      .filter(f => f.duration)
      .map(f => f.duration);
    const avgTime = fixTimes.length > 0
      ? Math.round(fixTimes.reduce((a, b) => a + b, 0) / fixTimes.length / 1000)
      : 0;
    
    // Most common fix types
    const typeCounts = {};
    for (const fix of this.fixes) {
      typeCounts[fix.type] = (typeCounts[fix.type] || 0) + 1;
    }
    const topTypes = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    return {
      totalFixes: this.fixes.length,
      totalFailures: this.failures.length,
      fixesToday: today,
      fixesThisWeek: thisWeek,
      successRate,
      avgFixTimeSeconds: avgTime,
      topFixTypes: topTypes,
      insightsCount: this.insights.length,
    };
  }
}
