import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

const outDir = join(process.cwd(), 'docs/operations/generated');
mkdirSync(outDir, { recursive: true });

const connectionString = process.env.PROD_AUDIT_DATABASE_URL || process.env.DATABASE_URL;
const startedAt = new Date().toISOString();
const findings = [];

function addFinding(partial) {
  findings.push({
    severity: 'P2',
    confidence: 'medium',
    ...partial,
  });
}

async function main() {
  if (!connectionString) {
    addFinding({
      id: 'PROD-DB-AUDIT-NO-URL',
      severity: 'P3',
      confidence: 'high',
      title: 'Production DB audit skipped because no read-only database URL was provided',
      evidence: ['Set PROD_AUDIT_DATABASE_URL to a read-only connection string.'],
    });
    return writeReports();
  }

  const sql = postgres(connectionString, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
    prepare: false,
  });

  try {
    await sql`set statement_timeout = '10s'`;
    await sql`set default_transaction_read_only = on`;

    const rlsOff = await sql`
      select schemaname, tablename
      from pg_tables
      where schemaname = 'public'
        and (
          tablename like 'golf_%'
          or tablename like 'baseball_%'
          or tablename in ('users', 'profiles', 'teams', 'organizations')
        )
        and not rowsecurity
      order by tablename
    `;
    for (const row of rlsOff) {
      addFinding({
        id: `PROD-RLS-OFF-${row.tablename}`,
        severity: 'P0',
        confidence: 'high',
        title: `Customer table ${row.tablename} does not have RLS enabled`,
        evidence: [`${row.schemaname}.${row.tablename}`],
      });
    }

    const missingPk = await sql`
      select n.nspname as schema_name, c.relname as table_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_index i on i.indrelid = c.oid and i.indisprimary
      where n.nspname = 'public'
        and c.relkind = 'r'
        and i.indrelid is null
      order by c.relname
    `;
    for (const row of missingPk) {
      addFinding({
        id: `PROD-MISSING-PK-${row.table_name}`,
        severity: 'P1',
        confidence: 'high',
        title: `Table ${row.table_name} has no primary key`,
        evidence: [`${row.schema_name}.${row.table_name}`],
      });
    }

    const unsafeDefiners = await sql`
      select n.nspname as schema_name, p.proname as function_name
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef
        and not exists (
          select 1
          from unnest(coalesce(p.proconfig, array[]::text[])) cfg
          where cfg like 'search_path=%'
        )
      order by p.proname
    `;
    for (const row of unsafeDefiners) {
      addFinding({
        id: `PROD-UNSAFE-DEFINER-${row.function_name}`,
        severity: 'P1',
        confidence: 'high',
        title: `SECURITY DEFINER function ${row.function_name} lacks fixed search_path`,
        evidence: [`${row.schema_name}.${row.function_name}`],
      });
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  writeReports();
}

function writeReports() {
  const report = {
    generated_at: startedAt,
    read_only: true,
    finding_count: findings.length,
    findings,
  };
  writeFileSync(join(outDir, 'prod-db-audit-findings.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(
    join(outDir, 'prod-db-audit-report.md'),
    [
      '# Production Read-Only DB Audit',
      '',
      `Generated: ${startedAt}`,
      '',
      `Findings: ${findings.length}`,
      '',
      ...findings.map((finding) => `- **${finding.severity}** ${finding.id}: ${finding.title}`),
      '',
    ].join('\n'),
  );
  console.log(`Production read-only DB audit complete: ${findings.length} findings.`);
}

main().catch((error) => {
  addFinding({
    id: 'PROD-DB-AUDIT-FAILED',
    severity: 'P1',
    confidence: 'high',
    title: 'Production DB audit failed before completion',
    evidence: [error instanceof Error ? error.message : String(error)],
  });
  writeReports();
  process.exit(1);
});
