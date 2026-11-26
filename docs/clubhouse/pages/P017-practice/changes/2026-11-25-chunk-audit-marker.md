# P017-practice — Changelog

## 2026-11-25 — Chunk-audit markers on bounded reads (repo tidy 6)

```text
Design package: none (comment-only, no behaviour change)
PR/commit: agent/tidy-6-audits-registry
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- A `// chunk-audit-bounded:` comment now marks reads whose id list is
  bounded by construction, so the Supabase chunk audit stays at its
  baseline instead of being raised. Nothing the user sees changes.
