# AUTONOMOUS TASK - ACT IMMEDIATELY

⚠️ You are in AUTONOMOUS mode. Do NOT ask questions. Do NOT seek clarification. Make your best judgment and EDIT THE FILE NOW.

## Task: Fix ts-any-type

**File:** `/Users/ricknini/Downloads/helmv3/src/src/app/baseball/(public)/program/[id]/page.tsx`
**Line:** 99

## Problem
Using "any" type - loses type safety

## Why This Matters
`any` defeats TypeScript's purpose - it disables type checking, allows bugs to slip through, and makes refactoring dangerous because the compiler can't catch mistakes.

**Impact if not fixed:** Runtime errors, harder debugging, no autocomplete in IDE

**How to fix `any` type:**
1. Look at how the variable is used in the code
2. Infer the correct type from usage (e.g., if from Supabase, use generated types from @/lib/types)
3. Replace `: any` with the specific type
4. If unsure, use `unknown` instead of `any`
5. For callbacks: `(item: any)` → `(item: PlayerRound)`
6. For arrays: `any[]` → `Player[]`

## Previous Successful Fixes (same issue type)
- ../../src/app/golf/(dashboard)/dashboard/tasks/page.tsx
- ../../src/app/golf/(dashboard)/dashboard/classes/page.tsx
- ../../src/app/baseball/(public)/program/[id]/page.tsx

## Instructions

1. Read the file: `/Users/ricknini/Downloads/helmv3/src/src/app/baseball/(public)/program/[id]/page.tsx`
2. Find and fix the issue at line 99
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
