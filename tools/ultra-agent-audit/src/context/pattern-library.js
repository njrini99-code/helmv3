/**
 * PatternLibrary - Detects and tracks code patterns
 * 
 * Features:
 * - Pattern detection
 * - Convention tracking
 * - Anti-pattern warnings
 * - Best practice recommendations
 */

export class PatternLibrary {
  constructor() {
    // Known patterns
    this.patterns = {
      // UI patterns
      ui: {
        'loading-skeleton': {
          regex: /Skeleton|skeleton|shimmer/,
          description: 'Loading skeleton for perceived performance',
          quality: 'good',
        },
        'loading-spinner': {
          regex: /Spinner|spinner|loading.*spin/i,
          description: 'Loading spinner (skeletons preferred)',
          quality: 'acceptable',
        },
        'empty-state': {
          regex: /empty.*state|no.*results|EmptyState/i,
          description: 'Empty state handling',
          quality: 'required',
        },
        'error-boundary': {
          regex: /ErrorBoundary|error.*boundary/i,
          description: 'Error boundary for graceful failures',
          quality: 'good',
        },
        'glassmorphism': {
          regex: /backdrop-blur|bg-white\/[0-9]+/,
          description: 'Glass morphism effect',
          quality: 'good',
        },
      },

      // Code patterns
      code: {
        'use-client': {
          regex: /['"]use client['"]/,
          description: 'Client component directive',
          quality: 'required-for-client',
        },
        'use-server': {
          regex: /['"]use server['"]/,
          description: 'Server action directive',
          quality: 'required-for-server',
        },
        'react-query': {
          regex: /useQuery|useMutation|@tanstack\/react-query/,
          description: 'React Query for data fetching',
          quality: 'good',
        },
        'supabase-client': {
          regex: /createClient|supabase/,
          description: 'Supabase client usage',
          quality: 'good',
        },
        'typescript-strict': {
          regex: /:\s*(string|number|boolean|interface|type)\b/,
          description: 'TypeScript type annotations',
          quality: 'good',
        },
      },

      // Anti-patterns
      antiPatterns: {
        'any-type': {
          regex: /:\s*any\b/,
          description: 'Using any type defeats TypeScript',
          quality: 'bad',
        },
        'console-log': {
          regex: /console\.(log|warn|error|info)/,
          description: 'Console statements in production',
          quality: 'bad',
        },
        'inline-style': {
          regex: /style\s*=\s*\{\{/,
          description: 'Inline styles instead of Tailwind',
          quality: 'bad',
        },
        'hardcoded-color': {
          regex: /#[0-9a-fA-F]{3,6}(?!\w)/,
          description: 'Hardcoded hex colors',
          quality: 'bad',
        },
        'require-statement': {
          regex: /require\s*\(/,
          description: 'CommonJS require instead of ES imports',
          quality: 'bad',
        },
      },
    };

    // Detected instances
    this.detections = new Map();
  }

  /**
   * Analyze content for patterns
   */
  analyze(content, filePath) {
    const results = {
      filePath,
      patterns: [],
      antiPatterns: [],
      score: 100,
      timestamp: Date.now(),
    };

    // Check UI patterns
    for (const [name, pattern] of Object.entries(this.patterns.ui)) {
      if (pattern.regex.test(content)) {
        results.patterns.push({
          name,
          category: 'ui',
          ...pattern,
        });
      }
    }

    // Check code patterns
    for (const [name, pattern] of Object.entries(this.patterns.code)) {
      if (pattern.regex.test(content)) {
        results.patterns.push({
          name,
          category: 'code',
          ...pattern,
        });
      }
    }

    // Check anti-patterns
    for (const [name, pattern] of Object.entries(this.patterns.antiPatterns)) {
      const matches = content.match(new RegExp(pattern.regex, 'g'));
      if (matches) {
        results.antiPatterns.push({
          name,
          category: 'anti-pattern',
          count: matches.length,
          ...pattern,
        });
        results.score -= matches.length * 5; // Deduct 5 points per occurrence
      }
    }

    results.score = Math.max(0, results.score);

    // Store detection
    this.detections.set(filePath, results);

    return results;
  }

  /**
   * Get required patterns for a route type
   */
  getRequiredPatterns(routeType) {
    const requirements = {
      dashboard: ['loading-skeleton', 'empty-state', 'error-boundary'],
      list: ['loading-skeleton', 'empty-state', 'pagination'],
      detail: ['loading-skeleton', 'error-boundary', 'back-navigation'],
      form: ['validation', 'loading-submit', 'error-messages'],
      settings: ['save-confirmation', 'unsaved-warning'],
    };

    return requirements[routeType] || requirements.dashboard;
  }

  /**
   * Check if content has required patterns
   */
  checkRequirements(content, routeType) {
    const required = this.getRequiredPatterns(routeType);
    const missing = [];
    const found = [];

    for (const patternName of required) {
      const pattern = this.patterns.ui[patternName] || this.patterns.code[patternName];
      
      if (pattern) {
        if (pattern.regex.test(content)) {
          found.push(patternName);
        } else {
          missing.push(patternName);
        }
      } else {
        // Check by keyword
        if (content.toLowerCase().includes(patternName.replace(/-/g, ''))) {
          found.push(patternName);
        } else {
          missing.push(patternName);
        }
      }
    }

    return {
      required,
      found,
      missing,
      completeness: required.length > 0 
        ? Math.round((found.length / required.length) * 100)
        : 100,
    };
  }

  /**
   * Get pattern statistics
   */
  getStats() {
    const allDetections = Array.from(this.detections.values());
    
    const patternCounts = {};
    const antiPatternCounts = {};

    for (const detection of allDetections) {
      for (const pattern of detection.patterns) {
        patternCounts[pattern.name] = (patternCounts[pattern.name] || 0) + 1;
      }
      for (const antiPattern of detection.antiPatterns) {
        antiPatternCounts[antiPattern.name] = (antiPatternCounts[antiPattern.name] || 0) + antiPattern.count;
      }
    }

    return {
      filesAnalyzed: allDetections.length,
      averageScore: allDetections.length > 0
        ? Math.round(allDetections.reduce((sum, d) => sum + d.score, 0) / allDetections.length)
        : 100,
      patternCounts,
      antiPatternCounts,
      mostCommonPattern: Object.entries(patternCounts).sort((a, b) => b[1] - a[1])[0]?.[0],
      mostCommonAntiPattern: Object.entries(antiPatternCounts).sort((a, b) => b[1] - a[1])[0]?.[0],
    };
  }

  /**
   * Get recommendations for a file
   */
  getRecommendations(filePath) {
    const detection = this.detections.get(filePath);
    if (!detection) return [];

    const recommendations = [];

    // Recommend fixes for anti-patterns
    for (const antiPattern of detection.antiPatterns) {
      recommendations.push({
        type: 'fix',
        priority: 'high',
        pattern: antiPattern.name,
        message: `Remove ${antiPattern.count} ${antiPattern.name} occurrences`,
        description: antiPattern.description,
      });
    }

    // Recommend adding missing good patterns
    const hasLoadingState = detection.patterns.some(p => 
      p.name === 'loading-skeleton' || p.name === 'loading-spinner'
    );
    if (!hasLoadingState) {
      recommendations.push({
        type: 'add',
        priority: 'medium',
        pattern: 'loading-skeleton',
        message: 'Add loading skeleton for better perceived performance',
      });
    }

    const hasErrorHandling = detection.patterns.some(p => 
      p.name === 'error-boundary' || p.name.includes('error')
    );
    if (!hasErrorHandling) {
      recommendations.push({
        type: 'add',
        priority: 'medium',
        pattern: 'error-boundary',
        message: 'Add error boundary for graceful error handling',
      });
    }

    return recommendations;
  }
}

export default PatternLibrary;
