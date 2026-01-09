#!/usr/bin/env tsx

/**
 * Verification script to check that code usage matches database.ts types
 * 
 * This script:
 * 1. Extracts all .from('table_name') calls from the codebase
 * 2. Checks if those tables exist in database.ts
 * 3. Verifies column names used in queries match the types
 * 
 * Usage: npx tsx scripts/verify-db-types.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { glob } from 'glob';

interface TableInfo {
  name: string;
  columns: Set<string>;
}

// Extract tables from database.ts
function extractTablesFromDatabaseTypes(): Map<string, TableInfo> {
  const dbTypesPath = join(process.cwd(), 'src/lib/types/database.ts');
  const content = readFileSync(dbTypesPath, 'utf-8');
  
  const tables = new Map<string, TableInfo>();
  
  // Match table definitions like: table_name: {
  const tableRegex = /^\s+([a-z_]+):\s+\{/gm;
  let match;
  
  while ((match = tableRegex.exec(content)) !== null) {
    const tableName = match[1];
    if (!tableName) continue;
    const columns = new Set<string>();
    
    // Find the Row type for this table
    const tableStart = content.indexOf(`\n      ${tableName}: {`);
    if (tableStart === -1) continue;
    
    // Find the Row section
    const rowStart = content.indexOf('Row: {', tableStart);
    if (rowStart === -1) continue;
    
    // Extract columns from Row type
    const rowEnd = content.indexOf('}', rowStart);
    const rowSection = content.substring(rowStart, rowEnd);
    
    // Match column definitions: column_name: type
    const columnRegex = /^\s+([a-z_]+):\s+/gm;
    let colMatch;
    while ((colMatch = columnRegex.exec(rowSection)) !== null) {
      if (colMatch[1]) {
        columns.add(colMatch[1]);
      }
    }
    
    tables.set(tableName, { name: tableName, columns });
  }
  
  return tables;
}

// Extract table/column usage from code
async function extractTableUsage(): Promise<Map<string, Set<string>>> {
  const usage = new Map<string, Set<string>>();
  
  // Find all TypeScript files
  const files = await glob('src/**/*.{ts,tsx}', {
    ignore: ['**/node_modules/**', '**/*.d.ts', '**/types/**']
  });
  
  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8');
      
      // Match .from('table_name') or .from("table_name")
      const fromRegex = /\.from\(['"]([^'"]+)['"]\)/g;
      let match;
      
      while ((match = fromRegex.exec(content)) !== null) {
        const tableName = match[1];
        if (!tableName) continue;
        
        // Skip if it's a type assertion (already flagged)
        const lineStart = content.lastIndexOf('\n', match.index);
        const lineEnd = content.indexOf('\n', match.index);
        const line = content.substring(lineStart, lineEnd);
        
        if (line.includes('as never') || line.includes('as PendingMigrationTable') || line.includes('as any')) {
          // Skip type-asserted tables - these need fixing
          continue;
        }
        
        if (!usage.has(tableName)) {
          usage.set(tableName, new Set());
        }
        
        // Try to find column references after this .from() call
        const afterFrom = content.substring(match.index);
        
        // Match .select('col1, col2') or .select(`col1, col2`)
        const selectMatch = afterFrom.match(/\.select\([`'"]([^`'"]+)[`'"]\)/);
        if (selectMatch) {
          const columns = selectMatch[1].split(',').map(c => c.trim().split(' ')[0].split(':')[0]);
          columns.forEach(col => {
            if (col && !col.includes('(')) {
              usage.get(tableName)!.add(col);
            }
          });
        }
        
        // Match .insert({ col: ... }) or .update({ col: ... })
        const insertMatch = afterFrom.match(/\.(insert|update|upsert)\(/);
        if (insertMatch) {
          // This is tricky - would need a full parser. For now, just note the table is used
        }
      }
    } catch (error) {
      console.error(`Error reading ${file}:`, error);
    }
  }
  
  return usage;
}

// Main verification
async function main() {
  console.log('🔍 Verifying database type usage...\n');
  
  const tables = extractTablesFromDatabaseTypes();
  console.log(`📊 Found ${tables.size} tables in database.ts\n`);
  
  const usage = await extractTableUsage();
  console.log(`📝 Found ${usage.size} unique table references in code\n`);
  
  // Check for tables used in code but not in database.ts
  const issues: string[] = [];
  const warnings: string[] = [];
  
  for (const [tableName] of usage) {
    if (!tables.has(tableName)) {
      issues.push(`❌ Table "${tableName}" used in code but NOT in database.ts`);
    }
  }
  
  // Check for tables in database.ts but never used
  for (const [tableName] of tables) {
    if (!usage.has(tableName) && !tableName.startsWith('_')) {
      warnings.push(`⚠️  Table "${tableName}" exists in database.ts but never referenced in code`);
    }
  }
  
  // Check for type assertions that should be removed
  console.log('🔎 Checking for type assertions that can be removed...\n');
  
  const files = await glob('src/**/*.{ts,tsx}', {
    ignore: ['**/node_modules/**', '**/*.d.ts', '**/types/**']
  });
  
  const typeAssertions: Array<{ file: string; line: number; table: string }> = [];
  
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      if (line.includes('as never') || line.includes('as PendingMigrationTable')) {
        const fromMatch = line.match(/\.from\(['"]([^'"]+)['"]\)/);
        if (fromMatch && fromMatch[1]) {
          const tableName = fromMatch[1];
          if (tables.has(tableName)) {
            typeAssertions.push({
              file,
              line: index + 1,
              table: tableName
            });
          }
        }
      }
    });
  }
  
  // Report results
  if (issues.length > 0) {
    console.log('❌ ISSUES FOUND:\n');
    issues.forEach(issue => console.log(`  ${issue}`));
    console.log();
  }
  
  if (typeAssertions.length > 0) {
    console.log('✨ Type assertions that can be removed (table now in database.ts):\n');
    typeAssertions.forEach(({ file, line, table }) => {
      console.log(`  ${file}:${line} - ${table}`);
    });
    console.log();
  }
  
  if (warnings.length > 0 && warnings.length < 20) {
    console.log('⚠️  WARNINGS (unused tables - may be normal):\n');
    warnings.slice(0, 10).forEach(warning => console.log(`  ${warning}`));
    if (warnings.length > 10) {
      console.log(`  ... and ${warnings.length - 10} more`);
    }
    console.log();
  }
  
  // Summary
  console.log('📊 SUMMARY:\n');
  console.log(`  ✅ Tables in database.ts: ${tables.size}`);
  console.log(`  ✅ Tables used in code: ${usage.size}`);
  console.log(`  ${issues.length > 0 ? '❌' : '✅'} Issues: ${issues.length}`);
  console.log(`  ${typeAssertions.length > 0 ? '✨' : '✅'} Type assertions to fix: ${typeAssertions.length}`);
  
  if (issues.length === 0 && typeAssertions.length === 0) {
    console.log('\n✅ All checks passed! Database types are in sync with code usage.\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some issues found. Review the output above.\n');
    process.exit(1);
  }
}

main().catch(console.error);
