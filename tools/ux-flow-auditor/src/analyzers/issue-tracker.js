/**
 * IssueTracker - Persistent issue tracking with status management
 * 
 * Features:
 * - Persistent storage (JSON file)
 * - Issue status (open, in-progress, fixed, ignored)
 * - History tracking
 * - Fix verification
 * - Progress over time
 */

import { promises as fs } from 'fs';
import path from 'path';

export class IssueTracker {
  constructor(helmdevDir) {
    this.helmdevDir = helmdevDir;
    this.issuesFile = path.join(helmdevDir, 'issues', 'issues.json');
    this.historyFile = path.join(helmdevDir, 'issues', 'history.json');
    this.issues = new Map();
    this.history = [];
  }

  async load() {
    try {
      await fs.mkdir(path.dirname(this.issuesFile), { recursive: true });
      
      const data = await fs.readFile(this.issuesFile, 'utf8');
      const parsed = JSON.parse(data);
      this.issues = new Map(Object.entries(parsed));
    } catch (e) {
      this.issues = new Map();
    }

    try {
      const historyData = await fs.readFile(this.historyFile, 'utf8');
      this.history = JSON.parse(historyData);
    } catch (e) {
      this.history = [];
    }
  }

  async save() {
    await fs.mkdir(path.dirname(this.issuesFile), { recursive: true });
    
    const issuesObj = Object.fromEntries(this.issues);
    await fs.writeFile(this.issuesFile, JSON.stringify(issuesObj, null, 2));
    await fs.writeFile(this.historyFile, JSON.stringify(this.history, null, 2));
  }

  /**
   * Generate unique issue ID
   */
  generateId(issue) {
    const key = `${issue.category}-${issue.title}-${issue.routePath || issue.file || 'global'}`;
    return Buffer.from(key).toString('base64').slice(0, 12);
  }

  /**
   * Add or update an issue
   */
  async upsertIssue(issue) {
    const id = issue.id || this.generateId(issue);
    const existing = this.issues.get(id);
    
    const now = Date.now();
    
    if (existing) {
      // Update existing issue
      this.issues.set(id, {
        ...existing,
        ...issue,
        id,
        updatedAt: now,
        seenCount: (existing.seenCount || 1) + 1,
        lastSeen: now,
      });
    } else {
      // New issue
      this.issues.set(id, {
        ...issue,
        id,
        status: 'open',
        createdAt: now,
        updatedAt: now,
        seenCount: 1,
        lastSeen: now,
      });
      
      this.addHistoryEntry('created', id, issue.title);
    }
    
    await this.save();
    return id;
  }

  /**
   * Bulk add issues from a scan
   */
  async addFromScan(scanResults, routePath) {
    const addedIds = [];
    
    for (const issue of scanResults) {
      const id = await this.upsertIssue({
        ...issue,
        routePath,
        source: issue.source || 'scan',
      });
      addedIds.push(id);
    }
    
    // Mark issues not seen in this scan as potentially fixed
    for (const [id, issue] of this.issues) {
      if (issue.routePath === routePath && !addedIds.includes(id)) {
        if (issue.status === 'open') {
          await this.markAsFixed(id, 'Auto-detected: not found in latest scan');
        }
      }
    }
    
    return addedIds;
  }

  /**
   * Update issue status
   */
  async updateStatus(id, status, note = '') {
    const issue = this.issues.get(id);
    if (!issue) return false;
    
    const oldStatus = issue.status;
    issue.status = status;
    issue.updatedAt = Date.now();
    
    if (note) {
      issue.notes = issue.notes || [];
      issue.notes.push({ text: note, timestamp: Date.now() });
    }
    
    this.addHistoryEntry('status-change', id, `${oldStatus} → ${status}`);
    await this.save();
    return true;
  }

  /**
   * Mark issue as fixed
   */
  async markAsFixed(id, note = '') {
    const issue = this.issues.get(id);
    if (!issue) return false;
    
    issue.status = 'fixed';
    issue.fixedAt = Date.now();
    issue.updatedAt = Date.now();
    
    this.addHistoryEntry('fixed', id, issue.title);
    await this.save();
    return true;
  }

  /**
   * Mark issue as ignored
   */
  async markAsIgnored(id, reason = '') {
    const issue = this.issues.get(id);
    if (!issue) return false;
    
    issue.status = 'ignored';
    issue.ignoreReason = reason;
    issue.updatedAt = Date.now();
    
    this.addHistoryEntry('ignored', id, reason);
    await this.save();
    return true;
  }

