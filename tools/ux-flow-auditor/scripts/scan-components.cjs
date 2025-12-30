#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Component Inventory Scanner
 * Scans the codebase for React/Next.js components and tracks their usage
 */

const SRC_DIR = process.argv[2] || '../../src';
const COMPONENT_PATTERNS = [
  /src\/components\/.*\.(tsx|jsx)$/,
  /src\/app\/.*\.(tsx|jsx)$/
];

const EXCLUDED_PATTERNS = [
  /node_modules/,
  /\.next/,
  /\.git/,
  /dist/,
  /build/
];

class ComponentScanner {
  constructor(srcDir) {
    this.srcDir = path.resolve(__dirname, srcDir);
    this.components = new Map();
    this.files = [];
    this.imports = new Map(); // file -> imported components
  }

  /**
   * Recursively find all files in directory
   */
  findFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      // Skip excluded patterns
      if (EXCLUDED_PATTERNS.some(pattern => pattern.test(filePath))) {
        return;
      }

      if (stat.isDirectory()) {
        this.findFiles(filePath, fileList);
      } else if (filePath.match(/\.(tsx|ts|jsx|js)$/)) {
        fileList.push(filePath);
      }
    });

    return fileList;
  }

  /**
   * Extract component name from file path
   */
  getComponentName(filePath) {
    const basename = path.basename(filePath);
    return basename.replace(/\.(tsx|jsx|ts|js)$/, '');
  }

  /**
   * Check if file is a component file
   */
  isComponentFile(filePath) {
    return COMPONENT_PATTERNS.some(pattern => pattern.test(filePath));
  }

  /**
   * Extract imports from file content
   */
  extractImports(content, filePath) {
    const imports = [];

    // Match ES6 imports: import { X } from './path' or import X from './path'
    const importRegex = /import\s+(?:{([^}]+)}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const namedImports = match[1];
      const defaultImport = match[2];
      const importPath = match[3];

      if (namedImports) {
        // Handle named imports: { Button, Card }
        namedImports.split(',').forEach(name => {
          imports.push({
            name: name.trim(),
            path: importPath,
            type: 'named'
          });
        });
      }

      if (defaultImport) {
        imports.push({
          name: defaultImport.trim(),
          path: importPath,
          type: 'default'
        });
      }
    }

    return imports;
  }

  /**
   * Check if component is exported
   */
  isExported(content, componentName) {
    const exportPatterns = [
      new RegExp(`export\\s+(default\\s+)?(function|const|class)\\s+${componentName}`),
      new RegExp(`export\\s*{[^}]*${componentName}[^}]*}`),
      new RegExp(`export\\s+default\\s+${componentName}`)
    ];

    return exportPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Get file size in bytes
   */
  getFileSize(filePath) {
    try {
      return fs.statSync(filePath).size;
    } catch (e) {
      return 0;
    }
  }

  /**
   * Scan all files and build component inventory
   */
  scan() {
    console.log('🔍 Scanning components...');
    console.log(`📂 Source directory: ${this.srcDir}`);

    // Find all files
    this.files = this.findFiles(this.srcDir);
    console.log(`📄 Found ${this.files.length} files`);

    // First pass: identify all components
    this.files.forEach(filePath => {
      if (!this.isComponentFile(filePath)) return;

      const componentName = this.getComponentName(filePath);
      const relativePath = path.relative(this.srcDir, filePath);
      const content = fs.readFileSync(filePath, 'utf8');
      const size = this.getFileSize(filePath);

      // Check if it's actually exported as a component
      if (this.isExported(content, componentName)) {
        this.components.set(componentName, {
          name: componentName,
          path: relativePath,
          fullPath: filePath,
          size: size,
          imports: [],
          usedBy: [],
          usageCount: 0,
          lines: content.split('\n').length
        });
      }
    });

    console.log(`🧩 Found ${this.components.size} components`);

    // Second pass: track imports and usage
    this.files.forEach(filePath => {
      const content = fs.readFileSync(filePath, 'utf8');
      const imports = this.extractImports(content, filePath);
      const relativePath = path.relative(this.srcDir, filePath);

      imports.forEach(imp => {
        const componentName = imp.name;

        if (this.components.has(componentName)) {
          const component = this.components.get(componentName);
          component.usageCount++;
          component.usedBy.push({
            file: relativePath,
            importPath: imp.path,
            type: imp.type
          });
        }
      });
    });

    return this.getInventory();
  }

  /**
   * Get formatted inventory data
   */
  getInventory() {
    const components = Array.from(this.components.values());

    const used = components.filter(c => c.usageCount > 0);
    const unused = components.filter(c => c.usageCount === 0);

    // Sort by usage count (descending)
    used.sort((a, b) => b.usageCount - a.usageCount);
    unused.sort((a, b) => a.name.localeCompare(b.name));

    return {
      summary: {
        total: components.length,
        used: used.length,
        unused: unused.length,
        totalSize: components.reduce((sum, c) => sum + c.size, 0),
        unusedSize: unused.reduce((sum, c) => sum + c.size, 0)
      },
      components: {
        all: components,
        used: used,
        unused: unused
      }
    };
  }

  /**
   * Generate report
   */
  generateReport(inventory) {
    console.log('\n📊 Component Inventory Report\n');
    console.log('━'.repeat(60));
    console.log(`Total Components:     ${inventory.summary.total}`);
    console.log(`Used Components:      ${inventory.summary.used} ✅`);
    console.log(`Unused Components:    ${inventory.summary.unused} ⚠️`);
    console.log(`Total Size:           ${(inventory.summary.totalSize / 1024).toFixed(2)} KB`);
    console.log(`Unused Size:          ${(inventory.summary.unusedSize / 1024).toFixed(2)} KB`);
    console.log('━'.repeat(60));

    if (inventory.components.unused.length > 0) {
      console.log('\n⚠️  Unused Components (Safe to Remove):\n');
      inventory.components.unused.forEach(comp => {
        console.log(`  ${comp.name.padEnd(30)} ${comp.path}`);
      });
    }

    console.log('\n✅ Top 10 Most Used Components:\n');
    inventory.components.used.slice(0, 10).forEach(comp => {
      console.log(`  ${comp.name.padEnd(30)} ${String(comp.usageCount).padStart(3)} imports`);
    });
  }
}

// CLI mode
if (require.main === module) {
  const scanner = new ComponentScanner(SRC_DIR);
  const inventory = scanner.scan();
  scanner.generateReport(inventory);

  // Save to JSON
  const outputPath = path.join(__dirname, '../component-inventory.json');
  fs.writeFileSync(outputPath, JSON.stringify(inventory, null, 2));
  console.log(`\n💾 Full inventory saved to: ${outputPath}`);
}

module.exports = ComponentScanner;
