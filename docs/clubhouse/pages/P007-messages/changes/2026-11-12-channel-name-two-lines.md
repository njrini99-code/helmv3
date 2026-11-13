# 2026-11-12 — messages

## 2026-11-12 — The team chat's name takes two lines instead of being cut (W18)

```text
Design package: none (preview walk fix, PREVIEW_ISSUES.md W18)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     Announcements' fold row keeps its own shape (see Why)
```

### Changed

- The team channel's row carries `is-channel`; its name may wrap to two lines
  (rail and phone inbox) instead of ending in
  an ellipsis. Every other row keeps one line.

### Why

- Nick's walk (W18): "Demo University Golf — …" was cut in the list.
- Not changed: the Announcements row. It is the approved fold (a disclosure that
  opens the posts, hence the chevron) from
  `design-refresh/messages`, not a conversation row. Making it a plain row is a
  design call for the owner.

### Verification

- `screens/messages/__tests__/channel-row-name.test.tsx`: the class on the
  channel row only, and both sheets' two-line clamp.
- Messages suite: 36 files, 347 tests, exit 0.
