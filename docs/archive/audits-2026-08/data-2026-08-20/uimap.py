"""Map every never-written table to whether a UI route can actually reach it.

The question this answers is the one the row counts cannot: a table with 0
inserts is either (a) a feature nobody built a screen for, or (b) a feature
with a screen that nobody can complete. Those need opposite fixes, and the
difference is whether a `page.tsx` transitively reaches the table.

Reachability is a BFS over the real import graph, seeded from route entry
points (page.tsx / layout.tsx / route.ts). Dynamic `await import('...')` is
followed too — Next.js server actions are frequently loaded that way, and a
graph that ignores it declares live code dead.
"""
import json, os, re, subprocess, collections

REPO = "/Users/ricknini/Downloads/helmv3"
D = "/private/tmp/claude-501/-Users-ricknini-Downloads-helmv3/8e5b742f-c08d-4e21-9903-2ee0dc10af84/scratchpad"

files = [f for f in subprocess.run(["git", "-C", REPO, "ls-files", "src"],
                                   capture_output=True, text=True).stdout.split("\n") if f]
src = {f: open(os.path.join(REPO, f), encoding="utf-8", errors="ignore").read()
       for f in files if f.endswith((".ts", ".tsx"))}

IMPORT = re.compile(r"""(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]""")


def resolve(spec: str, importer: str):
    """@/x -> src/x ; relative -> normalised. Try file, then /index."""
    if spec.startswith("@/"):
        base = "src/" + spec[2:]
    elif spec.startswith("."):
        base = os.path.normpath(os.path.join(os.path.dirname(importer), spec))
    else:
        return None
    for cand in (base, base + ".ts", base + ".tsx",
                 base + "/index.ts", base + "/index.tsx"):
        if cand in src:
            return cand
    return None


graph = collections.defaultdict(set)
for f, text in src.items():
    for spec in IMPORT.findall(text):
        t = resolve(spec, f)
        if t:
            graph[f].add(t)

routes = [f for f in src if re.search(r"/(page|layout|route|template|default)\.tsx?$", f)]
seen, stack = set(), list(routes)
route_of = {}
while stack:
    cur = stack.pop()
    if cur in seen:
        continue
    seen.add(cur)
    for nxt in graph[cur]:
        if nxt not in seen:
            route_of.setdefault(nxt, cur)
            stack.append(nxt)

xref = json.load(open(D + "/xref_tables.json"))
never = {n: v for n, v in xref.items() if v["ins"] == 0 and v["live"] == 0}

rows = []
for n, v in never.items():
    pat = re.compile(r"(?<![A-Za-z0-9_])" + re.escape(n) + r"(?![A-Za-z0-9_])")
    touching = [f for f, t in src.items() if n in t and pat.search(t)]
    reachable = [f for f in touching if f in seen]
    page_hits = [f for f in touching if re.search(r"/page\.tsx?$", f)]
    rows.append(dict(table=n, reads=v["reads"], app_refs=v["hits"].get("app", 0),
                     touching=len(touching), reachable=len(reachable),
                     pages=page_hits[:3],
                     reachable_files=[f.replace("src/", "") for f in reachable[:4]],
                     orphan_files=[f.replace("src/", "") for f in touching if f not in seen][:4]))

json.dump(rows, open(D + "/uimap.json", "w"), indent=1)
print(f"route entry points: {len(routes)}   files reachable from a route: {len(seen)}   "
      f"total src ts/tsx: {len(src)}")
print(f"unreachable src files: {len(src) - len(seen)}\n")

wired = [r for r in rows if r["reachable"] > 0]
orphan = [r for r in rows if r["reachable"] == 0 and r["touching"] > 0]
nocode = [r for r in rows if r["touching"] == 0]

print(f"A. NEVER WRITTEN, BUT UI-REACHABLE  ({len(wired)}) "
      f"-- a screen exists and the table stays empty")
for r in sorted(wired, key=lambda x: -x["app_refs"]):
    print(f"  {r['table']:44s} refs={r['app_refs']:>3} reads={r['reads']:>8}  "
          f"{', '.join(r['reachable_files'][:2])}")

print(f"\nB. NEVER WRITTEN, CODE EXISTS, NO ROUTE REACHES IT  ({len(orphan)})")
for r in sorted(orphan, key=lambda x: -x["app_refs"]):
    print(f"  {r['table']:44s} refs={r['app_refs']:>3} reads={r['reads']:>8}  "
          f"{', '.join(r['orphan_files'][:2])}")

print(f"\nC. NEVER WRITTEN, NO SRC CODE AT ALL  ({len(nocode)})")
for r in nocode:
    print(f"  {r['table']:44s} reads={r['reads']:>8}")
