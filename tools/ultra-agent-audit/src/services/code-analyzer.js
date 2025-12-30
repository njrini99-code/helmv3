/**
 * CodeAnalyzer - Analyze route code without screenshots
 * Extracts structure, patterns, and issues from source files
 */

import { promises as fs } from 'fs';
import path from 'path';

export class CodeAnalyzer {
  constructor(appDir) {
    this.appDir = appDir;
  }

  /**
   * Analyze a single route
   */
  async analyzeRoute(routePath, filePath) {
    try {
      const code = await fs.readFile(filePath, 'utf8');
      const dir = path.dirname(filePath);
      const siblings = await this.getSiblingFiles(dir);
      
      return {
        route: routePath,
        filePath,
        
        // Basic info
        lines: code.split('\n').length,
        size: code.length,
        
        // Structure
        structure: {
          isClientComponent: code.includes("'use client'"),
          isAsyncComponent: code.includes('async function') || code.includes('async ('),
          hasMetadata: code.includes('export const metadata') || code.includes('generateMetadata'),
          hasLoading: siblings.some(f => f.startsWith('loading.')),
          hasError: siblings.some(f => f.startsWith('error.')),
          hasLayout: siblings.some(f => f.startsWith('layout.')),
          imports: this.extractImports(code),
          exports: this.extractExports(code),
        },
        
        // Patterns
        patterns: this.detectPatterns(code),
        
        // Issues
        issues: this.findIssues(code, routePath),
        
        // Summary
        summary: this.generateSummary(code, routePath, siblings),
        
        analyzedAt: Date.now(),
      };
    } catch (error) {
      return {
        route: routePath,
        filePath,
        error: error.message,
        analyzedAt: Date.now(),
      };
    }
  }

  async getSiblingFiles(dir) {
    try {
      const entries = await fs.readdir(dir);
      return entries;
    } catch {
      return [];
    }
  }

  extractImports(code) {
    const imports = [];
    const regex = /import\s+(?:{([^}]+)}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
    
    let match;
    while ((match = regex.exec(code)) !== null) {
      imports.push({
        names: (match[1] || match[2] || '').split(',').map(s => s.trim()),
        source: match[3],
        isRelative: match[3].startsWith('.'),
        isInternal: match[3].startsWith('@/'),
        isComponent: /^[A-Z]/.test(match[1] || match[2] || ''),
      });
    }
    
    return imports;
  }

  extractExports(code) {
    const exports = [];
    
    // Default export
    if (code.includes('export default')) {
      const match = code.match(/export default (?:async )?function (\w+)/);
      exports.push({ type: 'default', name: match?.[1] || 'Component' });
    }
    
    // Named exports
    const namedRegex = /export (?:const|function|async function) (\w+)/g;
    let match;
    while ((match = namedRegex.exec(code)) !== null) {
      exports.push({ type: 'named', name: match[1] });
    }
    
    // Metadata
    if (code.includes('export const metadata')) {
      exports.push({ type: 'metadata', name: 'metadata' });
    }
    if (code.includes('export async function generateMetadata')) {
      exports.push({ type: 'metadata', name: 'generateMetadata' });
    }
    
    return exports;
  }

  detectPatterns(code) {
    return {
      // State management
      usesUseState: code.includes('useState'),
      usesUseEffect: code.includes('useEffect'),
      usesUseQuery: code.includes('useQuery'),
      usesUseMutation: code.includes('useMutation'),
      
      // Data fetching
      usesFetch: code.includes('fetch('),
      usesSupabase: code.includes('supabase'),
      usesServerAction: code.includes("'use server'"),
      
      // UI patterns
      usesForm: code.includes('useForm') || code.includes('<form'),
      usesModal: code.includes('Dialog') || code.includes('Modal'),
      usesTable: code.includes('Table') || code.includes('<table'),
      usesSkeleton: code.includes('Skeleton') || code.includes('animate-pulse'),
      
      // Design system
      usesTailwind: code.includes('className='),
      usesGlassmorphism: code.includes('backdrop-blur') || code.includes('bg-opacity'),
      usesGradient: code.includes('bg-gradient'),
      
      // Accessibility
      hasAriaLabels: code.includes('aria-'),
      hasRoles: code.includes('role='),
    };
  }

