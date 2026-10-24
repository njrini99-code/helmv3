# 2026-10-24 — Settings: the Version row

## 2026-10-24 — Help and legal says which GolfHelm this is

```text
Design package: none (Clubhouse A+ handoff, section 0.4 Settings: "an About row with the app version")
PR/commit:      agent/aplus-lane-d
Contract IDs:   81901
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Help and legal ends with a Version row, on desktop (Account) and on the phone
  root: in the iOS app the app's version and build ("1.4.0 (52)"), then the
  release it runs (the deploy's commit, short); on the web "Build 8860fd3"; an
  unstamped local build says "Web".
- The native version is read through `src/lib/utils/capacitor.ts`
  (`getNativeAppVersion`, a dynamic import of `@capacitor/app` on native only),
  so Clubhouse still calls no Capacitor plugin itself. The first paint is the
  web line the server drew, so hydration matches.

### Why

- A problem report or a support conversation needs to know which build the
  person is on; Settings had no way to tell.

### Verification

- settings/__tests__/app-version.test.tsx (the lines, the stamp, first paint and
  the native answer); settings.test › 81901 root shows the row. Wants an iPhone
  look in the app (the native version comes only from the shell).
