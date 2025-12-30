/**
 * ProductionReadinessAnalyzer - Pre-ship checklist
 * 
 * Checks:
 * - Environment leaks (API keys, secrets)
 * - Console statements
 * - TODO/FIXME comments
 * - Hardcoded URLs
 * - Missing loading/error states
 * - SEO/Meta tags
 * - Auth protection
 * - Form validation
 */

import { promises as fs } from 'fs';
import path from 'path';
import fg from 'fast-glob';

export class ProductionReadinessAnalyzer {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.appDir = path.join(projectRoot, 'src/app');
    this.results = {
      blockers: [],
      warnings: [],
      passed: [],
      score: 0,
    };
  }

  async analyze() {
    console.log('🔍 Analyzing production readiness...');
    
    const files = await fg(['**/*.{ts,tsx,js,jsx}'], {
      cwd: this.appDir,
      ignore: ['**/node_modules/**', '**/.next/**'],
      absolute: true,
    });

    // Run all checks
    await this.checkEnvironmentLeaks(files);
    await this.checkConsoleStatements(files);
    await this.checkTodoComments(files);
    await this.checkHardcodedUrls(files);
    await this.checkLoadingStates(files);
    await this.checkErrorStates(files);
    await this.checkMetaTags(files);
    await this.checkAuthProtection(files);
    await this.checkFormValidation(files);
    await this.checkTypeScriptAny(files);
    await this.checkEmptyHandlers(files);
    await this.checkImageAlts(files);

    // Calculate score
    this.calculateScore();

    return this.results;
  }

  async checkEnvironmentLeaks(files) {
    const patterns = [
      { regex: /['"][a-zA-Z0-9_-]{20,}['"](?!.*process\.env)/g, name: 'Potential API key' },
      { regex: /sk[-_]live[a-zA-Z0-9_-]+/gi, name: 'Stripe live key' },
      { regex: /pk[-_]live[a-zA-Z0-9_-]+/gi, name: 'Stripe live key' },
      { regex: /password\s*[:=]\s*['"][^'"]+['"]/gi, name: 'Hardcoded password' },
      { regex: /secret\s*[:=]\s*['"][^'"]+['"]/gi, name: 'Hardcoded secret' },
    ];

    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      const relativePath = path.relative(this.projectRoot, file);
      
      for (const { regex, name } of patterns) {
        const matches = content.match(regex);
        if (matches) {
          this.results.blockers.push({
            category: 'security',
            severity: 'blocker',
            title: `${name} detected`,
            file: relativePath,
            count: matches.length,
            fix: 'Move to environment variables',
          });
        }
      }
    }
  }

  async checkConsoleStatements(files) {
    let totalCount = 0;
    const fileList = [];

    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      const relativePath = path.relative(this.projectRoot, file);
      const matches = content.match(/console\.(log|warn|error|debug|info)\(/g);
      
      if (matches) {
        totalCount += matches.length;
        fileList.push({ file: relativePath, count: matches.length });
      }
    }

    if (totalCount > 0) {
      this.results.warnings.push({
        category: 'code-quality',
        severity: 'warning',
        title: `${totalCount} console statements`,
        files: fileList.slice(0, 5),
        fix: 'Remove console statements or use proper logging',
      });
    } else {
      this.results.passed.push({ title: 'No console statements', category: 'code-quality' });
    }
  }

  async checkTodoComments(files) {
    let todos = [];

    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      const relativePath = path.relative(this.projectRoot, file);
      const lines = content.split('\n');
      
      lines.forEach((line, i) => {
        if (/TODO|FIXME|HACK|XXX/i.test(line)) {
          todos.push({ file: relativePath, line: i + 1, text: line.trim().slice(0, 80) });
        }
      });
    }

    if (todos.length > 0) {
      this.results.warnings.push({
        category: 'code-quality',
        severity: 'warning',
        title: `${todos.length} TODO/FIXME comments`,
        items: todos.slice(0, 10),
        fix: 'Complete or remove before shipping',
      });
    } else {
      this.results.passed.push({ title: 'No TODO comments', category: 'code-quality' });
    }
  }

  async checkHardcodedUrls(files) {
    const patterns = [
      /http:\/\/localhost:\d+/g,
      /127\.0\.0\.1:\d+/g,
      /https?:\/\/[^'")\\s]*staging[^'")\\s]*/gi,
      /https?:\/\/[^'")\\s]*dev\.[^'")\\s]*/gi,
    ];

    let found = [];

    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      const relativePath = path.relative(this.projectRoot, file);
      
      for (const regex of patterns) {
        const matches = content.match(regex);
        if (matches) {
          found.push({ file: relativePath, urls: matches.slice(0, 3) });
        }
      }
    }

    if (found.length > 0) {
      this.results.blockers.push({
        category: 'config',
        severity: 'blocker',
        title: 'Hardcoded development URLs',
        files: found.slice(0, 5),
        fix: 'Use environment variables for URLs',
      });
    } else {
      this.results.passed.push({ title: 'No hardcoded dev URLs', category: 'config' });
    }
  }

  async checkLoadingStates(files) {
    let routesWithDataFetch = 0;
    let routesWithLoading = 0;
    const missingLoading = [];

    for (const file of files) {
      if (!file.includes('/app/') || (!file.endsWith('page.tsx') && !file.endsWith('page.jsx'))) continue;
      
      const content = await fs.readFile(file, 'utf8');
      const relativePath = path.relative(this.projectRoot, file);
      const dir = path.dirname(file);
      
      const hasDataFetch = /fetch|useSWR|useQuery|getServerSideProps|createClient.*from/.test(content);
      
      if (hasDataFetch) {
        routesWithDataFetch++;
        
        const loadingPath = path.join(dir, 'loading.tsx');
        const hasLoadingFile = await fs.access(loadingPath).then(() => true).catch(() => false);
        const hasLoadingState = /loading|isLoading|Suspense|Skeleton/.test(content);
        
        if (hasLoadingFile || hasLoadingState) {
          routesWithLoading++;
        } else {
          missingLoading.push(relativePath);
        }
      }
    }

    if (missingLoading.length > 0) {
      this.results.warnings.push({
        category: 'ux',
        severity: 'warning',
        title: `${missingLoading.length} routes missing loading states`,
        routes: missingLoading.slice(0, 10),
        fix: 'Add loading.tsx or Suspense boundaries',
      });
    } else if (routesWithDataFetch > 0) {
      this.results.passed.push({ title: 'All data routes have loading states', category: 'ux' });
    }
  }

  async checkErrorStates(files) {
    let routesWithDataFetch = 0;
    let routesWithError = 0;
    const missingError = [];

    for (const file of files) {
      if (!file.includes('/app/') || (!file.endsWith('page.tsx') && !file.endsWith('page.jsx'))) continue;
      
      const content = await fs.readFile(file, 'utf8');
      const relativePath = path.relative(this.projectRoot, file);
      const dir = path.dirname(file);
      
      const hasDataFetch = /fetch|useSWR|useQuery|createClient.*from/.test(content);
      
      if (hasDataFetch) {
        routesWithDataFetch++;
        
        const errorPath = path.join(dir, 'error.tsx');
        const hasErrorFile = await fs.access(errorPath).then(() => true).catch(() => false);
        const hasErrorState = /error|isError|ErrorBoundary|catch/.test(content);
        
        if (hasErrorFile || hasErrorState) {
          routesWithError++;
        } else {
          missingError.push(relativePath);
        }
      }
    }

    if (missingError.length > 0) {
      this.results.warnings.push({
        category: 'ux',
        severity: 'warning',
        title: `${missingError.length} routes missing error handling`,
        routes: missingError.slice(0, 10),
        fix: 'Add error.tsx or try-catch with error UI',
      });
    } else if (routesWithDataFetch > 0) {
      this.results.passed.push({ title: 'All data routes have error handling', category: 'ux' });
    }
  }

  async checkMetaTags(files) {
    const missingMeta = [];

    for (const file of files) {
      if (!file.endsWith('page.tsx') && !file.endsWith('page.jsx')) continue;
      if (file.includes('(') || file.includes('_')) continue; // Skip route groups/private
      
      const content = await fs.readFile(file, 'utf8');
      const relativePath = path.relative(this.projectRoot, file);
      
      const hasMetadata = /export\s+(const\s+)?metadata|generateMetadata/.test(content);
      
      if (!hasMetadata) {
        missingMeta.push(relativePath);
      }
    }

    if (missingMeta.length > 0) {
      this.results.warnings.push({
        category: 'seo',
        severity: 'warning',
        title: `${missingMeta.length} pages missing metadata`,
        pages: missingMeta.slice(0, 10),
        fix: 'Add export const metadata or generateMetadata()',
      });
    } else {
      this.results.passed.push({ title: 'All pages have metadata', category: 'seo' });
    }
  }

  async checkAuthProtection(files) {
    const publicPages = [];
    const protectedPages = [];

    for (const file of files) {
      if (!file.endsWith('page.tsx') && !file.endsWith('page.jsx')) continue;
      
      const content = await fs.readFile(file, 'utf8');
      const relativePath = path.relative(this.projectRoot, file);
      
      const hasAuthCheck = /useSession|getServerSession|auth\(\)|createClient|supabase.*auth|redirect.*login/i.test(content);
      const isAuthPage = /login|signup|sign-in|sign-up|auth|forgot|reset/i.test(relativePath);
      const isPublicPage = /landing|home|about|pricing|blog|terms|privacy/i.test(relativePath);
      
      if (!hasAuthCheck && !isAuthPage && !isPublicPage) {
        publicPages.push(relativePath);
      } else if (hasAuthCheck) {
        protectedPages.push(relativePath);
      }
    }

    if (publicPages.length > 0) {
      this.results.warnings.push({
        category: 'security',
        severity: 'warning',
        title: `${publicPages.length} pages may need auth protection`,
        pages: publicPages.slice(0, 10),
        fix: 'Add authentication checks to protected routes',
      });
    }
    
    if (protectedPages.length > 0) {
      this.results.passed.push({ title: `${protectedPages.length} pages have auth checks`, category: 'security' });
    }
  }

  async checkFormValidation(files) {
    const formsWithoutValidation = [];

    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      const relativePath = path.relative(this.projectRoot, file);
      
      const hasForm = /<form|useForm|handleSubmit|onSubmit/.test(content);
      const hasValidation = /zod|yup|validate|validation|required|pattern|min|max/.test(content);
      
      if (hasForm && !hasValidation) {
        formsWithoutValidation.push(relativePath);
      }
    }

    if (formsWithoutValidation.length > 0) {
      this.results.warnings.push({
        category: 'ux',
        severity: 'warning',
        title: `${formsWithoutValidation.length} forms may lack validation`,
        files: formsWithoutValidation.slice(0, 10),
        fix: 'Add form validation with Zod or similar',
      });
    } else {
      this.results.passed.push({ title: 'Forms have validation', category: 'ux' });
    }
  }

  async checkTypeScriptAny(files) {
    let count = 0;
    const fileList = [];

    for (const file of files) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
      
      const content = await fs.readFile(file, 'utf8');
      const relativePath = path.relative(this.projectRoot, file);
      const matches = content.match(/:\s*any(?=\s|;|,|\)|>)/g);
      
      if (matches) {
        count += matches.length;
        fileList.push({ file: relativePath, count: matches.length });
      }
    }

    if (count > 0) {
      this.results.warnings.push({
        category: 'code-quality',
        severity: 'warning',
        title: `${count} uses of TypeScript "any"`,
        files: fileList.slice(0, 5),
        fix: 'Replace with specific types',
      });
    } else {
      this.results.passed.push({ title: 'No TypeScript "any" types', category: 'code-quality' });
    }
  }

  async checkEmptyHandlers(files) {
    let count = 0;

    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      const matches = content.match(/onClick\s*=\s*\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/g);
      if (matches) count += matches.length;
    }

    if (count > 0) {
      this.results.warnings.push({
        category: 'ux',
        severity: 'warning',
        title: `${count} empty click handlers`,
        fix: 'Implement handlers or remove elements',
      });
    } else {
      this.results.passed.push({ title: 'No empty handlers', category: 'ux' });
    }
  }

  async checkImageAlts(files) {
    let count = 0;

    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      const imgWithoutAlt = content.match(/<img(?![^>]*alt=)[^>]*>/g);
      const nextImageWithoutAlt = content.match(/<Image(?![^>]*alt=)[^>]*>/g);
      
      if (imgWithoutAlt) count += imgWithoutAlt.length;
      if (nextImageWithoutAlt) count += nextImageWithoutAlt.length;
    }

    if (count > 0) {
      this.results.warnings.push({
        category: 'a11y',
        severity: 'warning',
        title: `${count} images without alt text`,
        fix: 'Add descriptive alt attributes',
      });
    } else {
      this.results.passed.push({ title: 'All images have alt text', category: 'a11y' });
    }
  }

  calculateScore() {
    const blockerPenalty = this.results.blockers.length * 15;
    const warningPenalty = this.results.warnings.length * 5;
    const passedBonus = this.results.passed.length * 3;
    
    this.results.score = Math.max(0, Math.min(100, 100 - blockerPenalty - warningPenalty + Math.min(passedBonus, 20)));
    
    // Determine ship readiness
    if (this.results.blockers.length > 0) {
      this.results.status = 'blocked';
      this.results.message = 'Blockers must be fixed before shipping';
    } else if (this.results.warnings.length > 10) {
      this.results.status = 'needs-work';
      this.results.message = 'Too many warnings for production';
    } else if (this.results.warnings.length > 5) {
      this.results.status = 'almost-ready';
      this.results.message = 'Review warnings before shipping';
    } else {
      this.results.status = 'ready';
      this.results.message = 'Ready to ship!';
    }
  }

  getQuickFixes() {
    return [
      { id: 'remove-console', title: 'Remove all console statements', command: 'find-replace', pattern: 'console.log' },
      { id: 'add-loading', title: 'Generate loading.tsx for all routes', command: 'generate-loading' },
      { id: 'add-error', title: 'Generate error.tsx for all routes', command: 'generate-error' },
      { id: 'add-metadata', title: 'Generate metadata for all pages', command: 'generate-metadata' },
    ];
  }
}

export default ProductionReadinessAnalyzer;
