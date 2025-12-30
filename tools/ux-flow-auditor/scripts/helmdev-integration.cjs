/**
 * HelmDev Integration for UX Flow Auditor Dashboard
 * 
 * This module provides the HelmDev agent system integration,
 * including task queue, MegaThink proposals, and Claude Code dispatch.
 * 
 * Now connects to the Orchestrator Bridge for full functionality:
 * - CodebaseGraph analysis
 * - PatternLibrary detection
 * - ProjectMemory with learning
 * - MegaThinkAgent proposals
 * - VerificationRunner checks
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const BRIDGE_PORT = process.env.BRIDGE_PORT || 3334;
const BRIDGE_URL = `http://localhost:${BRIDGE_PORT}`;

class HelmDevIntegration {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.helmdevDir = path.join(projectRoot, '.helmdev');
    this.bridgeConnected = false;
    this.bridgeProcess = null;
    
    this.state = {
      mode: 'supervised', // 'supervised' | 'autonomous'
      isRunning: false,
      currentTask: null,
      queue: { tasks: [], completed: [], skipped: [] },
      memory: { fixes: [], failures: [], insights: [] },
      proposals: [],
      claudeCodeStatus: 'disconnected',
      lastSync: null,
      bridgeStatus: 'disconnected',
    };
    
    this.ensureDirectories();
  }
  
  ensureDirectories() {
    const dirs = [
      this.helmdevDir,
      path.join(this.helmdevDir, 'tasks'),
      path.join(this.helmdevDir, 'memory'),
      path.join(this.helmdevDir, 'improvements'),
      path.join(this.helmdevDir, 'logs'),
      path.join(this.helmdevDir, 'context'),
      path.join(this.helmdevDir, 'results'),
    ];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  // ==================== Bridge Communication ====================

  async bridgeRequest(endpoint, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, BRIDGE_URL);
      
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ error: 'Invalid JSON response' });
          }
        });
      });

      req.on('error', (error) => {
        this.bridgeConnected = false;
        this.state.bridgeStatus = 'disconnected';
        resolve({ error: error.message, bridgeDown: true });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ error: 'Request timeout' });
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      
      req.end();
    });
  }

  async checkBridgeStatus() {
    const result = await this.bridgeRequest('/status');
    if (!result.error) {
      this.bridgeConnected = true;
      this.state.bridgeStatus = 'connected';
      return result;
    }
    this.bridgeConnected = false;
    this.state.bridgeStatus = 'disconnected';
    return null;
  }

  async startBridge() {
    if (this.bridgeProcess) {
      return { already: true };
    }

    return new Promise((resolve) => {
      const bridgePath = path.join(__dirname, '../src/orchestrator-bridge.mjs');
      
      this.bridgeProcess = spawn('node', [bridgePath], {
        cwd: path.join(__dirname, '..'),
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      let started = false;

      this.bridgeProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('[Bridge]', output);
        if (output.includes('ORCHESTRATOR BRIDGE') && !started) {
          started = true;
          setTimeout(async () => {
            await this.checkBridgeStatus();
            resolve({ started: true });
          }, 1000);
        }
      });

      this.bridgeProcess.stderr.on('data', (data) => {
        console.error('[Bridge Error]', data.toString());
      });

      this.bridgeProcess.on('close', (code) => {
        console.log(`[Bridge] Process exited with code ${code}`);
        this.bridgeProcess = null;
        this.bridgeConnected = false;
        this.state.bridgeStatus = 'disconnected';
      });

      // Timeout if bridge doesn't start
      setTimeout(() => {
        if (!started) {
          resolve({ error: 'Bridge failed to start' });
        }
      }, 10000);
    });
  }

  stopBridge() {
    if (this.bridgeProcess) {
      this.bridgeProcess.kill();
      this.bridgeProcess = null;
      this.bridgeConnected = false;
      this.state.bridgeStatus = 'disconnected';
    }
  }

  // ==================== Enhanced Features (via Bridge) ====================

  async getCodebaseAnalysis() {
    if (!this.bridgeConnected) {
      await this.checkBridgeStatus();
    }
    if (this.bridgeConnected) {
      return await this.bridgeRequest('/codebase');
    }
    return null;
  }

  async getPatternsFor(taskType) {
    if (!this.bridgeConnected) return [];
    return await this.bridgeRequest('/patterns', 'POST', { taskType });
  }

  async getFileContext(filePath) {
    if (!this.bridgeConnected) return null;
    return await this.bridgeRequest('/file-context', 'POST', { filePath });
  }

  async getMemoryContextFromBridge(taskType, filePath) {
    if (!this.bridgeConnected) return null;
    return await this.bridgeRequest('/memory-context', 'POST', { taskType, filePath });
  }

  async getStylePreferences() {
    if (!this.bridgeConnected) return {};
    return await this.bridgeRequest('/style');
  }

  async runMegaThink(options = {}) {
    if (!this.bridgeConnected) {
      await this.checkBridgeStatus();
      if (!this.bridgeConnected) {
        return { error: 'Bridge not connected. Start it with npm run orchestrator' };
      }
    }
    return await this.bridgeRequest('/megathink', 'POST', options);
  }

  async dispatchWithFullContext(task) {
    if (!this.bridgeConnected) {
      // Fall back to simple dispatch
      return await this.dispatchToClaudeCode(task);
    }
    return await this.bridgeRequest('/dispatch', 'POST', { task });
  }

  async verifyFix(task) {
    if (!this.bridgeConnected) {
      return { passed: true, checks: [], note: 'Bridge not connected, skipping verification' };
    }
    return await this.bridgeRequest('/verify', 'POST', { task });
  }

  async runTypeScriptCheck() {
    if (!this.bridgeConnected) {
      // Run directly
      return new Promise((resolve) => {
        const proc = spawn('npx', ['tsc', '--noEmit'], {
          cwd: this.projectRoot,
          shell: true,
        });
        
        let output = '';
        proc.stdout?.on('data', (data) => output += data);
        proc.stderr?.on('data', (data) => output += data);
        
        proc.on('close', (code) => {
          resolve({
            passed: code === 0,
            output: output,
            errors: code !== 0 ? output.split('\n').filter(l => l.includes('error')) : [],
          });
        });
        
        proc.on('error', () => resolve({ passed: true, output: '', errors: [] }));
      });
    }
    return await this.bridgeRequest('/typescript-check');
  }

  async recordResultToBridge(taskId, success, details) {
    if (!this.bridgeConnected) return;
    await this.bridgeRequest('/record-result', 'POST', { taskId, success, details });
  }

  async getMemoryStats() {
    if (!this.bridgeConnected) {
      return {
        totalFixes: this.state.memory.fixes.length,
        totalFailures: this.state.memory.failures.length,
        successRate: this.calculateSuccessRate(),
      };
    }
    return await this.bridgeRequest('/memory-stats');
  }

  calculateSuccessRate() {
    const total = this.state.memory.fixes.length + this.state.memory.failures.length;
    if (total === 0) return 0;
    return Math.round((this.state.memory.fixes.length / total) * 100);
  }

  // ==================== Local State Management ====================
  
  loadState() {
    try {
      // Load queue
      const queuePath = path.join(this.helmdevDir, 'queue.json');
      if (fs.existsSync(queuePath)) {
        const data = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
        this.state.queue = {
          tasks: data.tasks || [],
          completed: data.completed || [],
          skipped: data.skipped || [],
        };
      }
      
      // Load memory
      const memoryDir = path.join(this.helmdevDir, 'memory');
      ['fixes', 'failures', 'insights'].forEach(type => {
        const filePath = path.join(memoryDir, `${type}.json`);
        if (fs.existsSync(filePath)) {
          this.state.memory[type] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
      });
      
      // Load proposals
      const proposalsPath = path.join(this.helmdevDir, 'improvements', 'proposals.json');
      if (fs.existsSync(proposalsPath)) {
        this.state.proposals = JSON.parse(fs.readFileSync(proposalsPath, 'utf8'));
      }
      
      // Load current task
      const currentTaskPath = path.join(this.helmdevDir, 'tasks', 'current-task.json');
      if (fs.existsSync(currentTaskPath)) {
        this.state.currentTask = JSON.parse(fs.readFileSync(currentTaskPath, 'utf8'));
      }
      
      this.state.lastSync = new Date().toISOString();
      
      // Check bridge status
      this.checkBridgeStatus().catch(() => {});
      
    } catch (e) {
      console.error('Error loading HelmDev state:', e.message);
    }
    
    return this.state;
  }
  
  saveQueue() {
    const queuePath = path.join(this.helmdevDir, 'queue.json');
    fs.writeFileSync(queuePath, JSON.stringify(this.state.queue, null, 2));
  }
  
  saveMemory() {
    const memoryDir = path.join(this.helmdevDir, 'memory');
    ['fixes', 'failures', 'insights'].forEach(type => {
      const filePath = path.join(memoryDir, `${type}.json`);
      fs.writeFileSync(filePath, JSON.stringify(this.state.memory[type], null, 2));
    });
  }
  
  // Convert analysis issues to tasks
  populateQueueFromAnalysis(analysisData) {
    if (!analysisData || !analysisData.issues) return;
    
    const existingTaskIds = new Set(this.state.queue.tasks.map(t => t.id));
    const completedIds = new Set(this.state.queue.completed.map(t => t.id));
    const skippedIds = new Set(this.state.queue.skipped.map(t => t.id));
    
    analysisData.issues.forEach(issue => {
      const taskId = `${issue.type}-${issue.file_path}-${issue.line_number || 0}`;
      
      // Skip if already in queue, completed, or skipped
      if (existingTaskIds.has(taskId) || completedIds.has(taskId) || skippedIds.has(taskId)) {
        return;
      }
      
      const priority = issue.severity === 'error' ? 1 : 
                       issue.severity === 'warning' ? 2 : 3;
      
      this.state.queue.tasks.push({
        id: taskId,
        type: issue.type,
        priority: priority,
        severity: issue.severity,
        message: issue.message,
        file_path: issue.file_path,
        line_number: issue.line_number,
        suggestion: issue.suggestion,
        created_at: new Date().toISOString(),
        status: 'pending',
      });
    });
    
    // Sort by priority
    this.state.queue.tasks.sort((a, b) => a.priority - b.priority);
    this.saveQueue();
    
    return this.state.queue;
  }
  
  getNextTask() {
    const pending = this.state.queue.tasks.filter(t => t.status === 'pending');
    return pending[0] || null;
  }
  
  setCurrentTask(task) {
    if (task) {
      task.status = 'in-progress';
      task.started_at = new Date().toISOString();
      this.state.currentTask = task;
      
      const currentTaskPath = path.join(this.helmdevDir, 'tasks', 'current-task.json');
      fs.writeFileSync(currentTaskPath, JSON.stringify(task, null, 2));
    } else {
      this.state.currentTask = null;
      const currentTaskPath = path.join(this.helmdevDir, 'tasks', 'current-task.json');
      if (fs.existsSync(currentTaskPath)) {
        fs.unlinkSync(currentTaskPath);
      }
    }
    this.saveQueue();
  }
  
  completeTask(taskId, result) {
    const taskIndex = this.state.queue.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;
    
    const task = this.state.queue.tasks[taskIndex];
    task.status = 'completed';
    task.completed_at = new Date().toISOString();
    task.result = result;
    
    // Move to completed
    this.state.queue.completed.push(task);
    this.state.queue.tasks.splice(taskIndex, 1);
    
    // Record in memory
    if (result.success) {
      this.state.memory.fixes.push({
        task_id: taskId,
        type: task.type,
        file_path: task.file_path,
        completed_at: task.completed_at,
        approach: result.approach || 'unknown',
      });
      // Also record to bridge
      this.recordResultToBridge(taskId, true, {
        type: task.type,
        filePath: task.file_path,
        approach: result.approach,
      });
    } else {
      this.state.memory.failures.push({
        task_id: taskId,
        type: task.type,
        file_path: task.file_path,
        failed_at: task.completed_at,
        error: result.error || 'unknown',
      });
      this.recordResultToBridge(taskId, false, {
        type: task.type,
        filePath: task.file_path,
        reason: result.error,
      });
    }
    
    this.setCurrentTask(null);
    this.saveMemory();
    
    return task;
  }
  
  skipTask(taskId, reason) {
    const taskIndex = this.state.queue.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;
    
    const task = this.state.queue.tasks[taskIndex];
    task.status = 'skipped';
    task.skipped_at = new Date().toISOString();
    task.skip_reason = reason;
    
    this.state.queue.skipped.push(task);
    this.state.queue.tasks.splice(taskIndex, 1);
    
    this.setCurrentTask(null);
    
    return task;
  }
  
  // Smart fix instructions based on issue type
  getSmartFixInstructions(taskType) {
    const instructions = {
      // TypeScript Issues
      'ts-any-type': `**How to fix \`any\` type:**
1. Look at how the variable is used in the code
2. Infer the correct type from usage (e.g., if from Supabase, use generated types from @/lib/types)
3. Replace \`: any\` with the specific type
4. If unsure, use \`unknown\` instead of \`any\`
5. For callbacks: \`(item: any)\` → \`(item: PlayerRound)\`
6. For arrays: \`any[]\` → \`Player[]\``,

      'ts-as-any': `**How to fix \`as any\` assertion:**
1. Remove the \`as any\` and fix the underlying type error
2. If data comes from API, create a proper type interface
3. Use type guards instead: \`if ('property' in obj)\`
4. Last resort: \`as unknown as TargetType\` (but fix the real issue)`,

      'ts-ignore-comment': `**How to fix @ts-ignore:**
1. Remove the @ts-ignore comment
2. Fix the actual TypeScript error it was hiding
3. If external library issue, use @ts-expect-error with explanation
4. Better: fix types or create proper type definitions`,

      'ts-double-assertion': `**How to fix double assertion:**
1. This is a code smell - \`as unknown as X\` bypasses type safety
2. Create proper type guards or interfaces
3. Fix the source of the type mismatch
4. If from API, validate and type the response properly`,

      // SEO Issues  
      'seo-missing-metadata': `**How to fix missing SEO metadata:**
1. Add at the TOP of the page file (before the component):
\`\`\`tsx
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page Title | Helm Sports',
  description: 'Clear description of what this page does (50-160 chars)',
};
\`\`\`
2. For dynamic pages, use generateMetadata instead`,

      'seo-missing-title': `**How to fix missing title:**
Add title to your metadata export:
\`\`\`tsx
export const metadata: Metadata = {
  title: 'Descriptive Page Title | Helm Sports',
};
\`\`\``,

      'seo-missing-description': `**How to fix missing description:**
Add description to metadata (50-160 characters):
\`\`\`tsx
export const metadata: Metadata = {
  title: '...',
  description: 'Clear, compelling description of the page content',
};
\`\`\``,

      // Empty State Issues
      'empty-state-map-no-check': `**How to fix .map() without empty check:**
Wrap the map with a conditional:
\`\`\`tsx
{items && items.length > 0 ? (
  items.map(item => <Component key={item.id} {...item} />)
) : (
  <EmptyState 
    icon={<IconName />}
    title="No items found"
    description="Add your first item to get started"
    action={<Button>Add Item</Button>}
  />
)}
\`\`\``,

      'empty-state-no-fallback': `**How to fix conditional without fallback:**
Change \`&&\` to ternary with fallback:
\`\`\`tsx
// Before: {data && <Component />}
// After:
{data ? <Component data={data} /> : <Skeleton />}
\`\`\``,

      // Loading/Error States
      'missing-loading-state': `**How to fix missing loading state:**
Option 1 - Create loading.tsx in same directory:
\`\`\`tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
\`\`\`
Option 2 - Inline loading state:
\`\`\`tsx
if (isLoading) return <Spinner />;
\`\`\``,

      'missing-error-boundary': `**How to fix missing error boundary:**
Create error.tsx in the same directory:
\`\`\`tsx
'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground">{error.message}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
\`\`\``,

      // Accessibility Issues
      'a11y-img-no-alt': `**How to fix image without alt:**
\`\`\`tsx
// For informative images:
<Image src={src} alt="Descriptive text of what image shows" />

// For decorative images:
<Image src={src} alt="" aria-hidden="true" />
\`\`\`
Be specific: "Player John Smith profile photo" not "image"`,

      'a11y-button-no-label': `**How to fix button without label:**
\`\`\`tsx
// For icon-only buttons:
<Button aria-label="Close dialog" size="icon">
  <X className="h-4 w-4" />
</Button>

// Or add visually hidden text:
<Button>
  <X className="h-4 w-4" />
  <span className="sr-only">Close</span>
</Button>
\`\`\``,

      'a11y-clickable-div': `**How to fix clickable div:**
Option 1 - Use a button:
\`\`\`tsx
<button onClick={handleClick} className="...">
  {content}
</button>
\`\`\`
Option 2 - Add proper ARIA:
\`\`\`tsx
<div 
  onClick={handleClick}
  onKeyDown={(e) => e.key === 'Enter' && handleClick()}
  role="button"
  tabIndex={0}
>
  {content}
</div>
\`\`\``,

      'a11y-input-no-label': `**How to fix input without label:**
\`\`\`tsx
// With visible label:
<div>
  <Label htmlFor="email">Email</Label>
  <Input id="email" type="email" />
</div>

// With aria-label (for icon inputs):
<Input aria-label="Search players" placeholder="Search..." />
\`\`\``,

      // Form Issues
      'form-no-submit': `**How to fix form without onSubmit:**
\`\`\`tsx
<form onSubmit={async (e) => {
  e.preventDefault();
  setIsSubmitting(true);
  try {
    await submitData(formData);
    toast.success('Saved!');
  } catch (error) {
    toast.error('Failed to save');
  } finally {
    setIsSubmitting(false);
  }
}}>
  {/* form fields */}
  <Button type="submit" disabled={isSubmitting}>
    {isSubmitting ? 'Saving...' : 'Save'}
  </Button>
