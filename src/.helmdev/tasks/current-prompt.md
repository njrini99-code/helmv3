## Task: Fix empty-state-map-no-check

**File:** ../../src/app/golf/page.tsx
**Line:** 78

**Issue:**
.map() without empty state handling

**Suggested Fix:**
Add: {items.length > 0 ? items.map(...) : <EmptyState />}

**Instructions:**
1. Read the file at ../../src/app/golf/page.tsx
2. Identify and fix the issue described above
3. Ensure the fix follows existing code patterns
4. Run any relevant tests if available
