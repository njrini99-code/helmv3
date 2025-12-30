#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Design System Scanner
 * Analyzes codebase for design inconsistencies (colors, spacing, typography, borders)
 */

class DesignSystemScanner {
  constructor(srcDir) {
    this.srcDir = path.resolve(__dirname, srcDir);
    this.files = [];
    this.colors = new Map();
    this.spacings = new Map();
    this.typography = new Map();
    this.borderRadius = new Map();
    this.inconsistencies = [];
  }

  /**
   * Recursively find all files
   */
  findFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      // Skip node_modules, .next, etc.
      if (/(node_modules|\.next|\.git|dist|build)/.test(filePath)) {
        return;
      }

      if (stat.isDirectory()) {
        this.findFiles(filePath, fileList);
      } else if (filePath.match(/\.(tsx|ts|jsx|js|css|scss)$/)) {
        fileList.push(filePath);
      }
    });

    return fileList;
  }

  /**
   * Extract colors from file content
   */
  extractColors(content, filePath) {
    const relativePath = path.relative(this.srcDir, filePath);

    // Hex colors
    const hexRegex = /#[0-9a-fA-F]{3,8}\b/g;
    let match;
    while ((match = hexRegex.exec(content)) !== null) {
      const color = match[0].toLowerCase();
      if (!this.colors.has(color)) {
        this.colors.set(color, []);
      }
      this.colors.get(color).push({ file: relativePath, value: color });
    }

    // RGB/RGBA
    const rgbRegex = /rgba?\([^)]+\)/g;
    while ((match = rgbRegex.exec(content)) !== null) {
      const color = match[0];
      if (!this.colors.has(color)) {
        this.colors.set(color, []);
      }
      this.colors.get(color).push({ file: relativePath, value: color });
    }

    // Tailwind colors (text-, bg-, border-)
    const tailwindColorRegex = /(text|bg|border)-(\w+)-(\d+)/g;
    while ((match = tailwindColorRegex.exec(content)) !== null) {
      const color = match[0];
      if (!this.colors.has(color)) {
        this.colors.set(color, []);
      }
      this.colors.get(color).push({ file: relativePath, value: color });
    }
  }

  /**
   * Extract spacing values
   */
  extractSpacing(content, filePath) {
    const relativePath = path.relative(this.srcDir, filePath);

    // Tailwind spacing (p-, m-, gap-, space-)
    const spacingRegex = /(p|m|gap|space|w|h)-(\d+|px|auto)/g;
    let match;
    while ((match = spacingRegex.exec(content)) !== null) {
      const spacing = match[0];
      if (!this.spacings.has(spacing)) {
        this.spacings.set(spacing, []);
      }
      this.spacings.get(spacing).push({ file: relativePath, value: spacing });
    }

    // Pixel values
    const pxRegex = /\d+px/g;
    while ((match = pxRegex.exec(content)) !== null) {
      const spacing = match[0];
      if (!this.spacings.has(spacing)) {
        this.spacings.set(spacing, []);
      }
      this.spacings.get(spacing).push({ file: relativePath, value: spacing });
    }
  }

  /**
   * Extract typography
   */
  extractTypography(content, filePath) {
    const relativePath = path.relative(this.srcDir, filePath);

    // Tailwind typography (text-xs, text-sm, etc.)
    const textSizeRegex = /text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)/g;
    let match;
    while ((match = textSizeRegex.exec(content)) !== null) {
      const size = match[0];
      if (!this.typography.has(size)) {
        this.typography.set(size, []);
      }
      this.typography.get(size).push({ file: relativePath, value: size });
    }

    // Font families
    const fontRegex = /font-(sans|serif|mono)/g;
    while ((match = fontRegex.exec(content)) !== null) {
      const font = match[0];
      if (!this.typography.has(font)) {
        this.typography.set(font, []);
      }
      this.typography.get(font).push({ file: relativePath, value: font });
    }
  }

  /**
   * Extract border radius
   */
  extractBorderRadius(content, filePath) {
    const relativePath = path.relative(this.srcDir, filePath);

    // Tailwind rounded
    const roundedRegex = /rounded(-\w+)?/g;
    let match;
    while ((match = roundedRegex.exec(content)) !== null) {
      const radius = match[0];
      if (!this.borderRadius.has(radius)) {
        this.borderRadius.set(radius, []);
      }
      this.borderRadius.get(radius).push({ file: relativePath, value: radius });
    }
  }

  /**
   * Detect inconsistencies
   */
  detectInconsistencies() {
    // Color inconsistencies (similar hex colors)
    const colorValues = Array.from(this.colors.keys());
    const hexColors = colorValues.filter(c => c.startsWith('#'));

    for (let i = 0; i < hexColors.length; i++) {
      for (let j = i + 1; j < hexColors.length; j++) {
        if (this.colorSimilarity(hexColors[i], hexColors[j]) > 0.95) {
          this.inconsistencies.push({
            type: 'color',
            severity: 'warning',
            message: `Similar colors detected: ${hexColors[i]} and ${hexColors[j]}`,
            suggestion: 'Consider using a single color from your design system',
            values: [hexColors[i], hexColors[j]],
            occurrences: this.colors.get(hexColors[i]).length + this.colors.get(hexColors[j]).length
          });
        }
      }
    }

    // Too many unique colors
    const uniqueColors = colorValues.length;
    if (uniqueColors > 50) {
      this.inconsistencies.push({
        type: 'color',
        severity: 'error',
        message: `${uniqueColors} unique colors found`,
        suggestion: 'Reduce to a consistent color palette (ideally < 20 colors)',
        occurrences: uniqueColors
      });
    }

    // Spacing inconsistencies (non-standard values)
    const standardSpacings = ['0', '1', '2', '3', '4', '5', '6', '8', '10', '12', '16', '20', '24', '32'];
    const nonStandardSpacings = Array.from(this.spacings.keys()).filter(s => {
      const num = s.match(/\d+/);
      return num && !standardSpacings.includes(num[0]);
    });

    if (nonStandardSpacings.length > 10) {
      this.inconsistencies.push({
        type: 'spacing',
        severity: 'warning',
        message: `${nonStandardSpacings.length} non-standard spacing values`,
        suggestion: 'Use Tailwind\'s spacing scale (4px increments)',
        occurrences: nonStandardSpacings.length
      });
    }

    // Typography inconsistencies
    const uniqueFontSizes = Array.from(this.typography.keys()).filter(t => t.startsWith('text-')).length;
    if (uniqueFontSizes > 8) {
      this.inconsistencies.push({
        type: 'typography',
        severity: 'warning',
        message: `${uniqueFontSizes} different font sizes`,
        suggestion: 'Limit to a type scale (5-8 sizes)',
        occurrences: uniqueFontSizes
      });
    }
  }

  /**
   * Calculate color similarity (simple RGB distance)
   */
  colorSimilarity(hex1, hex2) {
    const rgb1 = this.hexToRgb(hex1);
    const rgb2 = this.hexToRgb(hex2);

    if (!rgb1 || !rgb2) return 0;

    const distance = Math.sqrt(
      Math.pow(rgb1.r - rgb2.r, 2) +
      Math.pow(rgb1.g - rgb2.g, 2) +
      Math.pow(rgb1.b - rgb2.b, 2)
    );

    const maxDistance = Math.sqrt(255 * 255 * 3);
    return 1 - (distance / maxDistance);
  }

  /**
   * Convert hex to RGB
   */
  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  /**
   * Run the scan
   */
  scan() {
    console.log('🎨 Scanning design system...');
    console.log(`📂 Source directory: ${this.srcDir}`);

    this.files = this.findFiles(this.srcDir);
    console.log(`📄 Found ${this.files.length} files`);

    // Extract design tokens
    this.files.forEach(filePath => {
      const content = fs.readFileSync(filePath, 'utf8');
      this.extractColors(content, filePath);
      this.extractSpacing(content, filePath);
      this.extractTypography(content, filePath);
      this.extractBorderRadius(content, filePath);
    });

    // Detect issues
    this.detectInconsistencies();

    console.log(`🎨 Found ${this.colors.size} unique colors`);
    console.log(`📏 Found ${this.spacings.size} spacing values`);
    console.log(`🔤 Found ${this.typography.size} typography values`);
    console.log(`⭕ Found ${this.borderRadius.size} border radius values`);
    console.log(`⚠️  Detected ${this.inconsistencies.length} inconsistencies`);

    return this.getReport();
  }

  /**
   * Get formatted report
   */
  getReport() {
    // Get top colors
    const topColors = Array.from(this.colors.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 20)
      .map(([color, occurrences]) => ({
        value: color,
        count: occurrences.length,
        files: occurrences.slice(0, 5).map(o => o.file)
      }));

    // Get top spacings
    const topSpacings = Array.from(this.spacings.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 15)
      .map(([spacing, occurrences]) => ({
        value: spacing,
        count: occurrences.length
      }));

    // Get top typography
    const topTypography = Array.from(this.typography.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 10)
      .map(([type, occurrences]) => ({
        value: type,
        count: occurrences.length
      }));

    return {
      summary: {
        uniqueColors: this.colors.size,
        uniqueSpacings: this.spacings.size,
        uniqueTypography: this.typography.size,
        uniqueBorderRadius: this.borderRadius.size,
        filesScanned: this.files.length,
        inconsistenciesFound: this.inconsistencies.length
      },
      colors: topColors,
      spacings: topSpacings,
      typography: topTypography,
      borderRadius: Array.from(this.borderRadius.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 10)
        .map(([radius, occurrences]) => ({
          value: radius,
          count: occurrences.length
        })),
      inconsistencies: this.inconsistencies
    };
  }
}

// CLI mode
if (require.main === module) {
  const srcDir = process.argv[2] || '../../src';
  const scanner = new DesignSystemScanner(srcDir);
  const report = scanner.scan();

  console.log('\n📊 Design System Report\n');
  console.log('━'.repeat(60));
  console.log(`Unique Colors:       ${report.summary.uniqueColors}`);
  console.log(`Unique Spacings:     ${report.summary.uniqueSpacings}`);
  console.log(`Unique Typography:   ${report.summary.uniqueTypography}`);
  console.log(`Unique Border Radii: ${report.summary.uniqueBorderRadius}`);
  console.log(`Inconsistencies:     ${report.summary.inconsistenciesFound}`);
  console.log('━'.repeat(60));

  // Save to JSON
  const outputPath = path.join(__dirname, '../design-system-report.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n💾 Full report saved to: ${outputPath}`);
}

module.exports = DesignSystemScanner;
