/**
 * RouteFlowAnalyzer - Discovers and analyzes all routes in helmv3
 * 
 * Features:
 * - Scans src/app for all page.tsx files
 * - Detects loading, error, layout files
 * - Extracts route metadata
 * - Tracks API routes and server actions
 */

import { promises as fs } from 'fs';
import path from 'path';

export class RouteFlowAnalyzer {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.appDir = path.join(projectRoot, 'src/app');
    this.routes = new Map();
    this.apiRoutes = new Map();
    this.serverActions = new Map();
    this.layouts = new Map();
    this.analyzed = false;
  }

  /**
   * Full analysis of all routes
   */
  async analyze() {
    console.log('🔍 Analyzing routes...');
    
    this.routes.clear();
    this.apiRoutes.clear();
    this.serverActions.clear();
    this.layouts.clear();
    
    await this.scanDirectory(this.appDir, '');
    
    this.analyzed = true;
    
    console.log(`   Found ${this.routes.size} pages, ${this.apiRoutes.size} API routes, ${this.layouts.size} layouts`);
    
    return {
      routes: this.routes,
      apiRoutes: this.apiRoutes,
      serverActions: this.serverActions,
      layouts: this.layouts,
      flowGraph: this.buildFlowGraph(),
    };
  }

  /**
   * Recursively scan directory for routes
   */
  async scanDirectory(dirPath, routePath) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        // Skip hidden and node_modules
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }
        
        if (entry.isDirectory()) {
          // Handle route groups (folder)
          let newRoutePath = routePath;
          
          if (entry.name.startsWith('(') && entry.name.endsWith(')')) {
            // Route group - doesn't add to URL path
            newRoutePath = routePath;
          } else if (entry.name.startsWith('@')) {
            // Parallel route - skip for now
            continue;
          } else if (entry.name === 'api') {
            // API routes handled separately
            await this.scanApiRoutes(fullPath, '/api');
            continue;
          } else if (entry.name === 'actions') {
            // Server actions
            await this.scanServerActions(fullPath);
            continue;
          } else {
            // Regular route segment
            newRoutePath = `${routePath}/${entry.name}`;
          }
          
          await this.scanDirectory(fullPath, newRoutePath);
        } else if (entry.isFile()) {
          await this.processFile(fullPath, dirPath, routePath, entry.name);
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read
    }
  }

  /**
   * Process individual files
   */
  async processFile(filePath, dirPath, routePath, fileName) {
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);
    
    // Only process TypeScript/JavaScript files
    if (!['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
      return;
    }
    
    const finalRoute = routePath || '/';
    
    switch (baseName) {
      case 'page':
        // Main page component
        await this.addRoute(finalRoute, filePath, dirPath);
        break;
      
      case 'layout':
        // Layout component
        this.layouts.set(finalRoute, {
          filePath,
          route: finalRoute,
        });
        // Also update route if exists
        if (this.routes.has(finalRoute)) {
          this.routes.get(finalRoute).hasLayout = true;
        }
        break;
      
      case 'loading':
        // Loading state
        if (this.routes.has(finalRoute)) {
          this.routes.get(finalRoute).hasLoading = true;
          this.routes.get(finalRoute).loadingPath = filePath;
        }
        break;
      
      case 'error':
        // Error boundary
        if (this.routes.has(finalRoute)) {
          this.routes.get(finalRoute).hasError = true;
          this.routes.get(finalRoute).errorPath = filePath;
        }
        break;
      
      case 'not-found':
        // Not found page
        if (this.routes.has(finalRoute)) {
          this.routes.get(finalRoute).hasNotFound = true;
        }
        break;
    }
  }

  /**
   * Add a route to the map
   */
  async addRoute(routePath, filePath, dirPath) {
    // Check for sibling files
    const dirContents = await this.getDirectoryContents(dirPath);
    
    const routeData = {
      route: routePath,
      filePath,
      hasLayout: dirContents.includes('layout'),
      hasLoading: dirContents.includes('loading'),
      hasError: dirContents.includes('error'),
      hasNotFound: dirContents.includes('not-found'),
      metadata: await this.extractMetadata(filePath),
      domain: this.getDomain(routePath),
    };
    
    this.routes.set(routePath, routeData);
  }

  /**
   * Get directory contents (base names only)
   */
  async getDirectoryContents(dirPath) {
    try {
      const entries = await fs.readdir(dirPath);
      return entries.map(e => path.basename(e, path.extname(e)));
    } catch {
      return [];
    }
  }

  /**
   * Extract metadata from page file
   */
  async extractMetadata(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      
      const metadata = {
        hasUseClient: content.includes("'use client'") || content.includes('"use client"'),
        hasUseServer: content.includes("'use server'") || content.includes('"use server"'),
        exports: [],
        imports: [],
        hooks: [],
      };
      
      // Extract default export
      if (content.includes('export default')) {
        metadata.exports.push('default');
      }
      
      // Detect hooks used
      const hookMatches = content.matchAll(/use[A-Z][a-zA-Z]+/g);
      for (const match of hookMatches) {
        if (!metadata.hooks.includes(match[0])) {
          metadata.hooks.push(match[0]);
        }
      }
      
      return metadata;
    } catch {
      return {};
    }
  }

  /**
   * Determine domain from route
   */
  getDomain(routePath) {
    if (routePath.includes('/golf')) return 'golf';
    if (routePath.includes('/baseball')) return 'baseball';
    return 'shared';
  }

  /**
   * Scan API routes
   */
  async scanApiRoutes(dirPath, routePath) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          await this.scanApiRoutes(fullPath, `${routePath}/${entry.name}`);
        } else if (entry.name === 'route.ts' || entry.name === 'route.js') {
          const content = await fs.readFile(fullPath, 'utf8');
          
          this.apiRoutes.set(routePath, {
            filePath: fullPath,
            route: routePath,
            methods: this.extractHttpMethods(content),
          });
        }
      }
    } catch {
      // API directory doesn't exist
    }
  }

  /**
   * Extract HTTP methods from API route
   */
  extractHttpMethods(content) {
    const methods = [];
    const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    
    for (const method of httpMethods) {
      if (content.includes(`export async function ${method}`) || 
          content.includes(`export function ${method}`) ||
          content.includes(`export const ${method}`)) {
        methods.push(method);
      }
    }
    
    return methods;
  }

  /**
   * Scan server actions
   */
  async scanServerActions(dirPath) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
          const fullPath = path.join(dirPath, entry.name);
          const content = await fs.readFile(fullPath, 'utf8');
          
          if (content.includes("'use server'") || content.includes('"use server"')) {
            const actionName = path.basename(entry.name, path.extname(entry.name));
            
            this.serverActions.set(actionName, {
              filePath: fullPath,
              name: actionName,
              functions: this.extractExportedFunctions(content),
            });
          }
        }
      }
    } catch {
      // Actions directory doesn't exist
    }
  }

  /**
   * Extract exported function names
   */
  extractExportedFunctions(content) {
    const functions = [];
    const matches = content.matchAll(/export\s+(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
    
    for (const match of matches) {
      functions.push(match[1]);
    }
    
    return functions;
  }

  /**
   * Build flow graph showing route connections
   */
  buildFlowGraph() {
    const nodes = [];
    const edges = [];
    
    // Add route nodes
    for (const [routePath, data] of this.routes) {
      nodes.push({
        id: routePath,
        type: 'page',
        label: routePath,
        domain: data.domain,
        hasLayout: data.hasLayout,
        hasLoading: data.hasLoading,
        hasError: data.hasError,
      });
    }
    
    // Add API nodes
    for (const [routePath, data] of this.apiRoutes) {
      nodes.push({
        id: routePath,
        type: 'api',
        label: routePath,
        methods: data.methods,
      });
    }
    
    // Add layout relationships (edges)
    for (const [layoutPath] of this.layouts) {
      // Find all routes under this layout
      for (const [routePath] of this.routes) {
        if (routePath.startsWith(layoutPath) && routePath !== layoutPath) {
          edges.push({
            from: layoutPath,
            to: routePath,
            type: 'layout',
          });
        }
      }
    }
    
    return { nodes, edges };
  }

  /**
   * Get summary statistics
   */
  getStats() {
    return {
      totalRoutes: this.routes.size,
      apiRoutes: this.apiRoutes.size,
      serverActions: this.serverActions.size,
      layouts: this.layouts.size,
      withLoading: Array.from(this.routes.values()).filter(r => r.hasLoading).length,
      withError: Array.from(this.routes.values()).filter(r => r.hasError).length,
      domains: {
        baseball: Array.from(this.routes.values()).filter(r => r.domain === 'baseball').length,
        golf: Array.from(this.routes.values()).filter(r => r.domain === 'golf').length,
        shared: Array.from(this.routes.values()).filter(r => r.domain === 'shared').length,
      },
    };
  }
}

export default RouteFlowAnalyzer;
