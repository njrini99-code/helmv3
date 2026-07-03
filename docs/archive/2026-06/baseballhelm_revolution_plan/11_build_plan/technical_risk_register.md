# Technical Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Schema drift | Broken data access | Regenerate Supabase types and add migration ledger checks |
| Permission leaks | Trust/privacy loss | RLS tests and capability checks |
| Import bad data | Corrupt player records | Preview, validation, rollback, audit logs |
| AI hallucination | Bad coach decisions | Source citations, confidence, guardrails |
| Scope creep | No shippable Phase 1 | Defer recruiting/advanced video/compliance |