  /**
   * Verify if an issue is actually fixed
   */
  async verifyFix(id, verifyFn) {
    const issue = this.issues.get(id);
    if (!issue) return { verified: false, error: 'Issue not found' };
    
    try {
      const stillExists = await verifyFn(issue);
      
      if (stillExists) {
        // Not actually fixed, reopen
        issue.status = 'open';
        issue.updatedAt = Date.now();
        this.addHistoryEntry('reopened', id, 'Verification failed');
        await this.save();
        return { verified: false, reopened: true };
      } else {
        // Confirmed fixed
        if (issue.status !== 'fixed') {
          issue.status = 'fixed';
          issue.fixedAt = Date.now();
          issue.updatedAt = Date.now();
          this.addHistoryEntry('verified', id, 'Fix confirmed');
          await this.save();
        }
        return { verified: true };
      }
    } catch (error) {
      return { verified: false, error: error.message };
    }
  }

  /**
   * Add history entry
   */
  addHistoryEntry(action, issueId, details) {
    this.history.push({
      action,
      issueId,
      details,
      timestamp: Date.now(),
    });
    
    // Keep last 500 entries
    if (this.history.length > 500) {
      this.history = this.history.slice(-500);
    }
  }

  /**
   * Get all issues
   */
  getAllIssues() {
    return Array.from(this.issues.values());
  }

  /**
   * Get issues by status
   */
  getByStatus(status) {
    return this.getAllIssues().filter(i => i.status === status);
  }

  /**
   * Get issues by route
   */
  getByRoute(routePath) {
    return this.getAllIssues().filter(i => i.routePath === routePath);
  }

  /**
   * Get issues by category
   */
  getByCategory(category) {
    return this.getAllIssues().filter(i => i.category === category);
  }

  /**
   * Get statistics
   */
  getStats() {
    const all = this.getAllIssues();
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    
    const byStatus = {
      open: all.filter(i => i.status === 'open').length,
      'in-progress': all.filter(i => i.status === 'in-progress').length,
      fixed: all.filter(i => i.status === 'fixed').length,
      ignored: all.filter(i => i.status === 'ignored').length,
    };
    
    const bySeverity = {
      blocker: all.filter(i => i.severity === 'blocker' && i.status === 'open').length,
      error: all.filter(i => i.severity === 'error' && i.status === 'open').length,
      warning: all.filter(i => i.severity === 'warning' && i.status === 'open').length,
      info: all.filter(i => i.severity === 'info' && i.status === 'open').length,
    };
    
    const byCategory = {};
    all.filter(i => i.status === 'open').forEach(i => {
      byCategory[i.category] = (byCategory[i.category] || 0) + 1;
    });
    
    return {
      total: all.length,
      byStatus,
      bySeverity,
      byCategory,
      fixedToday: all.filter(i => i.fixedAt && i.fixedAt > dayAgo).length,
      fixedThisWeek: all.filter(i => i.fixedAt && i.fixedAt > weekAgo).length,
      openBlockers: byStatus.open + bySeverity.blocker,
    };
  }

  /**
   * Get progress over time
   */
  getProgressHistory() {
    const events = this.history.filter(h => h.action === 'fixed' || h.action === 'created');
    
    // Group by day
    const byDay = {};
    events.forEach(e => {
      const day = new Date(e.timestamp).toISOString().split('T')[0];
      if (!byDay[day]) byDay[day] = { created: 0, fixed: 0 };
      if (e.action === 'created') byDay[day].created++;
      if (e.action === 'fixed') byDay[day].fixed++;
    });
    
    return Object.entries(byDay)
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);
  }

  /**
   * Clear all fixed issues older than N days
   */
  async clearOldFixed(daysOld = 30) {
    const cutoff = Date.now() - daysOld * 24 * 60 * 60 * 1000;
    let cleared = 0;
    
    for (const [id, issue] of this.issues) {
      if (issue.status === 'fixed' && issue.fixedAt < cutoff) {
        this.issues.delete(id);
        cleared++;
      }
    }
    
    await this.save();
    return cleared;
  }

  /**
   * Export issues for reporting
   */
  exportForReport() {
    const open = this.getByStatus('open').sort((a, b) => {
      const severityOrder = { blocker: 0, error: 1, warning: 2, info: 3 };
      return (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99);
    });
    
    return {
      summary: this.getStats(),
      openIssues: open,
      recentlyFixed: this.getByStatus('fixed').slice(-10),
      progress: this.getProgressHistory(),
    };
  }
}

export default IssueTracker;
