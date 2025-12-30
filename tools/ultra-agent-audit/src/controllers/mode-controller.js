/**
 * ModeController - Manages Manual/Hybrid/Autonomous operation modes
 * 
 * Modes:
 * - Manual: All actions require user approval
 * - Hybrid: Low-risk actions auto-approved, high-risk need approval
 * - Autonomous: All actions auto-approved and executed
 * 
 * Features:
 * - Risk classification for actions
 * - Approval workflows
 * - Execution tracking
 * - Mode-specific behaviors
 */

import EventEmitter from 'events';

export class ModeController extends EventEmitter {
  constructor() {
    super();

    this.mode = 'manual';
    this.validModes = ['manual', 'hybrid', 'autonomous'];
    
    // Action risk classifications
    this.riskLevels = {
      // Low risk - safe to auto-approve in hybrid mode
      low: [
        'analyze',
        'scan',
        'capture',
        'report',
        'validate',
        'check',
        'read',
        'list',
        'get',
        'fetch',
      ],
      // Medium risk - require approval in hybrid mode
      medium: [
        'update',
        'modify',
        'change',
        'edit',
        'create',
        'add',
        'remove',
      ],
      // High risk - always require approval
      high: [
        'delete',
        'deploy',
        'publish',
        'reset',
        'clear',
        'destroy',
        'execute',
        'run',
      ],
    };

    // Execution history
    this.history = [];
    this.maxHistory = 100;

    // Statistics
    this.stats = {
      totalActions: 0,
      approved: 0,
      rejected: 0,
      autoApproved: 0,
      byMode: {
        manual: { total: 0, approved: 0 },
        hybrid: { total: 0, approved: 0 },
        autonomous: { total: 0, approved: 0 },
      },
    };
  }

  /**
   * Set operation mode
   */
  setMode(mode) {
    if (!this.validModes.includes(mode)) {
      throw new Error(`Invalid mode: ${mode}. Valid modes: ${this.validModes.join(', ')}`);
    }

    const previousMode = this.mode;
    this.mode = mode;

    this.emit('mode:changed', {
      from: previousMode,
      to: mode,
      timestamp: Date.now(),
    });

    return {
      previousMode,
      currentMode: mode,
      description: this.getModeDescription(mode),
    };
  }

  /**
   * Get current mode
   */
  getMode() {
    return this.mode;
  }

  /**
   * Get mode description
   */
  getModeDescription(mode) {
    const descriptions = {
      manual: 'All actions require user approval before execution',
      hybrid: 'Low-risk actions auto-execute, high-risk require approval',
      autonomous: 'All actions execute automatically without approval',
    };
    return descriptions[mode] || 'Unknown mode';
  }

  /**
   * Classify action risk level
   */
  classifyRisk(action) {
    const actionLower = action.toLowerCase();

    for (const keyword of this.riskLevels.high) {
      if (actionLower.includes(keyword)) {
        return 'high';
      }
    }

    for (const keyword of this.riskLevels.medium) {
      if (actionLower.includes(keyword)) {
        return 'medium';
      }
    }

    for (const keyword of this.riskLevels.low) {
      if (actionLower.includes(keyword)) {
        return 'low';
      }
    }

    return 'medium'; // Default to medium if unknown
  }

  /**
   * Check if action should auto-approve
   */
  shouldAutoApprove(action) {
    const risk = this.classifyRisk(action);

    switch (this.mode) {
      case 'manual':
        return false; // Never auto-approve in manual mode
      
      case 'hybrid':
        return risk === 'low'; // Only auto-approve low-risk in hybrid
      
      case 'autonomous':
        return true; // Always auto-approve in autonomous
      
      default:
        return false;
    }
  }

  /**
   * Request approval for an action
   */
  async requestApproval(action, context = {}) {
    const risk = this.classifyRisk(action);
    const shouldAuto = this.shouldAutoApprove(action);

    this.stats.totalActions++;
    this.stats.byMode[this.mode].total++;

    const request = {
      id: `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      action,
      risk,
      context,
      mode: this.mode,
      timestamp: Date.now(),
      status: 'pending',
    };

    // Auto-approve if allowed
    if (shouldAuto) {
      request.status = 'approved';
      request.autoApproved = true;
      this.stats.autoApproved++;
      this.stats.approved++;
      this.stats.byMode[this.mode].approved++;

      this.recordHistory(request);

      this.emit('action:auto-approved', request);
      return { approved: true, request };
    }

    // Emit for manual approval
    this.emit('action:pending', request);

    return new Promise((resolve) => {
      // Store resolver for later
      request.resolve = resolve;
      this.pendingApprovals = this.pendingApprovals || new Map();
      this.pendingApprovals.set(request.id, request);
    });
  }

  /**
   * Approve a pending action
   */
  approve(requestId, notes = '') {
    const request = this.pendingApprovals?.get(requestId);
    if (!request) {
      return { error: 'Request not found' };
    }

    request.status = 'approved';
    request.approvalNotes = notes;
    request.approvedAt = Date.now();

    this.stats.approved++;
    this.stats.byMode[this.mode].approved++;

    this.recordHistory(request);
    this.pendingApprovals.delete(requestId);

    this.emit('action:approved', request);

    if (request.resolve) {
      request.resolve({ approved: true, request });
    }

    return request;
  }

  /**
   * Reject a pending action
   */
  reject(requestId, reason = '') {
    const request = this.pendingApprovals?.get(requestId);
    if (!request) {
      return { error: 'Request not found' };
    }

    request.status = 'rejected';
    request.rejectionReason = reason;
    request.rejectedAt = Date.now();

    this.stats.rejected++;

    this.recordHistory(request);
    this.pendingApprovals.delete(requestId);

    this.emit('action:rejected', request);

    if (request.resolve) {
      request.resolve({ approved: false, request });
    }

    return request;
  }

  /**
   * Get pending approvals
   */
  getPendingApprovals() {
    return Array.from(this.pendingApprovals?.values() || []);
  }

  /**
   * Record action in history
   */
  recordHistory(request) {
    this.history.unshift({
      id: request.id,
      action: request.action,
      risk: request.risk,
      status: request.status,
      mode: request.mode,
      autoApproved: request.autoApproved || false,
      timestamp: request.timestamp,
      duration: Date.now() - request.timestamp,
    });

    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(0, this.maxHistory);
    }
  }

  /**
   * Get execution history
   */
  getHistory(limit = 20) {
    return this.history.slice(0, limit);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      currentMode: this.mode,
      modeDescription: this.getModeDescription(this.mode),
      pendingCount: this.pendingApprovals?.size || 0,
      successRate: this.stats.totalActions > 0
        ? ((this.stats.approved / this.stats.totalActions) * 100).toFixed(1)
        : 100,
    };
  }

  /**
   * Get mode configurations
   */
  getModeConfigs() {
    return {
      manual: {
        name: 'Manual',
        icon: '🎮',
        description: 'Full control - approve every action',
        riskAuto: [],
        color: '#6366f1',
      },
      hybrid: {
        name: 'Hybrid',
        icon: '⚡',
        description: 'Smart balance - auto-approve safe actions',
        riskAuto: ['low'],
        color: '#f59e0b',
      },
      autonomous: {
        name: 'Autonomous',
        icon: '🚀',
        description: 'Full speed - auto-approve all actions',
        riskAuto: ['low', 'medium', 'high'],
        color: '#10b981',
      },
    };
  }
}

export default ModeController;
