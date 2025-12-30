/**
 * CodebaseGraph - Deep understanding of the entire codebase
 * 
 * Builds a complete graph of:
 * - Files and their relationships
 * - Import/export dependencies
 * - Routes and their purposes
 * - Component hierarchies
 * - Pattern detection
 */

import { promises as fs } from 'fs';
import path from 'path';
import fg from 'fast-glob';

export class CodebaseGraph {
  constructor(projectRoot, appDir) {
    this.projectRoot = projectRoot;
    this.appDir = path.join(projectRoot, appDir);
    this.files = new Map();
    this.routes = new Map();
    this.components = new Map();
    this.imports = new Map(); // file -> imported files
    this.exports = new Map(); // file -> exported names
    this.dependedOnBy = new Map(); // file -> files that import it
    this.fileCount = 0;
  }

  /**
   * Build the complete codebase graph
   */
  async build() {
    // Discover all source files
    const files = await fg(['**/*.{ts,tsx,js,jsx}'], {
      cwd: this.appDir,
      ignore: ['**/node_modules/**', '**/.next/**'],
      absolute: true,
    });
    
    this.fileCount = files.length;
    
    // Parse each file
    for (const filePath of files) {
      await this.parseFile(filePath);
    }
    
    // Build dependency graph
    this.buildDependencyGraph();
    
    // Detect routes
    this.detectRoutes();
    
    // Calculate metrics
    this.calculateMetrics();
    
    return this;
  }

  /**
   * Parse a single file
   */
  async parseFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const relativePath = path.relative(this.projectRoot, filePath);
      
      const fileNode = {
        path: relativePath,
        absolutePath: filePath,
        content,
        lines: content.split('\n').length,
        type: this.inferFileType(relativePath),
        imports: this.extractImports(content),
        exports: this.extractExports(content),
        purpose: '',
        features: [],
        patterns: [],
        complexity: this.calculateComplexity(content),
        lastModified: (await fs.stat(filePath)).mtime,
      };
      
      // Infer purpose from path and content
      fileNode.purpose = this.inferPurpose(relativePath, content);
      
      // Detect patterns used
      fileNode.patterns = this.detectPatterns(content);
      
      // Detect features
      fileNode.features = this.detectFeatures(content);
      
