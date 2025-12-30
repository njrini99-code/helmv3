/**
 * PatternLibrary - Detects and catalogs patterns used in the codebase
 * 
 * This ensures Claude Code generates code that matches existing patterns,
 * maintaining consistency across the codebase.
 */

export class PatternLibrary {
  constructor(graph) {
    this.graph = graph;
    this.patterns = new Map();
    this.size = 0;
  }

  /**
   * Build the pattern library from codebase analysis
   */
  async build() {
    // Detect component patterns
    this.detectComponentPatterns();
    
    // Detect form patterns
    this.detectFormPatterns();
    
    // Detect data fetching patterns
    this.detectDataFetchingPatterns();
    
    // Detect styling patterns
    this.detectStylingPatterns();
    
    // Detect error handling patterns
    this.detectErrorHandlingPatterns();
    
    // Detect state management patterns
    this.detectStatePatterns();
    
    // Detect UI component patterns
    this.detectUIComponentPatterns();
    
    this.size = this.patterns.size;
    
    return this;
  }

  /**
   * Detect component structure patterns
   */
  detectComponentPatterns() {
    const componentFiles = Array.from(this.graph.files.values())
      .filter(f => f.type === 'component' || f.type === 'page');
    
    // Check for 'use client' pattern
    const clientComponents = componentFiles.filter(f => 
      f.content.includes("'use client'") || f.content.includes('"use client"')
    );
    
    if (clientComponents.length > 0) {
      this.patterns.set('client-component', {
        name: 'Client Component',
        category: 'component-structure',
        description: 'Components that require client-side interactivity use the "use client" directive',
        template: `'use client'

import { useState } from 'react'

export function ComponentName() {
  const [state, setState] = useState()
  
  return (
    <div>
      {/* Interactive content */}
    </div>
  )
}`,
        example: this.extractExample(clientComponents[0]),
        usedIn: clientComponents.map(f => f.path),
        whenToUse: [
          'When using React hooks (useState, useEffect, etc.)',
          'When handling user interactions (onClick, onChange)',
          'When using browser APIs',
        ],
        mistakes: [
          'Adding "use client" to components that don\'t need it',
          'Not using "use client" when using hooks',
        ],
      });
    }

    // Check for async server components
    const asyncComponents = componentFiles.filter(f => 
      /export\s+(default\s+)?async\s+function/.test(f.content) &&
      !f.content.includes('use client')
    );
    
    if (asyncComponents.length > 0) {
      this.patterns.set('async-server-component', {
        name: 'Async Server Component',
        category: 'component-structure',
        description: 'Server components that fetch data directly',
        template: `import { getData } from '@/lib/data'

export default async function PageName() {
  const data = await getData()
  
  return (
    <div>
      {/* Render data */}
    </div>
  )
}`,
        example: this.extractExample(asyncComponents[0]),
        usedIn: asyncComponents.map(f => f.path),
        whenToUse: [
          'When fetching data on the server',
          'When the component doesn\'t need client interactivity',
        ],
        mistakes: [
          'Using async with "use client"',
          'Not handling loading states (use loading.tsx)',
        ],
      });
    }
  }

