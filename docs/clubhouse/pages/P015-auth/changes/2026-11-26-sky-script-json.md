# P015-auth — Changelog

## 2026-11-26 — Sign-in sky script: its data escaped for an inline script (security alerts)

```text
Design package: none (security fix, no visual change)
PR/commit: agent/security-alerts-20261126
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- The sky keyframes written into the sign in's boot script go through scriptJson, which escapes `<`, `>`, `/` and the two line separators (CodeQL js/bad-code-sanitization), so data can never close the script tag.
- The keyframes hold only numbers and colours, so the boot script is byte for byte the same. Nothing the user sees changes.
