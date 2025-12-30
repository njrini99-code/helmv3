# HelmDev - Claude Code Instructions

> This file tells Claude Code how to work with HelmDev tasks.

## When You See a HelmDev Task

If you're asked to read `.helmdev/tasks/current-task.md`, this is an automated task from HelmDev. Follow these steps:

### 1. Read ALL Context Files First

Before making any changes, read these files in order:

```
.helmdev/context/task-context.md      # Task details
.helmdev/context/related-files.md     # Related code
.helmdev/context/patterns.md          # CRITICAL - Follow these patterns
.helmdev/context/memory.md            # What worked/failed before
.helmdev/context/style-guide.md       # Code style
.helmdev/context/project-overview.md  # Project structure
```

### 2. Follow the Patterns

The `patterns.md` file shows exactly how code is written in this codebase. **Match these patterns exactly:**

- Component structure
- Form handling patterns
- Data fetching patterns
- Error handling patterns
- Styling conventions

### 3. Learn from Memory

The `memory.md` file shows:
- What approaches have worked before
- What approaches have failed (avoid these!)
- Key insights about this codebase

### 4. Make the Fix

After understanding the context:
1. Make the changes as described in the task
2. Follow the style guide
3. Use patterns from the codebase
4. Add proper error handling
5. Test mentally that it will work

### 5. Verify Your Work

Before completing:
- [ ] Code compiles (`npm run build` or `npx tsc --noEmit`)
- [ ] No new lint warnings
- [ ] Matches existing patterns
- [ ] Follows style guide

### 6. Create Result File

When done, create `.helmdev/results/[TASK_ID].json`:

```json
{
  "taskId": "[from task file]",
  "status": "completed",
  "filesModified": ["list/of/modified/files.tsx"],
  "summary": "Brief description of what you changed",
  "approach": "The approach you used",
  "issues": [],
  "suggestions": []
}
```

## Important Rules

1. **Never hallucinate** - Only reference code that actually exists
2. **Match patterns exactly** - Consistency is critical
3. **Learn from memory** - Avoid approaches that failed before
4. **Be thorough** - Don't leave partial implementations
5. **Follow style** - Match the existing code style exactly

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (dashboard)/       # Dashboard routes (route group)
│   ├── api/               # API routes
│   └── ...
├── components/            # Reusable components
│   ├── ui/               # shadcn/ui components
│   └── ...
├── lib/                   # Utilities
└── types/                 # TypeScript types
```

## Common Patterns in This Codebase

### Client Components
```tsx
'use client'

import { useState } from 'react'

export function Component() {
  const [state, setState] = useState()
  return <div>...</div>
}
```

### Server Components (Async)
```tsx
export default async function Page() {
  const data = await getData()
  return <div>{data}</div>
}
```

### Form Handling
Uses React Hook Form + Zod:
```tsx
const { register, handleSubmit } = useForm({
  resolver: zodResolver(schema),
})
```

### UI Components
Uses shadcn/ui:
```tsx
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
```

### Styling
Uses Tailwind CSS with cn() utility:
```tsx
import { cn } from '@/lib/utils'

<div className={cn('base-classes', condition && 'conditional-classes')}>
```

## Questions?

If something is unclear:
1. Check the context files again
2. Look at similar files in the codebase for patterns
3. If truly stuck, ask for clarification

---

*HelmDev sends comprehensive context with every task. Trust the context files.*
