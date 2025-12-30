/**
 * CodebaseGraph - Scans and maps the entire codebase
 * 
 * Features:
 * - Discovers all routes with their content
 * - Maps components
 * - Tracks file metadata
 * - Robust error handling
 */

import { promises as fs } from 'fs';
import path from 'path';

export class CodebaseGraph {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.routes = new Map();
    this.components = new Map();
    this.layouts = new Map();
    this.lastScan = null;
  }

  /**
   * Scan the codebase
   */
  async scan() {
    const startTime = Date.now();
    
    console.log(`   Project root: ${this.projectRoot}`);

    // Find app directory (Next.js 13+ app router)
    const appDir = path.join(this.projectRoot, 'src', 'app');
    const appDirExists = await this.exists(appDir);
    
    if (!appDirExists) {
      console.log(`   ⚠️ App directory not found at ${appDir}`);
      return { routeCount: 0, componentCount: 0 };
    }

    // Scan routes
    await this.scanRoutes(appDir);
    console.log(`   📄 Found ${this.routes.size} routes`);

    // Scan components
    const componentsDir = path.join(this.projectRoot, 'src', 'components');
    if (await this.exists(componentsDir)) {
      await this.scanComponents(componentsDir);
      console.log(`   🧩 Found ${this.components.size} components`);
    }

    this.lastScan = {
      timestamp: Date.now(),
      duration: Date.now() - startTime,
      routeCount: this.routes.size,
      componentCount: this.components.size,
    };

    return this.lastScan;
  }

  /**
   * Check if path exists
   */
  async exists(filepath) {
    try {
      await fs.access(filepath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Scan for routes recursively
   */
  async scanRoutes(dir, basePath = '') {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Skip hidden directories and node_modules
          if (entry.name.startsWith('.') || entry.name === 'node_modules') {
            continue;
          }
          
          // Handle route groups (parentheses) - they don't add to URL
          let segment = entry.name;
          if (segment.startsWith('(') && segment.endsWith(')')) {
            segment = '';
          }
          
          // Handle dynamic routes [param]
          if (segment.startsWith('[') && segment.endsWith(']')) {
            // Keep as is for now
          }
          
          const newBasePath = segment ? `${basePath}/${segment}` : basePath;
          await this.scanRoutes(fullPath, newBasePath);
          
        } else if (entry.name === 'page.tsx' || entry.name === 'page.jsx' || entry.name === 'page.js') {
          // Found a route!
          const routePath = basePath || '/';
          
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const stats = await fs.stat(fullPath);
            
            this.routes.set(routePath, {
              path: routePath,
              filePath: fullPath,
              content,
              size: content.length,
              lines: content.split('\n').length,
              domain: this.detectDomain(routePath),
              type: this.detectRouteType(routePath, content),
              imports: this.extractImports(content),
              hasClientDirective: content.includes("'use client'") || content.includes('"use client"'),
              hasServerDirective: content.includes("'use server'") || content.includes('"use server"'),
              lastModified: stats.mtime,
            });
          } catch (error) {
            console.error(`   ⚠️ Could not read ${fullPath}: ${error.message}`);
          }
          
        } else if (entry.name === 'layout.tsx' || entry.name === 'layout.jsx') {
          // Track layouts
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            this.layouts.set(basePath || '/', {
              path: basePath || '/',
              filePath: fullPath,
              content,
            });
          } catch (error) {
            // Layout read error, continue
          }
        }
      }
    } catch (error) {
      console.error(`   ⚠️ Error scanning ${dir}: ${error.message}`);
    }
  }

  /**
   * Scan components directory
   */
  async scanComponents(dir, prefix = '') {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.')) {
            await this.scanComponents(fullPath, `${prefix}${entry.name}/`);
          }
        } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.jsx')) {
          const name = entry.name.replace(/\.(tsx|jsx)$/, '');
          
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const stats = await fs.stat(fullPath);
            
            this.components.set(`${prefix}${name}`, {
              name,
              filePath: fullPath,
              directory: prefix,
              size: content.length,
              lines: content.split('\n').length,
              lastModified: stats.mtime,
            });
          } catch (error) {
            // Component read error, continue
          }
        }
      }
    } catch (error) {
      console.error(`   ⚠️ Error scanning components: ${error.message}`);
    }
  }

  /**
   * Detect domain from route path
   */
  detectDomain(routePath) {
    if (routePath.includes('/baseball')) return 'baseball';
    if (routePath.includes('/golf')) return 'golf';
    return 'shared';
  }

  /**
   * Detect route type
   */
  detectRouteType(routePath, content) {
    const pathParts = routePath.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1] || '';

    // By path
    if (lastPart === 'overview' || routePath.endsWith('/dashboard')) return 'dashboard';
    if (lastPart === 'settings') return 'settings';
    if (lastPart === 'new' || lastPart === 'create' || lastPart === 'edit') return 'form';
    if (routePath.includes('[') && routePath.includes(']')) return 'detail';
    if (['roster', 'discover', 'messages', 'schedule', 'tournaments', 'practice'].includes(lastPart)) return 'list';
    
    // By content
    if (content.includes('DataTable') || content.includes('<table')) return 'list';
    if (content.includes('<form') || content.includes('onSubmit')) return 'form';
    if (content.includes('StatsCard') || content.includes('metrics')) return 'dashboard';
    
    return 'page';
  }

  /**
   * Extract imports from content
   */
  extractImports(content) {
    const imports = [];
    const regex = /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
    
    let match;
    while ((match = regex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    
    return imports;
  }

  /**
   * Get route by path
   */
  getRoute(routePath) {
    return this.routes.get(routePath);
  }

  /**
   * Get all routes
   */
  getAllRoutes() {
    return Array.from(this.routes.values());
  }

  /**
   * Get routes by domain
   */
  getRoutesByDomain(domain) {
    return this.getAllRoutes().filter(r => r.domain === domain);
  }

  /**
   * Get routes by type
   */
  getRoutesByType(type) {
    return this.getAllRoutes().filter(r => r.type === type);
  }

  /**
   * Get component by name
   */
  getComponent(name) {
    return this.components.get(name);
  }

  /**
   * Get all components
   */
  getAllComponents() {
    return Array.from(this.components.values());
  }

  /**
   * Get summary
   */
  getSummary() {
    const routes = this.getAllRoutes();
    
    return {
      routes: {
        total: routes.length,
        byDomain: {
          baseball: routes.filter(r => r.domain === 'baseball').length,
          golf: routes.filter(r => r.domain === 'golf').length,
          shared: routes.filter(r => r.domain === 'shared').length,
        },
        byType: routes.reduce((acc, r) => {
          acc[r.type] = (acc[r.type] || 0) + 1;
          return acc;
        }, {}),
        totalLines: routes.reduce((sum, r) => sum + r.lines, 0),
      },
      components: {
        total: this.components.size,
      },
      layouts: {
        total: this.layouts.size,
      },
      lastScan: this.lastScan,
    };
  }
}

export default CodebaseGraph;
