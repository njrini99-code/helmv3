/**
 * DYNAMIC CODEBASE SCANNER
 * 
 * Scans the helmv3 codebase to build/update knowledge dynamically.
 * Run this to keep knowledge in sync with actual code.
 * 
 * Usage:
 *   node src/knowledge/scanner.js
 *   
 * Or programmatically:
 *   import { CodebaseScanner } from './scanner.js';
 *   const scanner = new CodebaseScanner('/path/to/helmv3');
 *   const knowledge = await scanner.scan();
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// FILE PATHS THE SCANNER NEEDS ACCESS TO
// ============================================================

export const REQUIRED_FILE_ACCESS = {
  // Core configuration files
  config: [
    'CLAUDE.md',
    'package.json',
    'tsconfig.json',
  ],
  
  // Type definitions
  types: [
    'src/lib/types/index.ts',
    'src/lib/types/database.ts',
    'src/lib/types/golf.ts',
    'src/lib/types/golf-course.ts',
    'src/lib/types/messages.ts',
  ],
  
  // Design system
  styles: [
    'src/app/globals.css',
  ],
  
  // Route directories
  routeDirectories: [
    'src/app/baseball',
    'src/app/golf',
    'src/app/api',
    'src/app/about',
    'src/app/help',
    'src/app/auth',
  ],
  
  // Component directories
  componentDirectories: [
    'src/components/ui',
    'src/components/features',
    'src/components/coach',
    'src/components/player',
    'src/components/golf',
    'src/components/layout',
    'src/components/navigation',
    'src/components/charts',
    'src/components/messages',
    'src/components/dashboard',
    'src/components/panels',
    'src/components/shared',
    'src/components/landing',
    'src/components/hero',
    'src/components/icons',
  ],
  
  // Hooks directory
  hooks: [
    'src/hooks',
  ],
  
  // Stores directory
  stores: [
    'src/stores',
  ],
  
  // Contexts directory
  contexts: [
    'src/contexts',
  ],
  
  // Actions
  actions: [
    'src/app/baseball/actions',
    'src/app/golf/actions',
    'src/app/actions',
  ],
  
  // Supabase config
  supabase: [
    'src/lib/supabase/server.ts',
    'src/lib/supabase/client.ts',
    'src/lib/supabase/middleware.ts',
  ],
};

// ============================================================
// CODEBASE SCANNER CLASS
// ============================================================

export class CodebaseScanner {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.knowledge = {
      routes: {},
      components: {},
      hooks: {},
      types: {},
      designSystem: {},
      database: {},
      scannedAt: null,
    };
  }

  async scan() {
    console.log('🔍 Scanning codebase...');
    this.knowledge.scannedAt = new Date().toISOString();
    
    try {
      await this.scanRoutes();
      await this.scanComponents();
      await this.scanHooks();
      await this.extractDesignSystem();
      await this.extractDatabaseSchema();
      await this.extractTypes();
      
      console.log('✅ Scan complete!');
      return this.knowledge;
      
    } catch (error) {
      console.error('❌ Scan failed:', error.message);
      throw error;
    }
  }

  async scanRoutes() {
    console.log('  📁 Scanning routes...');
    
    const routeDirs = REQUIRED_FILE_ACCESS.routeDirectories;
    
    for (const routeDir of routeDirs) {
      const fullPath = path.join(this.projectRoot, routeDir);
      
      if (await this.exists(fullPath)) {
        await this.scanRouteDirectory(fullPath, routeDir);
      }
    }
    
    console.log(`     Found ${Object.keys(this.knowledge.routes).length} routes`);
  }

  async scanRouteDirectory(dir, basePath) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      try {
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('_') && !entry.name.startsWith('.')) {
            await this.scanRouteDirectory(fullPath, path.join(basePath, entry.name));
          }
        } else if (entry.name === 'page.tsx' || entry.name === 'page.ts') {
          const routePath = this.pathToRoute(basePath);
          const content = await this.readFile(fullPath);
          
          if (!content) continue;
          
          this.knowledge.routes[routePath] = {
            filePath: fullPath.replace(this.projectRoot, ''),
            routePath,
            domain: basePath.includes('golf') ? 'golf' : 'baseball',
            routeType: this.inferRouteType(routePath),
            hasLoading: await this.exists(path.join(dir, 'loading.tsx')),
            hasError: await this.exists(path.join(dir, 'error.tsx')),
            hasLayout: await this.exists(path.join(dir, 'layout.tsx')),
            isClientComponent: content.includes("'use client'") || content.includes('"use client"'),
            imports: this.extractImports(content),
            components: this.extractComponentUsage(content),
            hooks: this.extractHookUsage(content),
          };
        }
      } catch (e) {
        continue;
      }
    }
  }

  pathToRoute(filePath) {
    return '/' + filePath
      .replace('src/app/', '')
      .replace(/\(.*?\)\//g, '')
      .replace(/\[([^\]]+)\]/g, ':$1')
      .replace(/\/page$/, '')
      .replace(/\/+/g, '/');
  }

  inferRouteType(routePath) {
    if (routePath.includes('/login') || routePath.includes('/signup')) return 'auth';
    if (routePath.includes('/onboarding')) return 'onboarding';
    if (routePath.match(/\/dashboard$/)) return 'dashboard-home';
    if (routePath.includes('/dashboard/')) return 'dashboard-page';
    return 'page';
  }

  async scanComponents() {
    console.log('  🧩 Scanning components...');
    
    const componentDirs = REQUIRED_FILE_ACCESS.componentDirectories;
    
    for (const componentDir of componentDirs) {
      const fullPath = path.join(this.projectRoot, componentDir);
      
      if (await this.exists(fullPath)) {
        await this.scanComponentDirectory(fullPath);
      }
    }
    
    console.log(`     Found ${Object.keys(this.knowledge.components).length} components`);
  }

  async scanComponentDirectory(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        await this.scanComponentDirectory(fullPath);
      } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
        const content = await this.readFile(fullPath);
        if (!content) continue;
        
        const componentName = entry.name.replace(/\.(tsx|ts)$/, '');
        
        this.knowledge.components[componentName] = {
          filePath: fullPath.replace(this.projectRoot, ''),
          name: componentName,
          isClientComponent: content.includes("'use client'"),
          props: this.extractProps(content),
          hooks: this.extractHookUsage(content),
        };
      }
    }
  }

  async scanHooks() {
    console.log('  🪝 Scanning hooks...');
    
    for (const hookDir of REQUIRED_FILE_ACCESS.hooks) {
      const fullPath = path.join(this.projectRoot, hookDir);
      
      if (await this.exists(fullPath)) {
        let entries;
        try {
          entries = await fs.readdir(fullPath, { withFileTypes: true });
        } catch (e) {
          continue;
        }
        
        for (const entry of entries) {
          if (entry.name.startsWith('use') && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
            const content = await this.readFile(path.join(fullPath, entry.name));
            if (!content) continue;
            
            const hookName = entry.name.replace(/\.(tsx|ts)$/, '');
            
            this.knowledge.hooks[hookName] = {
              filePath: path.join(hookDir, entry.name),
              name: hookName,
              returns: this.extractHookReturn(content),
            };
          }
        }
      }
    }
    
    console.log(`     Found ${Object.keys(this.knowledge.hooks).length} hooks`);
  }

  async extractDesignSystem() {
    console.log('  🎨 Extracting design system...');
    
    const cssPath = path.join(this.projectRoot, 'src/app/globals.css');
    
    if (await this.exists(cssPath)) {
      const content = await this.readFile(cssPath);
      
      this.knowledge.designSystem = {
        hasFile: true,
        cssVars: this.extractCSSVars(content),
        customClasses: this.extractCustomClasses(content),
      };
    }
    
    console.log('     Design system extracted');
  }

  extractCSSVars(content) {
    const vars = {};
    const regex = /--([\w-]+):\s*([^;]+);/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      vars[match[1]] = match[2].trim();
    }
    
    return vars;
  }

  extractCustomClasses(content) {
    const classes = [];
    const regex = /\.([a-zA-Z][\w-]*)\s*\{/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      if (!classes.includes(match[1])) {
        classes.push(match[1]);
      }
    }
    
    return classes;
  }

  async extractDatabaseSchema() {
    console.log('  🗄️ Extracting database schema...');
    
    const dbPath = path.join(this.projectRoot, 'src/lib/types/database.ts');
    
    if (await this.exists(dbPath)) {
      const content = await this.readFile(dbPath);
      
      this.knowledge.database = {
        tables: this.extractTables(content),
        enums: this.extractEnums(content),
      };
    }
    
    console.log(`     Found ${Object.keys(this.knowledge.database.tables || {}).length} tables`);
  }

  extractTables(content) {
    const tables = {};
    const regex = /(\w+):\s*\{\s*Row:\s*\{/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      tables[match[1]] = { name: match[1] };
    }
    
    return tables;
  }

  extractEnums(content) {
    const enums = {};
    const regex = /Enums:\s*\{([^}]+)\}/;
    const enumsMatch = content.match(regex);
    
    if (enumsMatch) {
      const enumContent = enumsMatch[1];
      const enumRegex = /(\w+):\s*([^,\n]+)/g;
      let match;
      
      while ((match = enumRegex.exec(enumContent)) !== null) {
        enums[match[1]] = match[2].trim();
      }
    }
    
    return enums;
  }

  async extractTypes() {
    console.log('  📝 Extracting types...');
    
    const typesPath = path.join(this.projectRoot, 'src/lib/types/index.ts');
    
    if (await this.exists(typesPath)) {
      const content = await this.readFile(typesPath);
      
      this.knowledge.types = {
        interfaces: this.extractInterfaces(content),
        exports: this.extractExports(content),
      };
    }
    
    console.log(`     Found ${Object.keys(this.knowledge.types.interfaces || {}).length} interfaces`);
  }

  extractInterfaces(content) {
    const interfaces = {};
    const regex = /(?:export\s+)?interface\s+(\w+)/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      interfaces[match[1]] = { name: match[1] };
    }
    
    return interfaces;
  }

  // Helper methods
  async exists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async readFile(filePath) {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  extractImports(content) {
    const imports = [];
    const regex = /import\s+(?:type\s+)?(?:\{[^}]+\}|[\w*]+)\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    
    return imports;
  }

  extractExports(content) {
    const exports = [];
    const regex = /export\s+(?:default\s+)?(?:function|const|class|type|interface)\s+(\w+)/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      exports.push(match[1]);
    }
    
    return exports;
  }

  extractComponentUsage(content) {
    const components = [];
    const regex = /<([A-Z]\w+)/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      if (!components.includes(match[1])) {
        components.push(match[1]);
      }
    }
    
    return components;
  }

  extractHookUsage(content) {
    const hooks = [];
    const regex = /\buse[A-Z]\w+\s*\(/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      const hookName = match[0].replace('(', '').trim();
      if (!hooks.includes(hookName)) {
        hooks.push(hookName);
      }
    }
    
    return hooks;
  }

  extractProps(content) {
    const propsMatch = content.match(/interface\s+\w*Props\s*(?:extends\s+[\w<>,\s]+)?\s*\{([^}]+)\}/);
    if (propsMatch) {
      const props = {};
      const propRegex = /(\w+)\??:\s*([^;]+)/g;
      let match;
      
      while ((match = propRegex.exec(propsMatch[1])) !== null) {
        props[match[1]] = match[2].trim();
      }
      
      return props;
    }
    
    return {};
  }

  extractHookReturn(content) {
    const returnMatch = content.match(/return\s*\{([^}]+)\}/);
    if (returnMatch) {
      return returnMatch[1].split(',').map(s => s.trim().split(':')[0].trim()).filter(Boolean);
    }
    return [];
  }

  async saveKnowledge(outputPath) {
    const json = JSON.stringify(this.knowledge, null, 2);
    await fs.writeFile(outputPath, json);
    console.log(`💾 Knowledge saved to: ${outputPath}`);
  }
}

// ============================================================
// CLI RUNNER
// ============================================================

async function main() {
  const projectRoot = process.argv[2] || path.resolve(process.cwd(), '../..');
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  HELM CODEBASE SCANNER');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Project: ${projectRoot}`);
  console.log('');
  
  const scanner = new CodebaseScanner(projectRoot);
  const knowledge = await scanner.scan();
  
  // Save to file
  const outputPath = path.join(__dirname, 'scanned-knowledge.json');
  await scanner.saveKnowledge(outputPath);
  
  // Print summary
  console.log('');
  console.log('📊 Summary:');
  console.log(`   Routes:     ${Object.keys(knowledge.routes).length}`);
  console.log(`   Components: ${Object.keys(knowledge.components).length}`);
  console.log(`   Hooks:      ${Object.keys(knowledge.hooks).length}`);
  console.log(`   Tables:     ${Object.keys(knowledge.database.tables || {}).length}`);
  console.log(`   Enums:      ${Object.keys(knowledge.database.enums || {}).length}`);
  console.log('');
}

// Run if called directly
main().catch(console.error);

export default CodebaseScanner;
