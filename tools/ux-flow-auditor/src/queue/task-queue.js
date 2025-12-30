/**
 * TaskQueue - Intelligent task prioritization and queue management
 * 
 * Converts analysis issues into prioritized tasks:
 * - Groups related issues
 * - Prioritizes by impact and effort
 * - Manages dependencies between tasks
 * - Tracks task status
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export class TaskQueue {
  constructor(options) {
    this.helmdevDir = options.helmdevDir;
    this.memory = options.memory;
    this.graph = options.graph;
    this.tasks = new Map();
    this.completed = new Set();
    this.skipped = new Set();
    this.queuePath = path.join(this.helmdevDir, 'queue.json');
  }

  /**
   * Populate queue from analysis results
   */
  async populateFromAnalysis(analysis) {
    const issues = analysis.issues || [];
    const routeIntelligence = analysis.route_intelligence || {};
    
    // Convert issues to tasks
    for (const issue of issues) {
      const task = this.issueToTask(issue, routeIntelligence);
      if (task && !this.completed.has(task.id) && !this.skipped.has(task.id)) {
        this.tasks.set(task.id, task);
      }
    }
    
    // Add tasks from route intelligence (missing features, etc.)
    for (const [routePath, intel] of Object.entries(routeIntelligence)) {
      // Add tasks for missing features
      for (const feature of intel.features_missing || []) {
        const task = this.createFeatureTask(routePath, feature, intel);
        if (task && !this.completed.has(task.id)) {
          this.tasks.set(task.id, task);
        }
      }
      
      // Add tasks for broken interactions
      for (const interaction of intel.interactions || []) {
        if (['broken', 'empty', 'console-only', 'placeholder'].includes(interaction.status)) {
          const task = this.createInteractionTask(routePath, interaction, intel);
          if (task && !this.completed.has(task.id)) {
            this.tasks.set(task.id, task);
          }
        }
      }
    }
    
    // Prioritize all tasks
    this.prioritizeTasks();
    
    // Save queue
    await this.saveQueue();
    
    return this;
  }

  /**
   * Convert an issue to a task
   */
  issueToTask(issue, routeIntelligence) {
    // Skip info-level issues unless they're important
    if (issue.severity === 'info' && !this.isImportantInfo(issue.type)) {
      return null;
    }
    
    const id = this.generateId(issue);
    
    // Calculate priority score
    const priorityScore = this.calculatePriority(issue);
    
    // Estimate fix time
    const estimatedTime = this.estimateFixTime(issue);
    
    // Generate fix instructions
    const fixInstructions = this.generateFixInstructions(issue);
    
    return {
      id,
      type: issue.type,
      severity: issue.severity,
      title: this.generateTitle(issue),
      description: issue.message,
      file_path: issue.file_path,
      line_number: issue.line_number || 0,
      suggestion: issue.suggestion,
      priority: priorityScore,
      estimated_time: estimatedTime,
      fix_steps: fixInstructions.steps,
      fix_code: fixInstructions.code,
      problem_explanation: fixInstructions.explanation,
      user_impact: fixInstructions.userImpact,
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Create a task for a missing feature
   */
  createFeatureTask(routePath, feature, intel) {
    const id = `feature-${routePath}-${feature}`.replace(/[^a-z0-9-]/gi, '-');
    
    const featureDescriptions = {
      'search': 'Add search functionality to filter the list',
      'filters': 'Add filter dropdowns or checkboxes',
      'pagination': 'Add pagination for large data sets',
      'loading-state': 'Add loading skeleton or spinner',
      'error-state': 'Add error state handling and display',
      'empty-state': 'Add empty state when no data exists',
      'back-navigation': 'Add back button or breadcrumb navigation',
      'breadcrumb': 'Add breadcrumb navigation',
    };
    
    return {
      id,
      type: 'missing-feature',
      severity: 'warning',
      title: `Add ${feature} to ${routePath}`,
      description: featureDescriptions[feature] || `Add ${feature} feature`,
      file_path: intel.file_path,
      line_number: 0,
      suggestion: `This ${intel.inferred_purpose} would benefit from ${feature}`,
      priority: this.featurePriority(feature),
      estimated_time: this.featureEstimate(feature),
      fix_steps: this.featureFixSteps(feature),
      problem_explanation: `The ${intel.inferred_purpose} is missing ${feature}, which users expect`,
      user_impact: `Users cannot ${this.featureUserBenefit(feature)}`,
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Create a task for a broken interaction
   */
  createInteractionTask(routePath, interaction, intel) {
    const id = `interaction-${routePath}-${interaction.type}-${interaction.line_number}`;
    
    const statusDescriptions = {
      'broken': 'This interaction is broken and does not work',
      'empty': 'This handler is empty and does nothing',
      'console-only': 'This handler only logs to console (dev-only code)',
      'placeholder': 'This is a placeholder that needs implementation',
    };
    
    return {
      id,
      type: `${interaction.status}-interaction`,
      severity: interaction.status === 'broken' ? 'error' : 'warning',
      title: `Fix ${interaction.status} ${interaction.type}: "${interaction.label}"`,
      description: statusDescriptions[interaction.status] || 'Fix this interaction',
      file_path: intel.file_path,
      line_number: interaction.line_number,
      suggestion: 'Implement the actual functionality',
      priority: interaction.status === 'broken' ? 85 : 70,
      estimated_time: '15-30 minutes',
      fix_steps: [
        `Find the ${interaction.type} at line ${interaction.line_number}`,
        'Implement the actual handler functionality',
        'Add loading state if async',
        'Add error handling',
        'Test the interaction',
      ],
      problem_explanation: `Users will click this ${interaction.type} expecting it to work`,
      user_impact: `The "${interaction.label}" ${interaction.type} does not work as expected`,
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Check if an info-level issue is important enough to fix
   */
  isImportantInfo(type) {
    const importantTypes = [
      'orphan-route',
      'dead-end',
      'minimal-content',
      'missing-loading-state',
    ];
    return importantTypes.includes(type);
  }

  /**
   * Generate a unique ID for an issue
   */
  generateId(issue) {
    const str = `${issue.type}-${issue.file_path}-${issue.line_number}-${issue.message}`;
    return crypto.createHash('md5').update(str).digest('hex').slice(0, 12);
  }

  /**
   * Generate a human-readable title
   */
  generateTitle(issue) {
    const titleMap = {
      'redirect-cycle': 'Fix circular redirect',
      'not-implemented': 'Implement missing functionality',
      'broken-link': 'Fix broken link',
      'empty-handler': 'Implement empty handler',
      'empty-catch': 'Add error handling in catch block',
      'placeholder-content': 'Replace placeholder content',
      'todo-comment': 'Complete TODO',
      'missing-loading-state': 'Add loading state',
      'console-statement': 'Remove console statement',
      'test-data': 'Replace test data',
      'commented-code': 'Remove commented code',
      'a11y-img-no-alt': 'Add alt text to image',
      'a11y-button-no-label': 'Add label to button',
      'seo-missing-metadata': 'Add page metadata',
      'ts-any-type': 'Replace any type',
      'perf-img-tag': 'Use Next.js Image component',
      'form-no-submit': 'Add form submit handler',
      'auth-missing': 'Add authentication check',
      'content-lorem': 'Replace lorem ipsum text',
      'env-localhost-url': 'Use environment variable for URL',
      'orphan-route': 'Add navigation to route',
      'dead-end': 'Add navigation from page',
    };
    
    return titleMap[issue.type] || issue.message.slice(0, 60);
  }

  /**
   * Calculate priority score (0-100)
   */
  calculatePriority(issue) {
    let score = 50; // Base score
    
    // Severity multiplier
    const severityScores = {
      'error': 30,
      'warning': 15,
      'info': 0,
    };
    score += severityScores[issue.severity] || 0;
    
    // Type-specific priority
    const typePriority = {
      'redirect-cycle': 25,
      'not-implemented': 20,
      'broken-link': 15,
      'empty-handler': 12,
      'a11y-img-no-alt': 10,
      'auth-missing': 15,
      'env-staging-url': 20,
      'empty-catch': 10,
      'form-no-submit': 10,
      'console-statement': -10,
      'commented-code': -15,
    };
    score += typePriority[issue.type] || 0;
    
    // User-facing impact boost
    const userFacingTypes = [
      'broken-link', 'placeholder-content', 'empty-handler',
      'a11y-img-no-alt', 'a11y-button-no-label', 'content-lorem',
    ];
    if (userFacingTypes.includes(issue.type)) {
      score += 10;
    }
    
    // Quick fix bonus (easier tasks get slight priority)
    const quickFixes = [
      'console-statement', 'commented-code', 'a11y-img-no-alt',
    ];
    if (quickFixes.includes(issue.type)) {
      score += 5;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Estimate fix time
   */
  estimateFixTime(issue) {
    const estimates = {
      'redirect-cycle': '30-60 minutes',
      'not-implemented': '1-2 hours',
      'broken-link': '5-15 minutes',
      'empty-handler': '15-30 minutes',
      'empty-catch': '10-20 minutes',
      'placeholder-content': '15-30 minutes',
      'todo-comment': '15-60 minutes',
      'missing-loading-state': '15-30 minutes',
      'console-statement': '2-5 minutes',
      'test-data': '10-20 minutes',
      'commented-code': '2-5 minutes',
      'a11y-img-no-alt': '2-5 minutes',
      'a11y-button-no-label': '5-10 minutes',
      'seo-missing-metadata': '10-15 minutes',
      'ts-any-type': '10-30 minutes',
      'perf-img-tag': '10-20 minutes',
      'form-no-submit': '15-30 minutes',
      'auth-missing': '30-60 minutes',
      'content-lorem': '15-30 minutes',
      'env-localhost-url': '5-10 minutes',
    };
    
    return estimates[issue.type] || '15-30 minutes';
  }

  /**
   * Generate fix instructions
   */
  generateFixInstructions(issue) {
    const instructions = {
      'console-statement': {
        steps: [
          'Remove the console.log/warn/error statement',
          'If logging is needed, use a proper logging service',
        ],
        code: '// Remove: console.log(...)',
        explanation: 'Console statements slow down production and expose debug info',
        userImpact: 'May slow down the app and leak sensitive information',
      },
      'empty-handler': {
        steps: [
          'Find the empty handler at the specified line',
          'Implement the actual functionality',
          'Add loading state if the operation is async',
          'Add error handling',
          'Show user feedback (toast notification)',
        ],
        explanation: 'Empty handlers mean buttons/actions do nothing when clicked',
        userImpact: 'Users click the button expecting action, but nothing happens',
      },
      'a11y-img-no-alt': {
        steps: [
          'Add descriptive alt text: alt="Description of image"',
          'For decorative images, use: alt=""',
        ],
        code: '<img src={src} alt="Descriptive text here" />',
        explanation: 'Screen readers cannot describe images without alt text',
        userImpact: 'Visually impaired users cannot understand the image content',
      },
      'seo-missing-metadata': {
        steps: [
          'Add metadata export to the page file',
          'Include title and description',
        ],
        code: `export const metadata = {
  title: 'Page Title | App Name',
  description: 'Page description for search engines',
}`,
        explanation: 'Without metadata, search engines cannot properly index the page',
        userImpact: 'Page may not appear correctly in search results',
      },
      'missing-loading-state': {
        steps: [
          'Create a loading.tsx file in the route directory',
          'Or add Suspense with a fallback component',
          'Or use isLoading state with a skeleton',
        ],
        code: `// loading.tsx
export default function Loading() {
  return <div className="animate-pulse">Loading...</div>
}`,
        explanation: 'Users see a blank page while data loads',
        userImpact: 'Page appears broken during loading',
      },
      'placeholder-content': {
        steps: [
          'Replace placeholder text with real content',
          'If content is unavailable, use a realistic example',
        ],
        explanation: 'Placeholder content makes the app look unfinished',
        userImpact: 'Users see unprofessional placeholder text',
      },
    };
    
    return instructions[issue.type] || {
      steps: [issue.suggestion || 'Fix the issue as described'],
      explanation: issue.message,
      userImpact: 'This issue affects user experience',
    };
  }

  /**
   * Get priority for missing features
   */
  featurePriority(feature) {
    const priorities = {
      'loading-state': 80,
      'error-state': 75,
      'empty-state': 70,
      'back-navigation': 65,
      'search': 60,
      'pagination': 55,
      'filters': 50,
      'breadcrumb': 45,
    };
    return priorities[feature] || 50;
  }

  /**
   * Get time estimate for features
   */
  featureEstimate(feature) {
    const estimates = {
      'loading-state': '15-30 minutes',
      'error-state': '20-40 minutes',
      'empty-state': '15-30 minutes',
      'back-navigation': '10-15 minutes',
      'search': '30-60 minutes',
      'pagination': '45-90 minutes',
      'filters': '30-60 minutes',
      'breadcrumb': '15-30 minutes',
    };
    return estimates[feature] || '30 minutes';
  }

  /**
   * Get fix steps for features
   */
  featureFixSteps(feature) {
    const steps = {
      'loading-state': [
        'Create loading.tsx in the route directory',
        'Add skeleton components matching the page layout',
        'Test the loading state by adding artificial delay',
      ],
      'error-state': [
        'Create error.tsx in the route directory',
        'Add user-friendly error message',
        'Include a "Try again" button that calls reset()',
      ],
      'empty-state': [
        'Check if data array is empty before mapping',
        'Add conditional render: {data.length > 0 ? ... : <EmptyState />}',
        'Create EmptyState component with helpful message and action',
      ],
      'search': [
        'Add search input with controlled state',
        'Filter data based on search query',
        'Add debounce to avoid excessive filtering',
        'Show "No results" when nothing matches',
      ],
      'pagination': [
        'Add page state and items per page constant',
        'Slice data based on current page',
        'Add Pagination component below the list',
        'Handle page changes',
      ],
    };
    return steps[feature] || ['Implement the feature'];
  }

  /**
   * Get user benefit for features
   */
  featureUserBenefit(feature) {
    const benefits = {
      'loading-state': 'see that the page is loading',
      'error-state': 'understand what went wrong',
      'empty-state': 'know there is no data yet',
      'back-navigation': 'go back to the previous page',
      'search': 'find specific items quickly',
      'pagination': 'navigate through large lists',
      'filters': 'narrow down results',
      'breadcrumb': 'understand where they are in the app',
    };
    return benefits[feature] || 'use this feature';
  }

  /**
   * Prioritize all tasks
   */
  prioritizeTasks() {
    // Sort tasks by priority score
    const sorted = Array.from(this.tasks.values())
      .sort((a, b) => b.priority - a.priority);
    
    // Rebuild map in priority order
    this.tasks.clear();
    for (const task of sorted) {
      this.tasks.set(task.id, task);
    }
  }

  /**
   * Get the next task to work on
   */
  getNextTask() {
    for (const [id, task] of this.tasks) {
      if (task.status === 'pending') {
        task.status = 'in-progress';
        task.startedAt = new Date().toISOString();
        return task;
      }
    }
    return null;
  }

  /**
   * Mark a task as complete
   */
  markComplete(taskId, success = true) {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = success ? 'completed' : 'failed';
      task.completedAt = new Date().toISOString();
      
      if (success) {
        this.completed.add(taskId);
      }
    }
    this.saveQueue();
  }

  /**
   * Skip a task
   */
  skipTask(taskId, reason) {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'skipped';
      task.skipReason = reason;
      this.skipped.add(taskId);
    }
    this.saveQueue();
  }

  /**
   * Get queue statistics
   */
  getStats() {
    const tasks = Array.from(this.tasks.values());
    
    const bySeverity = {
      error: tasks.filter(t => t.severity === 'error').length,
      warning: tasks.filter(t => t.severity === 'warning').length,
      info: tasks.filter(t => t.severity === 'info').length,
    };
    
    const byStatus = {
      pending: tasks.filter(t => t.status === 'pending').length,
      'in-progress': tasks.filter(t => t.status === 'in-progress').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      skipped: tasks.filter(t => t.status === 'skipped').length,
    };
    
    return {
      total: tasks.length,
      critical: bySeverity.error,
      high: bySeverity.warning,
      low: bySeverity.info,
      pending: byStatus.pending,
      completed: byStatus.completed,
      bySeverity,
      byStatus,
    };
  }

  /**
   * Save queue to disk
   */
  async saveQueue() {
    const data = {
      tasks: Array.from(this.tasks.entries()),
      completed: Array.from(this.completed),
      skipped: Array.from(this.skipped),
      savedAt: new Date().toISOString(),
    };
    
    await fs.writeFile(this.queuePath, JSON.stringify(data, null, 2));
  }

  /**
   * Load queue from disk
   */
  async loadQueue() {
    try {
      const data = JSON.parse(await fs.readFile(this.queuePath, 'utf8'));
      this.tasks = new Map(data.tasks);
      this.completed = new Set(data.completed);
      this.skipped = new Set(data.skipped);
    } catch {
      // Queue doesn't exist yet
    }
  }
}