  /**
   * Detect form patterns
   */
  detectFormPatterns() {
    const formFiles = Array.from(this.graph.files.values())
      .filter(f => f.features.includes('form'));
    
    // React Hook Form pattern
    const rhfFiles = formFiles.filter(f => 
      /useForm|react-hook-form/.test(f.content)
    );
    
    if (rhfFiles.length > 0) {
      const hasZod = rhfFiles.some(f => /zodResolver|zod/.test(f.content));
      
      this.patterns.set('react-hook-form', {
        name: 'React Hook Form with Zod',
        category: 'forms',
        description: 'Form handling with react-hook-form and zod validation',
        template: `'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
})

type FormData = z.infer<typeof schema>

export function MyForm() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    // Handle submission
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('name')} />
      {errors.name && <span>{errors.name.message}</span>}
      
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : 'Submit'}
      </button>
    </form>
  )
}`,
        example: this.extractExample(rhfFiles[0]),
        usedIn: rhfFiles.map(f => f.path),
        whenToUse: [
          'For complex forms with validation',
          'When you need form state management',
          'When you need field-level validation',
        ],
        mistakes: [
          'Not using resolver for schema validation',
          'Forgetting to show error messages',
          'Not disabling submit button during submission',
        ],
      });
    }

    // Server Actions pattern
    const serverActionForms = formFiles.filter(f =>
      /action=\{/.test(f.content) || /'use server'/.test(f.content)
    );
    
    if (serverActionForms.length > 0) {
      this.patterns.set('server-action-form', {
        name: 'Server Action Form',
        category: 'forms',
        description: 'Forms using Next.js Server Actions',
        template: `// actions.ts
'use server'

import { revalidatePath } from 'next/cache'

export async function createItem(formData: FormData) {
  const name = formData.get('name') as string
  
  // Validate and save
  await db.item.create({ data: { name } })
  
  revalidatePath('/items')
}

// form.tsx
import { createItem } from './actions'

export function CreateForm() {
  return (
    <form action={createItem}>
      <input name="name" required />
      <SubmitButton />
    </form>
  )
}`,
        example: this.extractExample(serverActionForms[0]),
        usedIn: serverActionForms.map(f => f.path),
        whenToUse: [
          'For simple forms that submit to the server',
          'When you want progressive enhancement',
          'When the form doesn\'t need complex client-side state',
        ],
        mistakes: [
          'Forgetting to revalidate paths after mutations',
          'Not handling errors properly',
          'Not showing pending states',
        ],
      });
    }
  }

  /**
   * Detect data fetching patterns
   */
  detectDataFetchingPatterns() {
    const files = Array.from(this.graph.files.values());
    
    // SWR pattern
    const swrFiles = files.filter(f => /useSWR/.test(f.content));
    if (swrFiles.length > 0) {
      this.patterns.set('swr', {
        name: 'SWR Data Fetching',
        category: 'data-fetching',
        description: 'Client-side data fetching with SWR',
        template: `'use client'

import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export function DataComponent() {
  const { data, error, isLoading } = useSWR('/api/data', fetcher)
  
  if (isLoading) return <LoadingSkeleton />
  if (error) return <ErrorMessage error={error} />
  
  return <DataDisplay data={data} />
}`,
        example: this.extractExample(swrFiles[0]),
        usedIn: swrFiles.map(f => f.path),
        whenToUse: [
          'For client-side data that updates frequently',
          'When you need automatic revalidation',
          'For real-time data',
        ],
        mistakes: [
          'Not handling loading and error states',
          'Using SWR when server components would work better',
        ],
      });
    }

    // React Query pattern
    const queryFiles = files.filter(f => /useQuery|@tanstack\/react-query/.test(f.content));
    if (queryFiles.length > 0) {
      this.patterns.set('react-query', {
        name: 'React Query',
        category: 'data-fetching',
        description: 'Client-side data fetching with React Query',
        template: `'use client'

import { useQuery } from '@tanstack/react-query'

export function DataComponent() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['items'],
    queryFn: () => fetch('/api/items').then(res => res.json()),
  })
  
  if (isLoading) return <LoadingSkeleton />
  if (error) return <ErrorMessage error={error} />
  
  return <DataDisplay data={data} />
}`,
        example: this.extractExample(queryFiles[0]),
        usedIn: queryFiles.map(f => f.path),
        whenToUse: [
          'For complex client-side data management',
          'When you need caching and background updates',
          'For mutations with optimistic updates',
        ],
        mistakes: [
          'Not wrapping app with QueryClientProvider',
          'Using string queryKeys instead of arrays',
        ],
      });
    }
  }

  /**
   * Detect styling patterns
   */
  detectStylingPatterns() {
    const files = Array.from(this.graph.files.values());
    
    // Tailwind + cn pattern
    const cnFiles = files.filter(f => /\bcn\(/.test(f.content));
    if (cnFiles.length > 0) {
      this.patterns.set('tailwind-cn', {
        name: 'Tailwind with cn() utility',
        category: 'styling',
        description: 'Using the cn() utility for conditional Tailwind classes',
        template: `import { cn } from '@/lib/utils'

interface ButtonProps {
  variant?: 'default' | 'destructive'
  className?: string
}

export function Button({ variant = 'default', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'px-4 py-2 rounded-md font-medium',
        variant === 'default' && 'bg-primary text-white',
        variant === 'destructive' && 'bg-red-500 text-white',
        className
      )}
      {...props}
    />
  )
}`,
        example: this.extractExample(cnFiles[0]),
        usedIn: cnFiles.map(f => f.path),
        whenToUse: [
          'When combining multiple class names conditionally',
          'When creating reusable components with variants',
          'When merging custom className props',
        ],
        mistakes: [
          'Not using cn() when merging class names',
          'Using template literals instead of cn()',
        ],
      });
    }

    // Glassmorphism pattern
    const glassFiles = files.filter(f => 
      /backdrop-blur|bg-.*\/\d+|glass/.test(f.content)
    );
    if (glassFiles.length > 0) {
      this.patterns.set('glassmorphism', {
        name: 'Glassmorphism Effects',
        category: 'styling',
        description: 'Frosted glass visual effects',
        template: `<div className="
  bg-white/80 
  dark:bg-gray-900/80 
  backdrop-blur-xl 
  border border-white/20 
  rounded-xl 
  shadow-xl
">
  {/* Content */}
</div>`,
        example: this.extractExample(glassFiles[0]),
        usedIn: glassFiles.map(f => f.path),
        whenToUse: [
          'For cards and panels that need a premium look',
          'For overlays and modals',
          'For navigation elements',
        ],
        mistakes: [
          'Using backdrop-blur without a semi-transparent background',
          'Overusing the effect causing visual clutter',
        ],
      });
    }
  }

  /**
   * Detect error handling patterns
   */
  detectErrorHandlingPatterns() {
    const files = Array.from(this.graph.files.values());
    
    // Error boundary pattern
    const errorFiles = files.filter(f => f.type === 'error');
    if (errorFiles.length > 0) {
      this.patterns.set('error-boundary', {
        name: 'Error Boundary',
        category: 'error-handling',
        description: 'Next.js error boundary component',
        template: `'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <h2 className="text-xl font-semibold mb-4">Something went wrong!</h2>
      <p className="text-muted-foreground mb-4">{error.message}</p>
      <button onClick={reset} className="btn btn-primary">
        Try again
      </button>
    </div>
  )
}`,
        example: this.extractExample(errorFiles[0]),
        usedIn: errorFiles.map(f => f.path),
        whenToUse: [
          'Every route should have an error boundary',
          'Use different error UI for different sections',
        ],
        mistakes: [
          'Not providing a reset button',
          'Showing technical error details to users',
        ],
      });
    }

    // Toast notifications pattern
    const toastFiles = files.filter(f => /toast\.|sonner|useToast/.test(f.content));
    if (toastFiles.length > 0) {
      this.patterns.set('toast-notifications', {
        name: 'Toast Notifications',
        category: 'error-handling',
        description: 'User feedback with toast notifications',
        template: `import { toast } from 'sonner'

// Success
toast.success('Item created successfully')

// Error
toast.error('Failed to create item')

// With action
toast('Item deleted', {
  action: {
    label: 'Undo',
    onClick: () => undoDelete()
  }
})`,
        example: this.extractExample(toastFiles[0]),
        usedIn: toastFiles.map(f => f.path),
        whenToUse: [
          'After successful mutations',
          'When errors occur',
          'For non-blocking notifications',
        ],
        mistakes: [
          'Not showing feedback after form submissions',
          'Using alerts instead of toasts for non-critical info',
        ],
      });
    }
  }

  /**
   * Detect state management patterns
   */
  detectStatePatterns() {
    const files = Array.from(this.graph.files.values());
    
    // Zustand pattern
    const zustandFiles = files.filter(f => /zustand|create\(/.test(f.content) && /set\s*:/.test(f.content));
    if (zustandFiles.length > 0) {
      this.patterns.set('zustand', {
        name: 'Zustand Store',
        category: 'state-management',
        description: 'Global state management with Zustand',
        template: `import { create } from 'zustand'

interface StoreState {
  items: Item[]
  addItem: (item: Item) => void
  removeItem: (id: string) => void
}

export const useStore = create<StoreState>((set) => ({
  items: [],
  addItem: (item) => set((state) => ({ items: [...state.items, item] })),
  removeItem: (id) => set((state) => ({ 
    items: state.items.filter(i => i.id !== id) 
  })),
}))`,
        example: this.extractExample(zustandFiles[0]),
        usedIn: zustandFiles.map(f => f.path),
        whenToUse: [
          'For global client-side state',
          'When prop drilling becomes unwieldy',
          'For cross-component state sharing',
        ],
        mistakes: [
          'Using Zustand for server state (use React Query instead)',
          'Creating too many small stores',
        ],
      });
    }
  }

  /**
   * Detect UI component patterns
   */
  detectUIComponentPatterns() {
    const files = Array.from(this.graph.files.values());
    
    // shadcn/ui pattern
    const shadcnFiles = files.filter(f => 
      /@\/components\/ui/.test(f.content) || /from ['"]@\/components\/ui/.test(f.content)
    );
    if (shadcnFiles.length > 0) {
      this.patterns.set('shadcn-ui', {
        name: 'shadcn/ui Components',
        category: 'ui-components',
        description: 'Using shadcn/ui component library',
        template: `import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export function MyComponent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Title</CardTitle>
      </CardHeader>
      <CardContent>
        <Input placeholder="Enter value..." />
        <Button>Submit</Button>
      </CardContent>
    </Card>
  )
}`,
        example: this.extractExample(shadcnFiles[0]),
        usedIn: shadcnFiles.map(f => f.path),
        whenToUse: [
          'For all UI components',
          'Consistent with design system',
        ],
        mistakes: [
          'Creating custom components when shadcn has them',
          'Not using the Card component for content sections',
        ],
      });
    }

    // Data table pattern
    const tableFiles = files.filter(f => 
      /DataTable|useReactTable|@tanstack\/react-table/.test(f.content)
    );
    if (tableFiles.length > 0) {
      this.patterns.set('data-table', {
        name: 'Data Table',
        category: 'ui-components',
        description: 'Using TanStack Table for data display',
        template: `import { DataTable } from '@/components/ui/data-table'
import { columns } from './columns'

export function ItemsTable({ data }: { data: Item[] }) {
  return (
    <DataTable 
      columns={columns} 
      data={data}
      searchKey="name"
    />
  )
}`,
        example: this.extractExample(tableFiles[0]),
        usedIn: tableFiles.map(f => f.path),
        whenToUse: [
          'For displaying tabular data',
          'When you need sorting, filtering, or pagination',
        ],
        mistakes: [
          'Using a plain table when DataTable would work better',
          'Not defining proper column accessors',
        ],
      });
    }
  }

  /**
   * Extract a clean example from file content
   */
  extractExample(file) {
    if (!file?.content) return '';
    
    // Try to find a component definition
    const componentMatch = file.content.match(
      /(?:export\s+(?:default\s+)?(?:async\s+)?function\s+\w+|const\s+\w+\s*=\s*(?:\([^)]*\)|[^=])*\s*=>)[^{]*\{[\s\S]{0,500}/
    );
    
    if (componentMatch) {
      return componentMatch[0].slice(0, 500) + '\n  // ...';
    }
    
    return file.content.slice(0, 500) + '\n// ...';
  }

  /**
   * Get relevant patterns for a task type
   */
  getRelevantPatterns(taskType) {
    const relevanceMap = {
      'form': ['react-hook-form', 'server-action-form', 'shadcn-ui', 'toast-notifications'],
      'data-fetching': ['swr', 'react-query', 'async-server-component'],
      'error': ['error-boundary', 'toast-notifications'],
      'component': ['client-component', 'async-server-component', 'shadcn-ui'],
      'styling': ['tailwind-cn', 'glassmorphism'],
      'state': ['zustand', 'client-component'],
      'table': ['data-table', 'shadcn-ui'],
    };
    
    const relevantNames = relevanceMap[taskType] || [];
    const patterns = [];
    
    // Add relevant patterns
    for (const name of relevantNames) {
      if (this.patterns.has(name)) {
        patterns.push(this.patterns.get(name));
      }
    }
    
    // Always include the most common patterns
    const commonPatterns = ['tailwind-cn', 'shadcn-ui'];
    for (const name of commonPatterns) {
      if (this.patterns.has(name) && !relevantNames.includes(name)) {
        patterns.push(this.patterns.get(name));
      }
    }
    
    return patterns;
  }

  /**
   * Get all patterns
   */
  getAllPatterns() {
    return Array.from(this.patterns.values());
  }
}
