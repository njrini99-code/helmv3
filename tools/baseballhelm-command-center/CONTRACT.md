# Mode module contract — BaseballHelm Ultracode Command Center

Every Agent City **mode** is one ES module at `tools/baseballhelm-command-center/modes/<id>.js`,
served over HTTP by the local command-center server and dynamically imported by `app.js`.

## The one rule

```js
export function render(ctx) {
  // build DOM with ctx.h / ctx.ui, return ONE root node
  return ctx.h("div", { class: "stack" }, /* ...sections */);
}
export const meta = { label: "…", district: "…" }; // optional
```

- `render(ctx)` **must return a single DOM node** (or a Promise of one). `app.js` clears `#mode-root` and appends it.
- **Do NOT import `app.js`** (avoids a cycle). Use the helpers handed to you on `ctx`.
- **Vanilla only.** No npm, no CDN, no external fonts/network. Pure DOM via `ctx.h`.
- **Prefer text children** (`ctx.h("span", {}, value)`); never put telemetry into the `html:` prop (XSS-safe).
- **Cream/green, no black.** Use the shared classes / tokens only. If you truly need mode-specific CSS,
  inject it once, idempotently: `if (!document.getElementById("st-<id>")) document.head.append(ctx.h("style",{id:"st-<id>"}, css))`.
- **Honest states required.** Empty → `ctx.ui.empty(...)`. Never fake data, never fake progress, never invent token counts.
- Start the node with `ctx.ui.modeHead({ glyph, title, sub, actions })` then sections in panels/grids.

## `ctx` shape

| field | type | notes |
|---|---|---|
| `ctx.state` | object | aggregate from `/api/state` — see below |
| `ctx.events` | array | chronological asc; each `{id,ts,type,agent,packet,title,detail,severity,source}` |
| `ctx.repo` | object | `{ branch, dirty:[{status,path}], changed_files:[], diffstat:string, last_commit:string }` |
| `ctx.replay` | object | `{ cursor, speed, filters, ... }` (timeline = `ctx.events`) |
| `ctx.artifacts` | array | `[{id,type,title,path,url,summary,created_at}]` |
| `ctx.h` | fn | hyperscript `h(tag, props?, ...children)` — `class,style(obj),dataset(obj),on<Event>(fn),html` |
| `ctx.ui` | object | component lib (below) — **use these for consistency** |
| `ctx.fmt` | object | `time(iso) ago(iso) pct(n) num(n) date(iso)` |
| `ctx.go(id, args?)` | fn | navigate to another mode (e.g. `ctx.go("control-tower")`) |
| `ctx.log(evt)` | fn | POST a build event `{type,agent,packet,title,detail,severity}` |
| `ctx.refresh()` | fn | re-fetch + re-render everything |
| `ctx.weightedProgress(packets)` / `ctx.weightedConfidence(packets)` | fn | weighted % |
| `ctx.MODES` | array | `[{id,label,icon}]` |

## `ctx.state` (aggregate)

```
{ product, mission, phase, repo_path, branch, url, permission_mode,
  task0_gate:{status,verified,verified_at}, read_order:[...], definition_of_done:[...],
  forbidden_scope:[...], honest_states:{tests,migrations,product_files}, started_at, updated_at,
  agents:[ {id,name,role,district,status,focus:[],files_touched:[],tables_touched:[],routes_touched:[],
            tests:{passed,failed,not_run},risk_events,queue_depth,heartbeat,last_update,notes} ],   // 13
  packets:[ {id,title,weight,owner_lane,status,district,checklist:{...12 booleans},
             completion_percent,confidence_percent,stage,blocked_reason,updated_at} ],               // 20
  risks:{ rules:{...}, cards:[ {id,level,category,title,status,description,affected_paths:[],
            command,checkpoint_ref,timestamp,mitigation} ] },
  qa:{ updated_at, checks:[ {id,command,status,passed,failed,last_run,note} ], honest_states:{...} },
  decisions:[ {id,title,decision,rationale,alternatives:[],agent,impact,created_at} ],
  artifacts:[...], handoff:{ status, read_order:[], next_actions:[], notes:[{ts,text}] },
  repo:{...}, counts:{ agents,packets,events,risks,decisions } }
```

Status vocab — agents/packets: `active | planned | blocked | done | idle`.
qa check status: `not_run | running | passed | failed`. risk level: `low | medium | high | critical`.

## `ctx.ui` component library (returns DOM nodes)

- `ui.modeHead({glyph,title,sub,actions})` — the page header (use it first)
- `ui.panel({title,glyph,sub,actions,body,lift,span})` — a card; `body` = node | array
- `ui.stat({label,value,sub,tone})` — big metric tile; tone: `ok|risk|warn|info`
- `ui.badge(text,tone)` — tone: `ok|active|warn|risk|critical|idle|info`
- `ui.pill(text,{dot,tone})` · `ui.dot(state)` state: `ok|warn|risk|critical|idle|info`
- `ui.progress(percent,{tone,label,right})` tone: `gold|clay`
- `ui.empty({glyph,title,hint})` · `ui.loading(text)` · `ui.error(title,detail)`
- `ui.kv(k,v)` · `ui.section(title,right)` · `ui.grid(cols,childrenArray)` cols: `c2|c3|c4|auto`
- `ui.rows(children)` · `ui.listRow(children)`
- `ui.district({name,status,active,count,tone,meta,onClick})` — a city building tile
- `ui.crate({title,meta,state})` state: `done|blocked|''` — a factory conveyor crate
- `ui.eventRow(evt)` · `ui.riskCard(risk)` · `ui.heartbeat(active)`

Useful raw classes: `city / districts / district`, `conveyor / lane-col / crate`, `radar / blip`,
`diamond / base`, `tl / node` (timeline), `panel`, `grid c2|c3|c4|auto`, `stack`, `row between center wrap`,
`muted mono truncate right`, `scroll-y maxh-280 maxh-360`.

## Each mode's job (build the district view that matches its name)

`mission-control` reference is in `modes/mission-control.js` — match its structure/quality.
Always degrade to honest empty/loading states when a slice of data is missing.
