# Auth paper token — Changelog

## 2026-11-18 — Sign up's paper gradient is one token

```text
Design package: none
PR/commit: agent/clubhouse-polish-fixes (#2586)
Contract IDs: none
Actions: none
Data impact: none (styles only; no visual change)
Held items: none
```

Sign up's opaque ivory paper (phone and desktop panes, P015 D1) was the same
three-stop gradient written twice in
`onboard.css`. It is now `--ch-ox-paper` in `tokens.css`, and the raw-colour
baseline for onboard.css falls from 144 to 139.
That clears the raw-colour ratchet failure that was already on main.
