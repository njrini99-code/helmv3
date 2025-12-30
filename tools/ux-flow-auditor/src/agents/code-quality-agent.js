/**
 * CodeQualityAgent - Validates code against Helm patterns
 * 
 * Uses: CodeQualityAnalyzer from knowledge system
 * 
 * Capabilities:
 * - Type import validation (@/lib/types)
 * - Supabase client validation (server vs client)
 * - 'use client' directive checking
 * - Database table name validation
 * - Pipeline stage validation
 * - Common bug pattern detection
 * - Server action validation
 * - Hook pattern validation
 */

import { BaseAgent } from './coordination/base-agent.js';
import { CodeQualityAnalyzer } from '../knowledge/code-quality-analyzer.js';
import { promises as fs } from 'fs';
import path from 'path';
import fg from 'fast-glob';

export class CodeQualityAgent extends BaseAgent {
  constructor(config = {}) {
    super('code-quality', [
      'type-validation',
      'import-validation',
      'pattern-detection',
      'bug-detection',
      'table-validation',
      'directive-checking',
    ]);
    
    this.projectRoot = config.projectRoot;
    this.appDir = path.join(config.projectRoot || '.', 'src/app');
    this.analyzer = CodeQualityAnalyzer;
    
    // Results cache
    this.fileResults = new Map();
    this.lastFullScan = null;
  }

  async start(sharedState) {
    super.start(sharedState);
    this.log('info', 'Code Quality Agent ready');
    this.log('info', `Watching: ${this.appDir}`);
  }

  /**
   * Analyze a single file
   */
  async analyzeFile(filePath) {
    const startTime = Date.now();
    
    try {
      const absolutePath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(this.projectRoot, filePath);
      
      const content = await fs.readFile(absolutePath, 'utf8');
      const relativePath = path.relative(this.projectRoot, absolutePath);
      
      const issues = this.analyzer.validateCode(content, relativePath);
      const bySeverity = this.analyzer.getIssuesBySeverity(issues);
      
      const result = {
        file: relativePath,
        issues,
        summary: {
          total: issues.length,
          blockers: bySeverity.blockers.length,
          errors: bySeverity.errors.length,
          warnings: bySeverity.warnings.length,
          info: bySeverity.info.length,
        },
        analyzedAt: Date.now(),
        duration: Date.now() - startTime,
      };
      
      this.fileResults.set(relativePath, result);
      
      // Emit activity
      if (issues.length > 0) {
        this.emit('activity', {
          agent: this.name,
          action: 'analyzed',
          target: relativePath,
          message: `Found ${issues.length} code quality issues`,
        });
      }
      
      return result;
    } catch (error) {
      this.log('error', `Failed to analyze ${filePath}: ${error.message}`);
      return null;
    }
  }

  /**
   * Run full codebase scan
   */
  async fullScan() {
    this.log('info', 'Starting full code quality scan...');
    const startTime = Date.now();
    
    this.emit('activity', {
      agent: this.name,
      action: 'scan-start',
      message: 'Starting full codebase analysis',
    });
    
    const files = await fg(['**/*.{ts,tsx,js,jsx}'], {
      cwd: this.appDir,
      ignore: ['**/node_modules/**', '**/.next/**'],
      absolute: true,
    });
    
    const results = {
      files: [],
      summary: {
        totalFiles: files.length,
        filesWithIssues: 0,
        totalIssues: 0,
        byType: {},
        bySeverity: { blocker: 0, error: 0, warning: 0, info: 0 },
      },
      timestamp: Date.now(),
    };
    
    for (const file of files) {
      const result = await this.analyzeFile(file);
      if (result) {
        results.files.push(result);
        
        if (result.issues.length > 0) {
          results.summary.filesWithIssues++;
          results.summary.totalIssues += result.issues.length;
          
          // Count by type
          for (const issue of result.issues) {
            results.summary.byType[issue.type] = (results.summary.byType[issue.type] || 0) + 1;
            results.summary.bySeverity[issue.severity]++;
          }
        }
      }
    }
    
    results.duration = Date.now() - startTime;
    this.lastFullScan = results;
    
    this.emit('activity', {
      agent: this.name,
      action: 'scan-complete',
      target: 'coordinator',
      message: `Scanned ${files.length} files, found ${results.summary.totalIssues} issues`,
    });
    
    this.log('info', `Scan complete: ${results.summary.totalIssues} issues in ${results.duration}ms`);
    
    return results;
  }

  /**
   * Get issues for a specific route
   */
  getRouteIssues(routePath) {
    const issues = [];
    
    for (const [file, result] of this.fileResults) {
      // Check if file belongs to this route
      if (file.includes(routePath.replace(/^\//, ''))) {
        issues.push(...result.issues.map(i => ({
          ...i,
          file,
        })));
      }
    }
    
    return issues;
  }

  /**
   * Get top issues by severity
   */
  getTopIssues(limit = 10) {
    const allIssues = [];
    
    for (const [file, result] of this.fileResults) {
      for (const issue of result.issues) {
        allIssues.push({ ...issue, file });
      }
    }
    
    // Sort by severity (blocker > error > warning > info)
    const severityOrder = { blocker: 0, error: 1, warning: 2, info: 3 };
    allIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    
    return allIssues.slice(0, limit);
  }

  /**
   * Get issues grouped by type
   */
  getIssuesByType() {
    const byType = {};
    
    for (const [file, result] of this.fileResults) {
      for (const issue of result.issues) {
        if (!byType[issue.type]) {
          byType[issue.type] = [];
        }
        byType[issue.type].push({ ...issue, file });
      }
    }
    
    return byType;
  }

  /**
   * Generate fix suggestions for an issue
   */
  getFixSuggestion(issue) {
    return {
      type: issue.type,
      problem: issue.message,
      solution: issue.fix,
      file: issue.file,
      autoFixable: ['console', 'type-import', 'use-client'].includes(issue.type),
    };
  }

  /**
   * Get status summary
   */
  getStatus() {
    const lastScan = this.lastFullScan;
    
    return {
      name: this.name,
      state: this.state,
      filesAnalyzed: this.fileResults.size,
      lastScan: lastScan ? {
        timestamp: lastScan.timestamp,
        files: lastScan.summary.totalFiles,
        issues: lastScan.summary.totalIssues,
        duration: lastScan.duration,
      } : null,
      topIssueTypes: lastScan ? Object.entries(lastScan.summary.byType)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([type, count]) => ({ type, count })) : [],
    };
  }
}

export default CodeQualityAgent;