  findIssues(code, routePath) {
    const issues = [];
    
    // Console statements
    const consoleMatches = code.match(/console\.(log|warn|error|debug)\(/g);
    if (consoleMatches) {
      issues.push({
        id: `${routePath}-console`,
        type: 'quality',
        severity: 'low',
        title: 'Console statements found',
        description: `Found ${consoleMatches.length} console statement(s)`,
        count: consoleMatches.length,
        autoFixable: true,
      });
    }
    
    // Any types
    const anyMatches = code.match(/:\s*any\b/g);
    if (anyMatches) {
      issues.push({
        id: `${routePath}-any`,
        type: 'typescript',
        severity: 'medium',
        title: 'TypeScript any types',
        description: `Found ${anyMatches.length} any type(s)`,
        count: anyMatches.length,
      });
    }
    
    // Non-standard spacing
    const spacingMatches = code.match(/(?:p|m|gap)-(?:1|2|3|5|6|7|9|10|11|13|14|15)\b/g);
    if (spacingMatches) {
      issues.push({
        id: `${routePath}-spacing`,
        type: 'design',
        severity: 'low',
        title: 'Non-standard spacing',
        description: `Found ${spacingMatches.length} non-standard spacing value(s)`,
        count: spacingMatches.length,
      });
    }
    
    // Hardcoded colors
    const colorMatches = code.match(/#[0-9a-f]{3,6}\b/gi);
    if (colorMatches && colorMatches.length > 3) {
      issues.push({
        id: `${routePath}-colors`,
        type: 'design',
        severity: 'low',
        title: 'Hardcoded colors',
        description: `Found ${colorMatches.length} hardcoded color(s)`,
        count: colorMatches.length,
      });
    }
    
    // Missing error handling
    if (code.includes('fetch(') && !code.includes('.catch') && !code.includes('try {')) {
      issues.push({
        id: `${routePath}-error-handling`,
        type: 'reliability',
        severity: 'medium',
        title: 'Missing error handling',
        description: 'Fetch calls without error handling',
      });
    }
    
    // TODO comments
    const todoMatches = code.match(/\/\/\s*TODO|\/\*\s*TODO/gi);
    if (todoMatches) {
      issues.push({
        id: `${routePath}-todos`,
        type: 'quality',
        severity: 'info',
        title: 'TODO comments',
        description: `Found ${todoMatches.length} TODO comment(s)`,
        count: todoMatches.length,
      });
    }

    // Missing loading state (for client components)
    if (code.includes("'use client'") && !code.includes('loading') && !code.includes('isLoading') && !code.includes('Skeleton')) {
      issues.push({
        id: `${routePath}-loading`,
        type: 'ux',
        severity: 'medium',
        title: 'Missing loading state',
        description: 'Client component without loading indicator',
      });
    }

    // Empty click handlers
    if (code.includes('onClick={() => {}}') || code.includes('onClick={() => null}')) {
      issues.push({
        id: `${routePath}-empty-handler`,
        type: 'quality',
        severity: 'medium',
        title: 'Empty click handler',
        description: 'Button or element with empty onClick handler',
      });
    }
    
    return issues;
  }

  generateSummary(code, routePath, siblings) {
    const lines = code.split('\n').length;
    const isClient = code.includes("'use client'");
    const hasMetadata = code.includes('metadata');
    
    const parts = [];
    
    // Component type
    if (isClient) {
      parts.push('Client component');
    } else {
      parts.push('Server component');
    }
    
    // Size
    if (lines < 50) parts.push('(small,');
    else if (lines < 150) parts.push('(medium,');
    else parts.push('(large,');
    
    parts.push(`${lines} lines)`);
    
    // Features
    const features = [];
    if (hasMetadata) features.push('SEO');
    if (siblings.some(f => f.startsWith('loading.'))) features.push('loading state');
    if (siblings.some(f => f.startsWith('error.'))) features.push('error boundary');
    if (code.includes('useForm')) features.push('form');
    if (code.includes('Table')) features.push('table');
    
    if (features.length > 0) {
      parts.push(`with ${features.join(', ')}`);
    }
    
    return parts.join(' ');
  }

  /**
   * Analyze all routes in the app directory
   */
  async analyzeAllRoutes(onProgress) {
    const results = new Map();
    let count = 0;
    
    const scan = async (dir, routePath = '') => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            // Calculate child route path
            let childRoute = routePath;
            if (!entry.name.startsWith('(') && !entry.name.startsWith('_')) {
              childRoute = `${routePath}/${entry.name}`;
            }
            await scan(fullPath, childRoute);
          } else if (entry.name === 'page.tsx' || entry.name === 'page.js') {
            const route = routePath || '/';
            const analysis = await this.analyzeRoute(route, fullPath);
            results.set(route, analysis);
            count++;
            
            if (onProgress) {
              onProgress({ route, count, analysis });
            }
          }
        }
      } catch (error) {
        console.error(`Error scanning ${dir}:`, error.message);
      }
    };
    
    await scan(this.appDir);
    return results;
  }
}

export default CodeAnalyzer;