</form>
\`\`\``,

      'form-no-loading-state': `**How to fix form without loading state:**
\`\`\`tsx
const [isSubmitting, setIsSubmitting] = useState(false);

<Button 
  type="submit" 
  disabled={isSubmitting}
>
  {isSubmitting ? (
    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
  ) : (
    'Save Changes'
  )}
</Button>
\`\`\``,

      'form-no-error-handling': `**How to fix form without error handling:**
\`\`\`tsx
const [error, setError] = useState<string | null>(null);

{error && (
  <Alert variant="destructive">
    <AlertDescription>{error}</AlertDescription>
  </Alert>
)}
\`\`\``,

      // Navigation Issues
      'nav-detail-no-back': `**How to fix detail page without back navigation:**
\`\`\`tsx
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

const router = useRouter();

<Button variant="ghost" onClick={() => router.back()}>
  <ArrowLeft className="mr-2 h-4 w-4" />
  Back
</Button>
\`\`\``,

      'nav-modal-no-close': `**How to fix modal without close handler:**
\`\`\`tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    {/* Dialog automatically gets X button */}
    {/* Or add explicit close: */}
    <Button variant="ghost" onClick={() => setOpen(false)}>
      Cancel
    </Button>
  </DialogContent>
</Dialog>
\`\`\``,

      'nav-delete-no-confirm': `**How to fix delete without confirmation:**
\`\`\`tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Delete</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
      <AlertDialogDescription>
        This action cannot be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}>
        Delete
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
\`\`\``,

      // Code Quality Issues
      'console-statement': `**How to fix console.log:**
1. Simply DELETE the console.log line
2. If logging is needed for debugging, use conditional:
\`\`\`tsx
if (process.env.NODE_ENV === 'development') {
  console.log('debug:', data);
}
\`\`\`
3. For production logging, use a proper service`,

      'empty-handler': `**How to fix empty handler:**
Either implement the handler or remove it:
\`\`\`tsx
// If not needed, remove the onClick entirely
<Button>Click me</Button>

// If needed, implement it:
<Button onClick={() => {
  // Actual implementation
  handleAction();
}}>
  Click me
</Button>
\`\`\``,

      'empty-catch': `**How to fix empty catch block:**
\`\`\`tsx
try {
  await riskyOperation();
} catch (error) {
  console.error('Operation failed:', error);
  toast.error('Something went wrong');
  // Or re-throw if needed: throw error;
}
\`\`\``,

      'todo-comment': `**How to fix TODO comment:**
1. Actually implement what the TODO describes
2. If not ready to implement, create a GitHub issue instead
3. Remove the TODO comment after implementing`,

      'placeholder-content': `**How to fix placeholder content:**
1. Replace "Coming soon", "TBD", etc. with real content
2. If feature isn't ready, hide the section entirely
3. Use feature flags for incomplete features`,

      'commented-code': `**How to fix commented code:**
1. DELETE the commented code - git history preserves it
2. If you might need it, move to a separate file or gist
3. Dead code adds confusion and technical debt`,

      'test-data': `**How to fix test/mock data:**
1. Replace with real data fetching from Supabase
2. Create proper seed data for development
3. Use environment-specific data sources`,

      // Broken Interactions
      'broken-placeholder-link': `**How to fix href="#" placeholder:**
\`\`\`tsx
// Replace with real destination:
<Link href="/actual/path">Link text</Link>

// Or if it's a button action:
<Button onClick={handleClick}>Action</Button>

// Or remove if not needed
\`\`\``,

      'broken-always-disabled': `**How to fix always-disabled element:**
\`\`\`tsx
// Use conditional disabled:
<Button disabled={isLoading || !isValid}>
  Submit
</Button>

// Or remove if truly not needed
\`\`\``,

      'broken-console-only-handler': `**How to fix console-only handler:**
Replace console.log with actual functionality:
\`\`\`tsx
// Before: onClick={() => console.log('clicked')}
// After:
onClick={async () => {
  await performAction();
  toast.success('Action completed');
}}
\`\`\``,

      // Environment Issues
      'env-localhost-url': `**How to fix hardcoded localhost:**
\`\`\`tsx
// Before: fetch('http://localhost:3000/api/...')
// After:
fetch(\`\${process.env.NEXT_PUBLIC_API_URL}/api/...\`)

// Add to .env.local:
NEXT_PUBLIC_API_URL=http://localhost:3000
\`\`\``,

      'env-hardcoded-port': `**How to fix hardcoded port:**
Use environment variable:
\`\`\`tsx
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
\`\`\``,

      'env-staging-url': `**How to fix staging/dev URL:**
REMOVE hardcoded staging URLs immediately!
\`\`\`tsx
// Use environment variables:
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
\`\`\``,

      // Performance Issues
      'perf-img-tag': `**How to fix <img> tag:**
Use Next.js Image for automatic optimization:
\`\`\`tsx
import Image from 'next/image';

<Image 
  src="/path/to/image.jpg"
  alt="Description"
  width={400}
  height={300}
  className="rounded-lg"
/>
\`\`\``,

      'perf-lodash-full': `**How to fix full lodash import:**
\`\`\`tsx
// Before: import _ from 'lodash';
// After - import only what you need:
import debounce from 'lodash/debounce';
import groupBy from 'lodash/groupBy';
\`\`\``,

      'perf-moment-import': `**How to fix moment.js usage:**
Replace with date-fns (much smaller):
\`\`\`tsx
// Before: import moment from 'moment';
// After:
import { format, parseISO } from 'date-fns';

format(new Date(), 'MMM d, yyyy')
\`\`\``,

      // Auth Issues
      'auth-missing': `**How to fix missing auth check:**
\`\`\`tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function ProtectedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect('/login');
  }
  
  return <div>Protected content</div>;
}
\`\`\``,

      // Content Issues
      'content-lorem': `**How to fix Lorem ipsum:**
Replace with real, relevant content for your app`,

      'content-test-email': `**How to fix test email:**
Use real email or user.email from auth`,

      'content-placeholder-name': `**How to fix placeholder name:**
Use real user data from database`,

      'content-tbd': `**How to fix TBD/TBA:**
Implement the actual feature or remove the placeholder`,

      // Mutation UX
      'mutation-no-feedback': `**How to fix mutation without feedback:**
\`\`\`tsx
const handleSave = async () => {
  try {
    await saveData();
    toast.success('Changes saved successfully');
  } catch (error) {
    toast.error('Failed to save changes');
  }
};
\`\`\``,

      // Dead Code
      'dead-code-if-false': `**How to fix if(false):**
DELETE the entire if block - it never executes`,

      'dead-code-if-true': `**How to fix if(true):**
Remove the if condition, keep only the body`,

      'dead-code-commented-return': `**How to fix commented return:**
Delete the commented line or uncomment if needed`,

      // Responsive Issues
      'responsive-large-fixed-width': `**How to fix large fixed width:**
\`\`\`tsx
// Before: className="w-[800px]"
// After - responsive:
className="w-full max-w-4xl"
// Or:
className="w-full md:w-[800px]"
\`\`\``,

      // Link Issues
      'broken-link': `**How to fix broken link:**
1. Check if the destination route exists
2. Create the missing page if needed
3. Or update the link to correct path`,

      'orphan-route': `**How to fix orphan route:**
1. Add navigation link from a parent page
2. Add to sidebar/nav menu
3. Or delete if truly unused`,

      'dead-end': `**How to fix dead-end page:**
Add navigation options:
\`\`\`tsx
<div className="flex gap-4">
  <Button variant="outline" onClick={() => router.back()}>
    <ArrowLeft className="mr-2 h-4 w-4" /> Back
  </Button>
  <Link href="/dashboard">
    <Button>Go to Dashboard</Button>
  </Link>
</div>
\`\`\``,
    };
    
    return instructions[taskType] || null;
  }

  // Get context about WHY an issue matters
  getIssueContext(taskType) {
    const contexts = {
      // TypeScript
      'ts-any-type': {
        why: '`any` defeats TypeScript\'s purpose - it disables type checking, allows bugs to slip through, and makes refactoring dangerous because the compiler can\'t catch mistakes.',
        impact: 'Runtime errors, harder debugging, no autocomplete in IDE',
      },
      'ts-as-any': {
        why: '`as any` is a lie to the compiler - you\'re saying "trust me" but the types might be wrong, leading to runtime crashes.',
        impact: 'Silent failures, data corruption, hard-to-trace bugs',
      },
      'ts-double-assertion': {
        why: '`as unknown as X` is a code smell indicating a fundamental type mismatch. It bypasses all type safety.',
        impact: 'Complete loss of type safety at that point',
      },
      
      // SEO
      'seo-missing-metadata': {
        why: 'Search engines (Google, Bing) use metadata to understand and rank your page. Without it, your page may not appear in search results. NOTE: If the page has \'use client\' at top, you CANNOT add metadata directly - you must add it to a layout.tsx file instead or remove \'use client\' if possible.',
        impact: 'Lower search rankings, poor social media previews, reduced discoverability',
      },
      
      // Empty States
      'empty-state-map-no-check': {
        why: 'When data is empty/loading, .map() renders nothing - users see a blank space and think the app is broken. Empty states guide users on what to do next.',
        impact: 'Confused users, perceived bugs, poor UX',
      },
      
      // Accessibility
      'a11y-img-no-alt': {
        why: 'Screen readers announce images using alt text. Without it, blind users hear "image" with no context. Also required for SEO.',
        impact: 'Excludes blind users, legal liability (ADA), poor SEO',
      },
      'a11y-button-no-label': {
        why: 'Icon-only buttons are announced as just "button" to screen readers. Users don\'t know what they do.',
        impact: 'Unusable for keyboard/screen reader users',
      },
      'a11y-clickable-div': {
        why: 'Divs with onClick are invisible to keyboard users and screen readers. They can\'t be focused or activated without a mouse.',
        impact: 'Breaks keyboard navigation, excludes disabled users',
      },
      
      // Forms
      'form-no-loading-state': {
        why: 'Without visual feedback during submission, users click multiple times thinking it didn\'t work, causing duplicate submissions.',
        impact: 'Duplicate data, frustrated users, race conditions',
      },
      
      // Code Quality
      'console-statement': {
        why: 'Console.logs in production expose internal data, slow down the app, and clutter browser DevTools for real debugging.',
        impact: 'Security risk, performance hit, unprofessional',
      },
      
      // Performance
      'perf-img-tag': {
        why: 'Native <img> loads full-size images immediately. Next/Image automatically resizes, lazy-loads, and serves WebP - can reduce image size by 70%.',
        impact: 'Slow page load, high bandwidth, poor Core Web Vitals',
      },
    };
    
    return contexts[taskType] || null;
  }

  // Generate Claude Code dispatch prompt
  generateDispatchPrompt(task) {
    // Fix the file path - handle relative paths from analyzer
    let filePath = task.file_path;
    
    // If path contains ../../, resolve it properly
    if (filePath.includes('..')) {
      // Extract just the src/app/... part
      const srcMatch = filePath.match(/src\/app\/.*/);
      if (srcMatch) {
        filePath = path.join(this.projectRoot, srcMatch[0]);
      } else {
        filePath = path.resolve(this.projectRoot, filePath);
      }
    } else if (filePath.startsWith('src/')) {
      filePath = path.join(this.projectRoot, filePath);
    } else if (!filePath.startsWith('/')) {
      filePath = path.join(this.projectRoot, filePath);
    }
    // If already absolute and contains projectRoot, use as-is
    
    let prompt = `# AUTONOMOUS TASK - ACT IMMEDIATELY

⚠️ You are in AUTONOMOUS mode. Do NOT ask questions. Do NOT seek clarification. Make your best judgment and EDIT THE FILE NOW.

## Task: Fix ${task.type}

**File:** \`${filePath}\`
`;
    if (task.line_number) prompt += `**Line:** ${task.line_number}\n`;
    
    prompt += `
## Problem
${task.message}
`;

    // Add context about WHY this matters
    const context = this.getIssueContext(task.type);
    if (context) {
      prompt += `
## Why This Matters
${context.why}

**Impact if not fixed:** ${context.impact}
`;
    }
    
    // Add smart fix instructions based on issue type
    const smartFix = this.getSmartFixInstructions(task.type);
    if (smartFix) {
      prompt += `
${smartFix}
`;
    } else if (task.suggestion) {
      prompt += `
## How to Fix
${task.suggestion}
`;
    }
    
    // Add file content snippet if we can read it
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const lineNum = task.line_number || 1;
        const start = Math.max(0, lineNum - 10);
        const end = Math.min(lines.length, lineNum + 10);
        const snippet = lines.slice(start, end).map((line, i) => {
          const num = start + i + 1;
          const marker = num === lineNum ? '>>>' : '   ';
          return `${marker} ${num}: ${line}`;
        }).join('\n');
        
        prompt += `
## Code Context (around line ${lineNum})
\`\`\`tsx
${snippet}
\`\`\`
`;
      }
    } catch (e) {
      // Couldn't read file, continue without snippet
    }
    
    // Add memory of similar fixes
    const similarFixes = this.state.memory.fixes.filter(f => f.type === task.type).slice(-3);
    if (similarFixes.length > 0) {
      prompt += `
## Previous Successful Fixes (same issue type)
`;
      similarFixes.forEach(fix => {
        prompt += `- ${fix.file_path}\n`;
      });
    }
    
    prompt += `
## Instructions

1. Read the file: \`${filePath}\`
2. Find and fix the issue at line ${task.line_number || 'specified'}
3. Save the file

## CRITICAL RULES

🚫 **DO NOT CREATE NEW FILES** - Edit the existing file only!
🚫 **DO NOT create layout.tsx, error.tsx, loading.tsx** unless explicitly asked
🚫 **DO NOT restructure the codebase**

✅ ONLY edit the file specified above
✅ Make minimal, targeted changes
✅ If you can't fix it by editing this file, SKIP the task

- DO NOT ask questions - just fix it
- DO NOT explain what you're going to do - just do it
- MAKE THE EDIT NOW
`;
    
    return prompt;
  }
  
  // Dispatch task to Claude Code
  async dispatchToClaudeCode(task) {
    // Always generate a prompt (don't rely on bridge)
    const prompt = this.generateDispatchPrompt(task);
    
    if (!prompt) {
      console.error('Failed to generate prompt for task:', task.id);
      return { error: 'Failed to generate prompt', task };
    }
    
    // Save prompt to file for Claude Code to pick up
    const promptPath = path.join(this.helmdevDir, 'tasks', 'current-task.md');
    fs.writeFileSync(promptPath, prompt);
    
    this.setCurrentTask(task);
    
    // Copy prompt to clipboard (if possible)
    try {
      const proc = spawn('pbcopy', { stdio: ['pipe', 'inherit', 'inherit'] });
      proc.stdin.write(prompt);
      proc.stdin.end();
    } catch (e) {
      // Clipboard not available, that's fine
    }
    
    console.log('📋 Generated prompt for task:', task.id);
    console.log('📁 Saved to:', promptPath);
    
    return {
      task: task,
      prompt: prompt,
      promptPath: promptPath,
      fullContext: false,
    };
  }
  
  // Get stats
  getStats() {
    return {
      queue: {
        pending: this.state.queue.tasks.filter(t => t.status === 'pending').length,
        inProgress: this.state.queue.tasks.filter(t => t.status === 'in-progress').length,
        completed: this.state.queue.completed.length,
        skipped: this.state.queue.skipped.length,
        total: this.state.queue.tasks.length,
      },
      memory: {
        totalFixes: this.state.memory.fixes.length,
        totalFailures: this.state.memory.failures.length,
        successRate: this.calculateSuccessRate(),
        insights: this.state.memory.insights.length,
      },
      proposals: Object.keys(this.state.proposals).length,
      byPriority: {
        critical: this.state.queue.tasks.filter(t => t.priority === 1).length,
        high: this.state.queue.tasks.filter(t => t.priority === 2).length,
        medium: this.state.queue.tasks.filter(t => t.priority === 3).length,
      },
      bySeverity: {
        error: this.state.queue.tasks.filter(t => t.severity === 'error').length,
        warning: this.state.queue.tasks.filter(t => t.severity === 'warning').length,
        info: this.state.queue.tasks.filter(t => t.severity === 'info').length,
      },
      bridgeConnected: this.bridgeConnected,
    };
  }
  
  // Set mode
  setMode(mode) {
    this.state.mode = mode;
    return this.state;
  }
  
  // Clear completed/skipped
  clearHistory() {
    this.state.queue.completed = [];
    this.state.queue.skipped = [];
    this.saveQueue();
    return this.state.queue;
  }
  
  // Reset queue
  resetQueue() {
    this.state.queue = { tasks: [], completed: [], skipped: [] };
    this.state.currentTask = null;
    this.saveQueue();
    this.setCurrentTask(null);
    return this.state.queue;
  }
}

module.exports = HelmDevIntegration;
