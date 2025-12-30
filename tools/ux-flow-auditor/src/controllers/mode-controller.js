/**
 * ModeController - Manages Manual vs Autonomous operation modes
 * 
 * Modes:
 * - Manual: User approves every fix
 * - Autonomous: Auto-fix issues above confidence threshold
 * - Hybrid: Auto-fix simple issues, require approval for complex
 */

import EventEmitter from 'events';

export class ModeController extends EventEmitter {
  constructor(config) {
    super();
    
    this.projectRoot = config.projectRoot;
    this.codebaseGraph = config.codebaseGraph;
    this.memory = config.memory;
    this.agentCoordinator = config.agentCoordinator;
    
    // Current mode
    this.mode = 'manual';
    
    // Mode configurations
    this.modeConfig = {
      manual: {
        requireApproval: true,
        autoFixTypes: [],
      },
      autonomous: {
        requireApproval: false,
        confidenceThreshold: 0.8,
        maxAutoFixesPerRun: 10,
        autoFixTypes: [
          'console-statement',
          'ts-ignore-comment',
          'a11y-img-alt',
          'empty-handler-simple',
        ],
        requireVerification: true,
        pauseOnError: true,
      },
      hybrid: {
        requireApproval: true,
        autoApproveSimple: true,
        simpleThreshold: 0.9,
        simpleTypes: [
          'console-statement',
          'ts-ignore-comment',
        ],
      },
    };
    
    // Session state
    this.selectedIssues = new Set();
    this.fixQueue = [];
    this.fixHistory = [];
    this.currentRun = null;
  }

  /**
   * Set the operation mode
   */
  setMode(mode) {
    if (!this.modeConfig[mode]) {
      throw new Error(`Invalid mode: ${mode}`);
    }
    
    const previousMode = this.mode;
    this.mode = mode;
    
    this.emit('mode:changed', {
      from: previousMode,
      to: mode,
      config: this.modeConfig[mode],
    });
    
    console.log(`🔄 Mode changed: ${previousMode} → ${mode}`);
    
    return this.modeConfig[mode];
  }

  /**
   * Get current mode and config
   */
  getMode() {
    return {
      mode: this.mode,
      config: this.modeConfig[this.mode],
    };
  }

  /**
   * Select issues for fixing (manual mode)
   */
  selectIssues(issueIds) {
    for (const id of issueIds) {
      this.selectedIssues.add(id);
    }
    
    this.emit('issues:selected', {
      selected: Array.from(this.selectedIssues),
      count: this.selectedIssues.size,
    });
    
    return this.selectedIssues.size;
  }

  /**
   * Deselect issues
   */
  deselectIssues(issueIds) {
    for (const id of issueIds) {
      this.selectedIssues.delete(id);
    }
    
    this.emit('issues:deselected', {
      selected: Array.from(this.selectedIssues),
      count: this.selectedIssues.size,
    });
    
    return this.selectedIssues.size;
  }

  /**
   * Clear all selections
   */
  clearSelections() {
    this.selectedIssues.clear();
    this.emit('issues:cleared', { count: 0 });
  }

  /**
   * Get selected issues
   */
  getSelectedIssues() {
    return Array.from(this.selectedIssues);
  }

  /**
   * Check if an issue should be auto-fixed
   */
  shouldAutoFix(issue, confidence = 0.5) {
    const config = this.modeConfig[this.mode];
    
    if (this.mode === 'manual') {
      return false;
    }
    
    if (this.mode === 'autonomous') {
      // Check confidence threshold
      if (confidence < config.confidenceThreshold) {
        return false;
      }
      
      // Check if type is auto-fixable
      if (config.autoFixTypes.length > 0) {
        return config.autoFixTypes.some(type => 
          issue.type?.includes(type) || issue.category === type
        );
      }
      
      return true;
    }
    
    if (this.mode === 'hybrid') {
      // Only auto-fix simple types with high confidence
      if (confidence >= config.simpleThreshold) {
        return config.simpleTypes.some(type =>
          issue.type?.includes(type) || issue.category === type
        );
      }
      
      return false;
    }
    
    return false;
  }

