process.env.PROD_AUDIT_DATABASE_URL = process.env.LOCAL_DB_AUDIT_DATABASE_URL || process.env.DATABASE_URL || process.env.PROD_AUDIT_DATABASE_URL;
await import('../prod-audit/run-readonly-db-audit.mjs');
