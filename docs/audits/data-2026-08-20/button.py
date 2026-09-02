"""For every never-written table that HAS an insert path, ask: can a user reach it?

The insert lives inside some exported server action. The action is only
reachable if a .tsx component imports and calls it. So:

    table -> file containing the insert -> enclosing exported symbol
          -> is that symbol imported by any .tsx?

Three outcomes, and they need different fixes:
  WIRED      a component calls it. Feature is reachable; nobody has used it.
  NO_CALLER  the action exists and no component calls it. The button was
             never built -- this is the "surface it" list.
  CRON/API   the only caller is a cron route or api route (machine-driven).
"""
import json, os, re, subprocess, collections

REPO = "/Users/ricknini/Downloads/helmv3"
D = "/private/tmp/claude-501/-Users-ricknini-Downloads-helmv3/8e5b742f-c08d-4e21-9903-2ee0dc10af84/scratchpad"

files = [f for f in subprocess.run(["git", "-C", REPO, "ls-files", "src"],
                                   capture_output=True, text=True).stdout.split("\n") if f]
src = {f: open(os.path.join(REPO, f), encoding="utf-8", errors="ignore").read()
       for f in files if f.endswith((".ts", ".tsx"))}
tsx = {f: t for f, t in src.items()
       if f.endswith(".tsx") and "__tests__" not in f and ".test." not in f}

EXPORT = re.compile(r"^export\s+(?:async\s+)?function\s+(\w+)|^export\s+const\s+(\w+)", re.M)


def enclosing_export(text: str, pos: int):
    """Nearest exported symbol declared at or before `pos`."""
    best = None
    for m in EXPORT.finditer(text):
        if m.start() > pos:
            break
        best = next(g for g in m.groups() if g)
    return best


rows = json.load(open(D + "/uimap3.json"))
out = []
for r in rows:
    if not r["insert_sites"]:
        continue
    n = r["table"]
    actions = set()
    for rel in r["insert_sites"]:
        f = "src/" + rel if not rel.startswith("src/") else rel
        if f not in src:
            continue
        text = src[f]
        for m in re.finditer(
            r"(?:from|fromUntyped)\([^)]*['\"]" + re.escape(n) + r"['\"]\s*\)", text
        ):
            win = text[m.end():m.end() + 400]
            if re.search(r"\.(insert|upsert)\s*\(", win):
                sym = enclosing_export(text, m.start())
                if sym:
                    actions.add((f, sym))
    callers = collections.defaultdict(list)
    for f, sym in actions:
        pat = re.compile(r"(?<![A-Za-z0-9_])" + re.escape(sym) + r"(?![A-Za-z0-9_])")
        for cf, ct in src.items():
            if cf == f or sym not in ct or not pat.search(ct):
                continue
            if "__tests__" in cf or ".test." in cf:
                continue
            callers[sym].append(cf)
    tsx_callers = {s: [c for c in v if c.endswith(".tsx")] for s, v in callers.items()}
    api_callers = {s: [c for c in v if "/api/" in c] for s, v in callers.items()}
    any_tsx = any(tsx_callers.values())
    any_api = any(api_callers.values())
    verdict = "WIRED_TO_UI" if any_tsx else ("MACHINE_ONLY" if any_api else "NO_CALLER")
    out.append(dict(table=n, reads=r["reads"], verdict=verdict,
                    actions=[f"{f.replace('src/','')}::{s}" for f, s in sorted(actions)],
                    tsx=[c.replace("src/", "") for v in tsx_callers.values() for c in v][:3]))

json.dump(out, open(D + "/button.json", "w"), indent=1)
by = collections.Counter(o["verdict"] for o in out)
print("verdicts:", dict(by), "\n")
for v in ("NO_CALLER", "MACHINE_ONLY", "WIRED_TO_UI"):
    sel = [o for o in out if o["verdict"] == v]
    print(f"=== {v}  ({len(sel)}) ===")
    for o in sorted(sel, key=lambda x: -x["reads"]):
        print(f"  {o['table']:42s} reads={o['reads']:>8}  {'; '.join(o['actions'][:2])}")
    print()
