---
paths:
  - "src/app/**/*.ts"
  - "src/app/**/*.tsx"
  - "src/lib/**/*.ts"
verified: 2026-08-20-mechanical  # paths + table names machine-checked this date (docs:path-drift / docs:schema-drift); PROSE not re-read against code
---

## Code Patterns

### Server Action
```typescript
'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function doThing(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  // ... mutation ...
  revalidatePath('/golf/dashboard');
  return { success: true };
}
```

### Server Component Data Fetching
```typescript
import { createClient } from '@/lib/supabase/server';
export default async function Page() {
  const supabase = await createClient();
  const { data } = await supabase.from('golf_players').select('*').order('last_name');
  return <Component data={data ?? []} />;
}
```

### Client Component
```typescript
'use client';
import { createClient } from '@/lib/supabase/client';
import { useState, useEffect } from 'react';
// ... hooks and interactivity ...
```

---