  /**
   * Queue an issue for fixing
   */
  queueFix(issue, prompt, context = {}) {
    const queueItem = {
      id: `fix-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      issue,
      prompt,
      context,
      status: 'queued',
      queuedAt: Date.now(),
      autoApproved: this.shouldAutoFix(issue, context.confidence),
    };
    
    this.fixQueue.push(queueItem);
    
    this.emit('fix:queued', queueItem);
    
    return queueItem;
  }

  /**
   * Approve a fix (manual mode)
   */
  approveFix(fixId) {
    const fix = this.fixQueue.find(f => f.id === fixId);
    
    if (!fix) {
      throw new Error(`Fix not found: ${fixId}`);
    }
    
    fix.status = 'approved';
    fix.approvedAt = Date.now();
    
    this.emit('fix:approved', fix);
    
    return fix;
  }

  /**
   * Reject a fix
   */
  rejectFix(fixId, reason = '') {
    const fix = this.fixQueue.find(f => f.id === fixId);
    
    if (!fix) {
      throw new Error(`Fix not found: ${fixId}`);
    }
    
    fix.status = 'rejected';
    fix.rejectedAt = Date.now();
    fix.rejectionReason = reason;
    
    this.emit('fix:rejected', fix);
    
    return fix;
  }

  /**
   * Get pending fixes
   */
  getPendingFixes() {
    return this.fixQueue.filter(f => f.status === 'queued' || f.status === 'approved');
  }

  /**
   * Get approved fixes ready for execution
   */
  getApprovedFixes() {
    return this.fixQueue.filter(f => f.status === 'approved' || f.autoApproved);
  }

  /**
   * Mark fix as started
   */
  startFix(fixId) {
    const fix = this.fixQueue.find(f => f.id === fixId);
    
    if (!fix) {
      throw new Error(`Fix not found: ${fixId}`);
    }
    
    fix.status = 'in-progress';
    fix.startedAt = Date.now();
    
    this.emit('fix:started', fix);
    
    return fix;
  }

  /**
   * Mark fix as completed
   */
  completeFix(fixId, success, result = {}) {
    const fix = this.fixQueue.find(f => f.id === fixId);
    
    if (!fix) {
      throw new Error(`Fix not found: ${fixId}`);
    }
    
    fix.status = success ? 'completed' : 'failed';
    fix.completedAt = Date.now();
    fix.duration = fix.completedAt - fix.startedAt;
    fix.result = result;
    fix.success = success;
    
    // Move to history
    this.fixHistory.push(fix);
    this.fixQueue = this.fixQueue.filter(f => f.id !== fixId);
    
    this.emit(success ? 'fix:completed' : 'fix:failed', fix);
    
    return fix;
  }

  /**
   * Run autonomous fixes
   */
  async runAutonomousFixes(issues, applyFn) {
    if (this.mode !== 'autonomous') {
      throw new Error('Must be in autonomous mode to run auto-fixes');
    }
    
    const config = this.modeConfig.autonomous;
    
    this.currentRun = {
      id: `run-${Date.now()}`,
      startedAt: Date.now(),
      totalIssues: issues.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    };
    
    this.emit('autonomous:started', this.currentRun);
    
    const fixableIssues = issues.filter(issue => 
      this.shouldAutoFix(issue, issue.confidence || 0.8)
    ).slice(0, config.maxAutoFixesPerRun);
    
    for (const issue of fixableIssues) {
      try {
        this.emit('autonomous:fixing', { issue, run: this.currentRun });
        
        const result = await applyFn(issue);
        
        if (result.success) {
          this.currentRun.succeeded++;
          
          // Verify if required
          if (config.requireVerification) {
            // Verification would happen here
          }
        } else {
          this.currentRun.failed++;
          
          if (config.pauseOnError) {
            this.emit('autonomous:paused', {
              reason: 'Fix failed',
              issue,
              error: result.error,
              run: this.currentRun,
            });
            break;
          }
        }
        
      } catch (error) {
        this.currentRun.failed++;
        
        if (config.pauseOnError) {
          this.emit('autonomous:paused', {
            reason: 'Exception',
            issue,
            error: error.message,
            run: this.currentRun,
          });
          break;
        }
      }
      
      this.currentRun.processed++;
    }
    
    this.currentRun.skipped = issues.length - fixableIssues.length;
    this.currentRun.completedAt = Date.now();
    this.currentRun.duration = this.currentRun.completedAt - this.currentRun.startedAt;
    
    this.emit('autonomous:completed', this.currentRun);
    
    const run = this.currentRun;
    this.currentRun = null;
    
    return run;
  }

  /**
   * Get fix history
   */
  getHistory(limit = 50) {
    return this.fixHistory.slice(-limit);
  }

  /**
   * Get statistics
   */
  getStats() {
    const successfulFixes = this.fixHistory.filter(f => f.success);
    const failedFixes = this.fixHistory.filter(f => !f.success);
    
    return {
      mode: this.mode,
      selectedIssues: this.selectedIssues.size,
      queuedFixes: this.fixQueue.length,
      pendingApproval: this.fixQueue.filter(f => f.status === 'queued' && !f.autoApproved).length,
      totalCompleted: this.fixHistory.length,
      successRate: this.fixHistory.length > 0 
        ? (successfulFixes.length / this.fixHistory.length * 100).toFixed(1)
        : 0,
      avgDuration: successfulFixes.length > 0
        ? Math.round(successfulFixes.reduce((sum, f) => sum + (f.duration || 0), 0) / successfulFixes.length)
        : 0,
      currentRun: this.currentRun,
    };
  }

  /**
   * Update mode configuration
   */
  updateConfig(mode, updates) {
    if (!this.modeConfig[mode]) {
      throw new Error(`Invalid mode: ${mode}`);
    }
    
    this.modeConfig[mode] = {
      ...this.modeConfig[mode],
      ...updates,
    };
    
    this.emit('config:updated', {
      mode,
      config: this.modeConfig[mode],
    });
    
    return this.modeConfig[mode];
  }
}

export default ModeController;