      this.files.set(relativePath, fileNode);
      
    } catch (error) {
      // File couldn't be parsed, skip it
    }
  }

  /**
   * Extract imports from file content
   */
  extractImports(content) {
    const imports = [];
    
    // ES6 imports
    const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]/g;
    
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push({
        source: match[1],
        line: content.substring(0, match.index).split('\n').length,
      });
    }
    
    // Dynamic imports
    const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = dynamicImportRegex.exec(content)) !== null) {
      imports.push({
        source: match[1],
        line: content.substring(0, match.index).split('\n').length,
        dynamic: true,
      });
    }
    
    return imports;
  }

  /**
   * Extract exports from file content
   */
  extractExports(content) {
    const exports = [];
    
    // Named exports
    const namedExportRegex = /export\s+(?:const|let|var|function|class|type|interface)\s+(\w+)/g;
    let match;
    while ((match = namedExportRegex.exec(content)) !== null) {
      exports.push({ name: match[1], type: 'named' });
    }
    
    // Default export
    if (/export\s+default/.test(content)) {
      exports.push({ name: 'default', type: 'default' });
    }
    
    // Re-exports
    const reExportRegex = /export\s+\{([^}]+)\}\s+from/g;
    while ((match = reExportRegex.exec(content)) !== null) {
      const names = match[1].split(',').map(n => n.trim().split(' as ')[0].trim());
      names.forEach(name => exports.push({ name, type: 'reexport' }));
    }
    
    return exports;
  }

  /**
   * Infer file type from path
   */
  inferFileType(filePath) {
    if (filePath.includes('/page.')) return 'page';
    if (filePath.includes('/layout.')) return 'layout';
    if (filePath.includes('/loading.')) return 'loading';
    if (filePath.includes('/error.')) return 'error';
    if (filePath.includes('/not-found.')) return 'not-found';
    if (filePath.includes('/components/')) return 'component';
    if (filePath.includes('/hooks/') || filePath.includes('use')) return 'hook';
    if (filePath.includes('/lib/') || filePath.includes('/utils/')) return 'utility';
    if (filePath.includes('/api/')) return 'api';
    if (filePath.includes('/types/') || filePath.endsWith('.d.ts')) return 'type';
    if (filePath.includes('/actions/')) return 'server-action';
    return 'other';
  }

  /**
   * Infer purpose from path and content
   */
  inferPurpose(filePath, content) {
    const fileName = path.basename(filePath);
    const dirName = path.dirname(filePath).split('/').pop();
    
    // Route purposes
    if (fileName.startsWith('page.')) {
      if (filePath.includes('[id]') || filePath.includes('[slug]')) {
        return 'Detail view for ' + dirName;
      }
      if (filePath.includes('/new') || filePath.includes('/create')) {
        return 'Create form for ' + dirName;
      }
      if (filePath.includes('/edit')) {
        return 'Edit form';
      }
      if (dirName === 'dashboard') {
        return 'Dashboard page';
      }
      if (dirName === 'settings') {
        return 'Settings page';
      }
      return `${dirName} page`;
    }
    
    // Component purposes
    if (content.includes('<form') || content.includes('<Form')) {
      return 'Form component';
    }
    if (content.includes('<Table') || content.includes('<DataTable')) {
      return 'Data table component';
    }
    if (content.includes('<Modal') || content.includes('<Dialog')) {
      return 'Modal/dialog component';
    }
    if (content.includes('<Chart') || content.includes('recharts')) {
      return 'Chart component';
    }
    
    // Hook purposes
    if (fileName.startsWith('use')) {
      return `Custom hook: ${fileName.replace(/\.(ts|tsx|js|jsx)$/, '')}`;
    }
    
    return 'Utility file';
  }

  /**
   * Detect patterns used in file
   */
  detectPatterns(content) {
    const patterns = [];
    
    if (/useForm|react-hook-form/.test(content)) {
      patterns.push('react-hook-form');
    }
    if (/'use server'/.test(content)) {
      patterns.push('server-action');
    }
    if (/useQuery|useSWR/.test(content)) {
      patterns.push('data-fetching-hook');
    }
    if (/async\s+function\s+\w+/.test(content) && /await/.test(content)) {
      patterns.push('async-component');
    }
    if (/<Suspense/.test(content)) {
      patterns.push('suspense');
    }
    if (/useOptimistic/.test(content)) {
      patterns.push('optimistic-update');
    }
    if (/useTransition/.test(content)) {
      patterns.push('transition');
    }
    if (/toast\.|sonner/.test(content)) {
      patterns.push('toast-notifications');
    }
    if (/zod|yup|zodResolver/.test(content)) {
      patterns.push('schema-validation');
    }
    
    return patterns;
  }

  /**
   * Detect features in file
   */
  detectFeatures(content) {
    const features = [];
    
    if (/<Table|<DataTable|<table/.test(content)) features.push('data-table');
    if (/search|query|filter/i.test(content) && /<input/.test(content)) features.push('search');
    if (/<Select|<Dropdown|<Filter/.test(content)) features.push('filters');
    if (/pagination|page|offset|limit|cursor/i.test(content)) features.push('pagination');
    if (/<form|<Form|useForm/i.test(content)) features.push('form');
    if (/<Modal|<Dialog|<Sheet|<Drawer/.test(content)) features.push('modal');
    if (/<Chart|recharts|<Bar|<Line|<Pie/.test(content)) features.push('chart');
    if (/type=['"]file|<Upload|Dropzone/i.test(content)) features.push('file-upload');
    if (/<Calendar|<DatePicker/.test(content)) features.push('calendar');
    if (/<Tabs|<TabList/.test(content)) features.push('tabs');
    if (/isLoading|loading|isPending/i.test(content)) features.push('loading-state');
    if (/error|hasError/i.test(content)) features.push('error-state');
    if (/router\.back|href=['"]\.\./.test(content)) features.push('back-navigation');
    if (/<Breadcrumb/.test(content)) features.push('breadcrumb');
    
    return features;
  }

  /**
   * Calculate code complexity
   */
  calculateComplexity(content) {
    let complexity = 1;
    
    // Count control structures
    const patterns = [
      /if\s*\(/g,
      /else\s*{/g,
      /for\s*\(/g,
      /while\s*\(/g,
      /switch\s*\(/g,
      /case\s+/g,
      /\?\s*.*\s*:/g, // ternary
      /&&/g,
      /\|\|/g,
      /catch\s*\(/g,
    ];
    
    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) complexity += matches.length;
    }
    
    return complexity;
  }

  /**
   * Build the dependency graph
   */
  buildDependencyGraph() {
    for (const [filePath, fileNode] of this.files) {
      for (const imp of fileNode.imports) {
        const resolvedPath = this.resolveImport(imp.source, filePath);
        
        if (resolvedPath && this.files.has(resolvedPath)) {
          // Track imports
          if (!this.imports.has(filePath)) {
            this.imports.set(filePath, []);
          }
          this.imports.get(filePath).push(resolvedPath);
          
          // Track reverse dependencies
          if (!this.dependedOnBy.has(resolvedPath)) {
            this.dependedOnBy.set(resolvedPath, []);
          }
          this.dependedOnBy.get(resolvedPath).push(filePath);
        }
      }
    }
  }

  /**
   * Resolve an import path to a file path
   */
  resolveImport(importPath, fromFile) {
    // Handle aliases
    if (importPath.startsWith('@/')) {
      importPath = importPath.replace('@/', 'src/');
    }
    
    // Skip external packages
    if (!importPath.startsWith('.') && !importPath.startsWith('/') && !importPath.startsWith('@/')) {
      return null;
    }
    
    // Resolve relative paths
    const fromDir = path.dirname(fromFile);
    let resolvedPath = path.join(fromDir, importPath);
    
    // Try different extensions
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
    
    for (const ext of extensions) {
      const fullPath = resolvedPath + ext;
      if (this.files.has(fullPath)) {
        return fullPath;
      }
    }
    
    return null;
  }

  /**
   * Detect routes from page files
   */
  detectRoutes() {
    for (const [filePath, fileNode] of this.files) {
      if (fileNode.type === 'page') {
        // Convert file path to route path
        let routePath = filePath
          .replace('src/app', '')
          .replace('/page.tsx', '')
          .replace('/page.ts', '')
          .replace('/page.jsx', '')
          .replace('/page.js', '');
        
        // Remove route groups
        routePath = routePath.replace(/\/\([^)]+\)/g, '');
        
        if (!routePath) routePath = '/';
        
        const routeNode = {
          path: routePath,
          filePath,
          purpose: fileNode.purpose,
          features: fileNode.features,
          patterns: fileNode.patterns,
          hasLoading: this.hasCompanionFile(filePath, 'loading'),
          hasError: this.hasCompanionFile(filePath, 'error'),
          hasLayout: this.hasCompanionFile(filePath, 'layout'),
          isDynamic: routePath.includes('['),
        };
        
        this.routes.set(routePath, routeNode);
      }
    }
  }

  /**
   * Check for companion files (loading, error, layout)
   */
  hasCompanionFile(pageFilePath, type) {
    const dir = path.dirname(pageFilePath);
    const extensions = ['ts', 'tsx', 'js', 'jsx'];
    
    for (const ext of extensions) {
      const companionPath = path.join(dir, `${type}.${ext}`);
      if (this.files.has(companionPath)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Calculate metrics
   */
  calculateMetrics() {
    this.metrics = {
      totalFiles: this.files.size,
      totalRoutes: this.routes.size,
      totalLines: Array.from(this.files.values()).reduce((sum, f) => sum + f.lines, 0),
      avgComplexity: Array.from(this.files.values()).reduce((sum, f) => sum + f.complexity, 0) / this.files.size,
      hotspots: this.findHotspots(),
    };
  }

  /**
   * Find code hotspots (most connected/complex files)
   */
  findHotspots() {
    const scores = [];
    
    for (const [filePath, fileNode] of this.files) {
      const importedBy = (this.dependedOnBy.get(filePath) || []).length;
      const imports = (this.imports.get(filePath) || []).length;
      
      const score = importedBy * 3 + imports + fileNode.complexity;
      scores.push({ path: filePath, score, importedBy, imports, complexity: fileNode.complexity });
    }
    
    return scores.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  /**
   * Get file context for a specific file
   */
  async getFileContext(filePath) {
    const fileNode = this.files.get(filePath);
    if (!fileNode) return null;
    
    const dependencies = (this.imports.get(filePath) || []).map(dep => ({
      path: dep,
      node: this.files.get(dep),
    }));
    
    const dependents = (this.dependedOnBy.get(filePath) || []).map(dep => ({
      path: dep,
      node: this.files.get(dep),
    }));
    
    const dir = path.dirname(filePath);
    const siblings = Array.from(this.files.keys())
      .filter(p => path.dirname(p) === dir && p !== filePath)
      .map(p => ({ path: p, node: this.files.get(p) }));
    
    // Get related files content
    const relatedFiles = [];
    
    for (const dep of dependencies.slice(0, 3)) {
      if (dep.node) {
        relatedFiles.push({
          path: dep.path,
          content: dep.node.content,
          relationship: 'imported by this file',
        });
      }
    }
    
    for (const dep of dependents.slice(0, 2)) {
      if (dep.node) {
        relatedFiles.push({
          path: dep.path,
          content: dep.node.content,
          relationship: 'imports this file',
        });
      }
    }
    
    return {
      path: filePath,
      content: fileNode.content,
      purpose: fileNode.purpose,
      route: this.findRouteForFile(filePath),
      patterns: fileNode.patterns,
      features: fileNode.features,
      complexity: fileNode.complexity,
      dependencies: dependencies.map(d => d.path),
      dependents: dependents.map(d => d.path),
      siblings: siblings.map(s => s.path),
      relatedFiles,
    };
  }

  /**
   * Find the route for a file
   */
  findRouteForFile(filePath) {
    for (const [routePath, routeNode] of this.routes) {
      if (routeNode.filePath === filePath) {
        return routePath;
      }
    }
    return null;
  }

  /**
   * Get codebase summary
   */
  getSummary() {
    return {
      projectRoot: this.projectRoot,
      appDir: this.appDir,
      totalFiles: this.files.size,
      totalRoutes: this.routes.size,
      totalLines: this.metrics?.totalLines || 0,
      avgComplexity: this.metrics?.avgComplexity || 0,
      hotspots: this.metrics?.hotspots || [],
      patterns: this.getUsedPatterns(),
      features: this.getUsedFeatures(),
    };
  }

  /**
   * Get all patterns used in codebase
   */
  getUsedPatterns() {
    const patterns = new Map();
    
    for (const fileNode of this.files.values()) {
      for (const pattern of fileNode.patterns) {
        patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
      }
    }
    
    return Array.from(patterns.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get all features used in codebase
   */
  getUsedFeatures() {
    const features = new Map();
    
    for (const fileNode of this.files.values()) {
      for (const feature of fileNode.features) {
        features.set(feature, (features.get(feature) || 0) + 1);
      }
    }
    
    return Array.from(features.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }
}
