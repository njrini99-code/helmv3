# P016-tournaments — Changelog

## 2026-11-26 — Pasted results: cell markup stripped in one pass (security alerts)

```text
Design package: none (security fix, no visual change)
PR/commit: agent/security-alerts-20261126
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- A pasted results table's cells are turned into text by a one-pass scanner instead of repeated regex deletion (CodeQL js/incomplete-multi-character-sanitization). A tag split around another can no longer reassemble; script and style bodies are dropped, a line break reads as a space, and no bracket survives.
- Well-formed tables read exactly as before. Nothing the user sees changes.
