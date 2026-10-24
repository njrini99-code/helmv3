# 2026-10-24 — Settings: a refused save focuses the field to fix

## 2026-10-24 — Focus moves to the field a refused save names

```text
Design package: none (Clubhouse A+ handoff, section 0.4 Settings: "the first invalid field getting focus")
PR/commit:      agent/aplus-lane-d
Contract IDs:   CH-8101, CH-8102, CH-8103, CH-8104, CH-8105, CH-8106, CH-8107
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Every Account problem names its field: the name fields (CH-8101, CH-8102),
  New email (CH-8103, CH-8104) and the three password fields (CH-8105 to
  CH-8107), with the ids the desktop card and the phone sheet share.
- A refused Send confirmation or Update password, on desktop and in the phone
  sheets, puts focus on that field (`focusProblemField`, parts.tsx). Cmd or
  Ctrl S on a card whose draft is invalid focuses the field instead of doing
  nothing.
- The password field a problem names is marked invalid: on desktop it says the
  problem too, as Team's fields do; on the phone the Problem line under the
  card keeps the words.

### Why

- A refused save left focus on the button, so VoiceOver read nothing new and
  the person had to find the field.

### Verification

- settings.test › CH-8103 and CH-8104, CH-8105 to CH-8107 (focus and
  aria-invalid), CH-8101 (Cmd S focuses the name), 81901 CH-8107 on the phone.
