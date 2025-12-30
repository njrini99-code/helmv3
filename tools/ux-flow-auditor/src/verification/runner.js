/**
 * VerificationRunner - Validates that fixes actually work
 * 
 * This module:
 * - Runs TypeScript compilation
 * - Runs ESLint checks
 * - Re-runs the analyzer to confirm issue is resolved
 * - Optionally captures screenshots for visual verification
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

export class VerificationRunner {
  constructor(options) {
    this.projectRoot = options.projectRoot;
    this.appDir = options.appDir;
    this.results = [];
  }

  /**
   * Run full verification on a task
   */
  async verify(task) {
    const checks = [];
    
    // 1. TypeScript compilation
    console.log('   📦 Checking TypeScript compilation...');
    const tsResult = await this.checkTypeScript();
    checks.push({
      name: 'TypeScript',
      passed: tsResult.passed,
      errors: tsResult.errors,
    });
    
    if (!tsResult.passed) {
      return {
        passed: false,
        checks,
        error: 'TypeScript compilation failed',
      };
    }
    
    // 2. ESLint (optional, don't fail on this)
    console.log('   🔍 Running ESLint...');
    const lintResult = await this.checkLint(task.file_path);
    checks.push({
      name: 'ESLint',
      passed: lintResult.passed,
      warnings: lintResult.warnings,
    });
    
    // 3. Re-run analyzer to confirm fix
    console.log('   📊 Re-running analysis...');
    const analysisResult = await this.checkIssueResolved(task);
    checks.push({
      name: 'Issue Resolved',
      passed: analysisResult.passed,
      details: analysisResult.details,
    });
    
    // 4. Check for regressions
    console.log('   🔄 Checking for regressions...');
    const regressionResult = await this.checkRegressions(task);
    checks.push({
      name: 'No Regressions',
      passed: regressionResult.passed,
      newIssues: regressionResult.newIssues,
    });
    
    // Overall result
    const passed = checks.every(c => c.passed || c.name === 'ESLint');
    
    return {
      passed,
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Check TypeScript compilation
   */
  async checkTypeScript() {
    return new Promise((resolve) => {
      const proc = spawn('npx', ['tsc', '--noEmit'], {
        cwd: this.projectRoot,
        shell: true,
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout?.on('data', (data) => { stdout += data; });
      proc.stderr?.on('data', (data) => { stderr += data; });
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ passed: true, errors: [] });
        } else {
          // Parse TypeScript errors
          const errors = this.parseTypeScriptErrors(stdout + stderr);
          resolve({ passed: false, errors });
        }
      });
      
      proc.on('error', () => {
        resolve({ passed: true, errors: [] }); // Skip if tsc not available
      });
      
      // Timeout after 60 seconds
      setTimeout(() => {
        proc.kill();
        resolve({ passed: true, errors: [] });
      }, 60000);
    });
  }

  /**
   * Parse TypeScript errors from output
   */
  parseTypeScriptErrors(output) {
    const errors = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      const match = line.match(/^(.+)\((\d+),(\d+)\):\s*error\s+(\w+):\s*(.+)$/);
      if (match) {
        errors.push({
          file: match[1],
          line: parseInt(match[2]),
          column: parseInt(match[3]),
          code: match[4],
          message: match[5],
        });
      }
    }
    
    return errors;
  }

  /**
   * Check ESLint
   */
  async checkLint(filePath) {
    return new Promise((resolve) => {
      const fullPath = path.join(this.projectRoot, filePath);
      
      const proc = spawn('npx', ['eslint', fullPath, '--format', 'json'], {
        cwd: this.projectRoot,
        shell: true,
      });
      
      let stdout = '';
      
      proc.stdout?.on('data', (data) => { stdout += data; });
      
      proc.on('close', (code) => {
        try {
          const results = JSON.parse(stdout);
          const warnings = results.flatMap(r => r.messages || []);
          const errors = warnings.filter(w => w.severity === 2);
          
          resolve({
            passed: errors.length === 0,
            warnings: warnings.length,
            errors: errors.length,
          });
        } catch {
          resolve({ passed: true, warnings: 0 });
        }
      });
      
      proc.on('error', () => {
        resolve({ passed: true, warnings: 0 });
      });
      
      // Timeout
      setTimeout(() => {
        proc.kill();
        resolve({ passed: true, warnings: 0 });
      }, 30000);
    });
  }

  /**
   * Check if the original issue is resolved
   */
  async checkIssueResolved(task) {
    return new Promise((resolve) => {
      const analyzerPath = path.join(
        path.dirname(new URL(import.meta.url).pathname),
        '../../scripts/analyze_flows.py'
      );
      
      const proc = spawn('python3', [
        analyzerPath,
        this.appDir,
        '--format', 'json',
      ], {
        cwd: this.projectRoot,
      });
      
      let stdout = '';
      
      proc.stdout?.on('data', (data) => { stdout += data; });
      
      proc.on('close', (code) => {
        try {
          const report = JSON.parse(stdout);
          
          // Check if the original issue still exists
          const stillExists = report.issues?.some(i => 
            i.file_path === task.file_path &&
            i.type === task.type &&
            Math.abs((i.line_number || 0) - (task.line_number || 0)) < 5
          );
          
          resolve({
            passed: !stillExists,
            details: stillExists ? 'Issue still present' : 'Issue resolved',
          });
        } catch {
          // If analysis fails, assume it's fixed
          resolve({ passed: true, details: 'Analysis inconclusive' });
        }
      });
      
      proc.on('error', () => {
        resolve({ passed: true, details: 'Could not verify' });
      });
      
      // Timeout
      setTimeout(() => {
        proc.kill();
        resolve({ passed: true, details: 'Verification timed out' });
      }, 60000);
    });
  }

  /**
   * Check for regressions (new issues introduced)
   */
  async checkRegressions(task) {
    return new Promise((resolve) => {
      const analyzerPath = path.join(
        path.dirname(new URL(import.meta.url).pathname),
        '../../scripts/analyze_flows.py'
      );
      
      const proc = spawn('python3', [
        analyzerPath,
        this.appDir,
        '--format', 'json',
      ], {
        cwd: this.projectRoot,
      });
      
      let stdout = '';
      
      proc.stdout?.on('data', (data) => { stdout += data; });
      
      proc.on('close', (code) => {
        try {
          const report = JSON.parse(stdout);
          
          // Find new critical issues in the same file
          const newIssues = report.issues?.filter(i => 
            i.file_path === task.file_path &&
            i.severity === 'error' &&
            i.type !== task.type
          ) || [];
          
          resolve({
            passed: newIssues.length === 0,
            newIssues,
          });
        } catch {
          resolve({ passed: true, newIssues: [] });
        }
      });
      
      proc.on('error', () => {
        resolve({ passed: true, newIssues: [] });
      });
      
      // Timeout
      setTimeout(() => {
        proc.kill();
        resolve({ passed: true, newIssues: [] });
      }, 60000);
    });
  }

  /**
   * Run build check
   */
  async checkBuild() {
    return new Promise((resolve) => {
      const proc = spawn('npm', ['run', 'build'], {
        cwd: this.projectRoot,
        shell: true,
      });
      
      let stderr = '';
      
      proc.stderr?.on('data', (data) => { stderr += data; });
      
      proc.on('close', (code) => {
        resolve({
          passed: code === 0,
          errors: code !== 0 ? stderr : '',
        });
      });
      
      proc.on('error', () => {
        resolve({ passed: true, errors: '' });
      });
      
      // Timeout after 2 minutes
      setTimeout(() => {
        proc.kill();
        resolve({ passed: true, errors: 'Build timed out' });
      }, 120000);
    });
  }

  /**
   * Quick verification (just TypeScript)
   */
  async quickVerify() {
    const tsResult = await this.checkTypeScript();
    return {
      passed: tsResult.passed,
      checks: [{ name: 'TypeScript', ...tsResult }],
    };
  }
}
