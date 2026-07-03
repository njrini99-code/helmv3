# Import History And Rollback

Each import creates `imports`, `import_rows`, and `import_errors`. Store source file hash, created_by, mapping, target table, inserted/updated IDs. Rollback should soft-delete or reverse inserted records where safe.
