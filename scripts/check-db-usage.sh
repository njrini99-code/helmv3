#!/bin/bash

# Quick script to verify database table usage matches database.ts
# This checks for:
# 1. Tables used with type assertions that are now in database.ts
# 2. Tables referenced that don't exist in database.ts

echo "🔍 Checking database table usage against database.ts..."
echo ""

# Extract all table names from database.ts
TABLES_IN_TYPES=$(grep -E "^\s+[a-z_]+:\s+\{" src/lib/types/database.ts | sed 's/:.*//' | tr -d ' ' | sort)

echo "📊 Tables in database.ts:"
echo "$TABLES_IN_TYPES" | head -20
echo ""

# Find tables used with type assertions
echo "🔎 Finding type assertions that can be removed:"
echo ""

grep -rn "as never\|as PendingMigrationTable" src --include="*.ts" --include="*.tsx" | while IFS=: read -r file line content; do
  # Extract table name using sed instead of grep -P
  table=$(echo "$content" | sed -n "s/.*\.from(['\"]\([^'\"]*\)['\"]).*/\1/p")
  
  if [ ! -z "$table" ]; then
    # Check if table exists in database.ts
    if echo "$TABLES_IN_TYPES" | grep -q "^${table}$"; then
      echo "✨ $file:$line - '$table' can now use proper types (remove 'as never' or 'as PendingMigrationTable')"
    else
      echo "⚠️  $file:$line - '$table' still needs type assertion (not in database.ts)"
    fi
  fi
done

echo ""
echo "✅ Check complete!"
echo ""
echo "💡 To verify types match your code, run: npm run typecheck"
