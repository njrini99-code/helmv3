# GolfHelm CRM — Master Overhaul Plan

*Fusion of: a 21-agent code audit (12 area maps + 8 dimension audits) and a 10-agent web-research playbook on best-in-class cold-outreach operations. Supersedes the 11-tab shell. 2026-06-17.*

---

## 0. How to read this

Two investigations were run and **fused**, not stapled:

- **The audit** answered *"what's wrong with the CRM we built?"* → structure, IA, mobile, accessibility, multi-user, performance.
- **The research** answered *"how do the best cold-outreach teams actually operate?"* → deliverability, cadence, lead scoring, reply triage, the daily queue. Sourced from Outreach, Salesloft, Apollo, Instantly, Smartlead, Hunter, Woodpecker, Belkins, Google Postmaster, Resend (2024–2026).

The research **overrode the audit in two places**, and those reversals are the most important thing in this document:

1. The audit said *"promote the engagement score to a real lead score."* **Wrong.** A never-contacted cold list has zero engagement signal, and on `.edu` your "engagement" is mostly security-gateway bots. Cold leads must be scored on **fit + deliverability, ~zero engagement**.
2. The audit flagged the missing sequence cron as a *"P0 — engine is dead"* bug. **It's not a bug — it was your intentional human-triggered model.** But the research reframes the cron as a *pacing releaser*: humans build/approve the queue (from phone or desktop); a server cron meters delivery on jittered intervals so 40–50 near-identical emails never burst. That reconciliation is the spine of the new engine.

---

## 1. Executive verdict

The CRM is **two products fighting each other**. Underneath is a sophisticated engine (engagement scoring, sequences, a unified timeline, Resend webhooks). On top is a flat **11-tab, desktop-only, single-admin shell** that hides and scatters it. But the deeper problem the research exposed is that **the outreach *strategy* encoded in the tool is actively working against you**:

- You're **cold-sending from your root product domain** (`helmsportslabs.com`) — one `.edu` spam spike can poison signups/password-resets/billing for paying GolfHelm customers. *Highest-severity gap in the entire review.*
- Your engagement view **scores a coach "hot" off a single millisecond gateway bot-click** (`click_score * 3.0`, hot at `click>0.5`). That's the literal mechanism that made every send re-hit the same ~43 already-emailed coaches instead of the 2,000+ fresh ones.
- You only see **~1,000 of 2,293 coaches** (PostgREST row cap) — every count, funnel, and queue is computed on a partial, wrong dataset.
- The **highest-ROI move in cold email — exactly one follow-up — doesn't exist**, while the tool is built for an 11-tab, no-queue, manual workflow.

**The thesis:** *Reinvent the engine before the chrome.* Move cold to a dedicated, warmed subdomain; rebuild scoring on **fit + replies, never clicks**; make a single **score-ordered "/Today" queue** the operating surface for all three of you; enforce the ≤1/week + dedup + suppression rules **server-side** so phone and desktop can't double-touch; then collapse 11 tabs → 5 destinations, make it mobile-first with **Compose** as a first-class phone flow, and elevate the coach side-panel you love into the universal, accessible click-target.

Current state scores **~3.4/10** across the 8 audited dimensions (worst: multi-user 2, IA 3, mobile/a11y 3). Realistic ceiling for this list: **~115–230 total conversations from 2,300 coaches** at a 5–8% reply rate — a finite, precious set. The whole job is to land your one shot on the best programs, never to "get through the list."

---

## 2. The 7 strategic principles (research) that reframe everything

These are the lens for every decision below. Each is sourced in the research playbook.

1. **Replies are the only trustworthy signal.** ~49–55% of "opens" are Apple-Mail machine fetches; on `.edu`, Mimecast/Proofpoint/Safe-Links auto-click *every* link within milliseconds (Proofpoint: 1 in 7 clicks fire <60s after delivery). **Score and rank on replies; ignore clicks; treat opens as weak-at-best.**
2. **Two touches beat one.** One follow-up roughly *doubles* cumulative replies (Hunter 3.3%→6.8%; Instantly: 42% of all replies come from follow-ups; Belkins +49% on email #2). A 3rd email-only touch falls off a cliff. → *exactly one* break-up + referral follow-up, then retire. *(Conflicts with your "one-touch / 1-per-week" rule — see §8 Decision 1.)*
3. **Separate the cold domain from the product domain.** Cold sends move to `outreach.helmsportslabs.com` (warmed 3–4 weeks); the bare root stays for product/transactional mail + warm reply threads.
4. **Relevance beats personalization tricks.** 8–12 segment templates (division × gender pain), not 2,300 AI icebreakers. Spintax is neutral-to-negative. One-contact-per-program lifts replies +46% — *validating the head-coach-only rule already shipped.*
5. **The queue is the product.** One live, score-ordered `/Today` list that DB-excludes anyone touched <7d, replied, bounced, or suppressed. Salesloft's version drove +39% tasks/day.
6. **Enforce every rule server-side.** ≤1/week, dedup, suppression, and double-touch prevention are **DB invariants at the send endpoint** (atomic claim + `SELECT FOR UPDATE SKIP LOCKED`), because you send from a phone while Ben/Leah send from desktop. Slack coordination is not a control.
7. **Score cold leads ~100% on fit + deliverability.** Verified-deliverable email is a hard *gate*. Engagement scoring exists only to build the *after-reply* queue.

---

## 3. The new information architecture (audit, kept)

### 11 flat tabs → 5 destinations + Settings

```
OLD (11 flat, equal-weight, admin-only)        NEW (5 task destinations + owner Settings)
────────────────────────────────────          ──────────────────────────────────────────
 Inbox, Dashboard            ───────────────▶  HOME / TODAY   ranked work queue + KPIs
 Coaches, Pipeline, Conferences ────────────▶  COACHES        view-toggle: Table │ Pipeline │ Groups
 Email, Resend, Insights, Inbound ──────────▶  OUTREACH       sub-tabs: Replies │ Tracking │ Deliverability │ Analytics
 (net-new) ─────────────────────────────────▶  COMPOSE        recipient-picker-first; center FAB on mobile
 Sequences ─────────────────────────────────▶  SEQUENCES      engine on + Guardrails card + per-step metrics
 Settings (Automations+Suppressions, split) ▶  SETTINGS        Automations · Suppressions · Templates · Team & Roles
```

**Migration table (every old tab → new home)**

| Old tab | New home | Mode / sub-tab |
|---|---|---|
| Dashboard + Inbox | **Home / Today** | ranked queue (default landing); KPIs below |
| Coaches list | **Coaches** | Table view (canonical) |
| Pipeline | **Coaches** | Pipeline view (shares filter bar; mobile stage-switcher) |
| Conferences | **Coaches** | Groups → group-by:Conference (a preset, not a tab) |
| Email | **Outreach** | Tracking |
| Resend | **Outreach** | Deliverability (live feed + domain health) |
| Insights | **Outreach** | Analytics (merged; no duplicate KPI cards) |
| Inbound | **Outreach** | Replies (demo leads interleaved with replies) |
| Sequences | **Sequences** | engine fixed (see §4) |
| Settings + /settings/* | **Settings** | sectioned; orphan routes deleted |

Nav becomes a **role-aware manifest** (data, not a frozen `TABS` tuple) so the desktop sidebar, the mobile bottom-bar, and the teammate view all derive from one source. Keyboard shortcuts bind to destination **IDs** (not array index, which silently re-points on reorder). Mount the **already-built `cmdk` command palette** (`src/components/golf/CommandPalette.tsx`) as Cmd+K — the cheapest way to relieve "too many tabs" before any restructure ships. Delete the orphaned `/crm/inbox|insights|sequences|settings/*` routes; keep `/coach/[id]`.

---

## 4. The sending engine, reinvented (the research core)

This is the part the old plan didn't have. It is the highest-value section.

### 4.1 Deliverability foundation (do this *first* — it gates everything)

> **⚠️ CORRECTION (Resend review, 2026-06-17 — verified against Resend's AUP).** An earlier draft of this section said "move cold to an `outreach.helmsportslabs.com` subdomain *on Resend*." That is **wrong and unsafe**: Resend's Acceptable Use Policy *prohibits cold outreach entirely* ("…including cold outreach, purchased lists, or scraped contact data… all mail must be sent to recipients who have explicitly opted in"). A subdomain on Resend does **not** fix a ToS violation — it just moves the violation. The cold stream must move **off Resend** to a cold-permitted tool on a **separate domain**. Resend stays for transactional/opt-in only. **We are actively violating this today** (cold sends via `process-sequence-batch.mjs`), so the very first action is to pause cold sends through Resend. Full detail + free-tool stack + config checklist: **`RESEND_INTEGRATION_REVIEW_2026-06-17.md`**.

- **P0 — Stop cold-sending through Resend; move cold off it.** Resend = transactional/opt-in only. Cold outreach moves to a **cold-permitted** tool (GMass free tier + a ~$7/mo Google Workspace mailbox is the cost-conscious path; Instantly/Smartlead if we outgrow it) on a **separate, GolfHelm-branded cold domain** (~$10/yr — recognizable to coaches *and* reputation-isolated from the product/billing domain; *not* a `helmsportslabs.com` subdomain). Own SPF/DKIM/DMARC. **Warm 3–4 weeks** (wk1 warmup-only → wk2 5–15/day → wk3 15–30 → wk4+ 40–50). `crm_coaches`/`email_events`/Supabase stay as system-of-record; just repoint sends off `api.resend.com`.
- **Split across 3 mailboxes.** Give Nick/Ben/Leah each a mailbox on the subdomain and split the 40–50/day (~15–17 each). Scale by mailboxes, not per-mailbox volume (~30/inbox/day safe zone). Don't multiply *domains* yet — separation from product mail is the goal, not rotation (that only matters >150/day).
- **Turn OFF Resend's open-pixel and click-link-wrapping for the cold stream.** The pixel costs 8–12% placement; the link rewrite is *exactly what gateways auto-click*. Untracked emails reply **7.4% vs 4.4%** (Hunter, +68%) and the bot-click noise disappears at the source. Put the calendar link as bare text or "reply and I'll send it."
- **Verify the full list before each weekly batch** (rosters churn — your D2 list was already swapped 2026-06-16). Verified-deliverable is a **hard gate**; route catch-all/role/risky `.edu` to a manual bucket. Keep bounce <2%, hard-bounce <1%. A bounce is a permanent burn under one-touch — never retry.
- **Google Postmaster Tools v2** on the subdomain + Resend webhooks → Supabase alerts. **Auto-pause the team** if complaint rate nears 0.1% (hard ceiling 0.3%), bounce >5% in a batch, or delivery <97% rolling. *Opens won't warn you — these guardrails are your only early-warning system.*
- Keep it **plain-text, ≤80 words, one CTA, minimal/zero links** (your "Founding 10 — First Touch (Text)" template is the right pattern). CAN-SPAM footer = real postal address + a one-line reply opt-out ("Reply STOP…"); add an RFC-8058 `List-Unsubscribe` header (crawler-ignored, won't inflate bot clicks).

### 4.2 Cadence — reframe "one-touch" to "two touches max" *(your call — §8)*

```
Day 0  (Tue/Wed/Thu, 8–11am COACH-local)  Touch 1 — segment opener, ≤80 words, soft CTA, no link
Day 3–4 (only if NO reply)                Touch 2 — break-up + referral ("…if someone else on staff
                                                     handles this, point me their way?")
After 2 no-reply touches                  Retire to a 60–90d recycle pool (claim-eligible at day ~75)
"Check back next season" reply            snooze_until (post-season May / pre-season Aug) — the only
                                          follow-up the policy allows, because the coach invited it
```

The **referral ask in Touch 2** is your sanctioned, ethical path past the head coach to an assistant/AD without separately cold-emailing them (break-up emails reply 10–33%). **Cron releases sends on jittered 3–8 min intervals** across business hours; vary daily volume (38 one day, 47 the next) — never clockwork. The phone/desktop only *adds to the approved queue*; the cron meters delivery.

### 4.3 Scoring — TWO scores, and a bug to invert

**Fix the live bug first.** `crm_coach_engagement` computes `score = (open*1.0 + click*3.0)*10`, `hot` when `click>0.5`. On `.edu` a single gateway click → instant "hot." **Invert it:** clicks contribute **zero** to temperature; replies are the only promotion signal. (Your `email_clicks` table already stores `user_agent` + `ip_address` — you have everything to flag bots; only the logic is missing.)

```
SCORE 1 — FIRST-TOUCH FIT (0–100, who to email; ~100% fit + deliverability, ZERO engagement)
  Division/tier 25 · Recently-hired coach 20 (the #1 buying trigger) · Pain proxies 15
  Named personal email vs athletics@ 15 · Email VERIFIED 15 (HARD GATE) · Men's+Women's at school 10
  Daily queue = ORDER BY fit_score DESC WHERE uncontacted AND deliverable AND not_suppressed
                AND last_emailed_at < now()-7d LIMIT 50

SCORE 2 — REPLY-DRIVEN TEMPERATURE (after-reply queue ONLY)
  REPLY (human, OOO excluded) = HOT instantly — the ONLY promotion signal
  OPEN w/o millisecond click-burst, >2min post-delivery, non-datacenter = WEAK warm
  CLICK = IGNORED; flag bot if latency<10s, or 2+ links in <1s, or datacenter ASN / scanner UA
  TIME-DECAY: temperature expires after 7–14d of no new non-bot signal
```

This replaces the `coach-priority.mjs` heuristic (which gave clicks +100) with a fit-first model that won't re-bug already-clicked coaches. *Note: `crm_coaches.division` enum still needs `ALTER TYPE` to add D1/NAIA/JUCO for clean scoring.*

### 4.4 Reply triage — a classifier + phone alert, not an AI-SDR

Math: 40–50/day × ~3–5% reply ≈ **1–2 genuinely hot replies per week.** The entire game is never dropping those. Build on the existing `crm_replies` (Resend inbound → thread match on `in_reply_to`). **Keyword-first, LLM-second** 6-bucket classifier (~70–80% classify on keywords):

| Bucket | Detection | Action | Notify? |
|---|---|---|---|
| **Unsubscribe** | "remove me / opt out / stop" | write to `crm_email_suppressions` ≤48h | no |
| **OOO** | "out of office / automatic reply" | tag *Sent/Auto* (not Replied), snooze, re-queue | no |
| **Not-interested** | "not interested / all set" | closed_lost | no |
| **Referral** (~2%, high value) | a name/email + "reach out to" | auto-create lead, pre-fill warm intro | **yes** |
| **Interested / Question / Not-now** | LLM on the ambiguous remainder | same-day human reply | **yes** |
| **Noise** | gateway challenges / synth bounces | ignore | no |

SLA: Interested/Referral/Question get a **<1-hour** human reply (939-company study: <5min response → 32% close vs 12% at 24h). Push notification fires **only** on those three categories, deep-linked to the thread — never on OOO/opens/clicks (stay under the 3–6 push/day fatigue cliff). Ownership = single-owner-per-thread, round-robin auto-assign + `claimed_by` + Supabase-realtime "Ben is replying" lock; unclaimed >4h reassigns Monday.

---

## 5. Layout sketches

### 5.1 Desktop — Coaches: list + the loved panel, elevated to a real dialog

```
┌──────────┬──────────────────────────────────────────────────┬───────────────────────────┐
│  HELM    │  Coaches            [Table] Pipeline  Groups  ⌘K  │  ◀ Coach: Jamie Park  ✕   │ role=dialog
│ ▸ Work   │ ┌──────────────────────────────────────────────┐ │  D1 · Women's · ACC       │ aria-modal
│  Today   │ │🔍 Search   Filters (2)  [D2 ✕][ACC ✕]  Save▾ │ │  Fit 82 · ❄ Cold (no reply)│ focus-trap
│  Coaches◀│ ├──────────────────────────────────────────────┤ │ ───────────────────────── │
│  Outreach│ │ Views: Uncontacted D1-W · Replies · Cooling   │ │  ✉ jpark@…  ☎ …  🔗 staff │ (sticky bar)
│  Compose │ ├─┬───────────────┬───────┬─────────┬────────────┤ │ ───────────────────────── │
│ ▸ Automate│ │☑│ Name          │School │ Signals │ Next ↕     │ │  In sequence: Touch 2 ·   │
│  Sequences│ │☐│ Jamie Park ◀  │ Duke  │ ❄ ▱▱▱   │ Day 0  ⠇   │ │   sends Thu  [pause]      │
│ ▸ Admin  │ │☐│ Sam Lee       │ UNC   │ 🔥 reply │ NOW ⠇      │ │  ↳ sibling: M's coach —   │
│  Settings│ │☐│ Pat Cruz      │ NCSU  │ ❄       │ Day 0 ⠇    │ │     not yet contacted     │
│ ──────── │ │  density: ▣ Cozy ▾   no x-scroll at 1440px     │ ───────────────────────── │
│ + Add    │ └──┴──────────────┴───────┴─────────┴────────────┘ │  ▣ Timeline (who did what)│
│ ↑ Import │  [ N selected · Email · Enroll · Tag · Assign · ✕ ]│  Leah · logged call · 2d  │
└──────────┴──────────────────────────────────────────────────┴───────────────────────────┘
  Signals = reply/heat state, NOT clicks.  "↳ sibling" shows the men's/women's coach at the
  same school + whether/when/by-whom contacted → prevents same-week double-touch of a program.
```

### 5.2 Mobile — bottom nav + coach sheet + Compose (the phone-send unblock)

```
 COACH BOTTOM SHEET (peek→full)          COMPOSE — full-screen stepped flow
┌───────────────────────────┐          ┌───────────────────────────┐
│ Coaches            🔍  ⌘   │          │ ✕  Compose      Step 3/4   │
│ ┌───────────────────────┐ │          │  ●──●──●──○                │
│ │ Jamie Park · Duke   ❄ │ │  swipe→  │  To: 47 (today's queue)   │
│ │ Sam Lee · UNC   🔥reply│ │  ←snooze │  Template: D1-W Opener    │
│ └───────────────────────┘ │  ↑ log   │ ┌───────────────────────┐ │
│ ┌───────────────────────┐ │          │ │ Coach {last_name}, …  │ │
│ │▁▁▁ Jamie Park      ▴ │ │ ← 30%    │ └───────────────────────┘ │
│ │ Cold · Touch 1 · Thu  │ │   peek   │ ┌── Preview (coach #1) ─┐ │ 56px peek
│ └───────────────────────┘ │  drag↑   │ │ "Coach Park, I…"   ▴ │ │ above keyboard
├───────────────────────────┤          ├───────────────────────────┤
│ 🏠   👥   ✉   ⊕   ⋯       │          │ Review: 47 · 2 skipped ·  │ aria-live
│ Today Coach Out COMPOSE ⋯ │          │ 1 suppressed    [Send →]  │ sticky dvh footer
└───────────────────────────┘          └───────────────────────────┘
  ⊕ center FAB = Compose. Send only ADDS to the approved queue; the server cron meters delivery.
```

### 5.3 The filter bar (kills the "oversized green pills + redundant All")

```
BEFORE (your screenshot)                     AFTER
─────────────────────────                    ─────────────────────────────────────────
🔍[search]                                    🔍[ Search ]   [ Filters (2) ▾ ]
Division:[All][D1][D2][D3][NAIA][JUCO]        Active: [ D2 ✕ ] [ ACC ✕ ]      ← removable chips
Program:[All][Men's][Women's][Both]           Views:  (Uncontacted D1-W)(Replies)(Cooling)(+Save)
                                              Popover: Division▾ D1(412) D2(812)✓ · Conference▾ ·
~13 solid kelly-green pills, two "All"s,                Status▾ · Program▾ · Owner▾ · Engagement▾
wrapping + cut off on a laptop                Selected = soft primary-50 inset (NOT solid green).
                                              "All" removed (empty = no filter). Multi-select arrays.
```

### 5.4 The Sequence cockpit (engine-on, reply-metrics-visible)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Sequences › D1 Women — Cold        ● Active   [Enroll ▾] [Dry-run ▸]  │
│ ┌── GUARDRAILS (always on) ──────────────────────────────────────┐   │
│ │ ≤2 emails/coach ever · ≤1 new thread/coach/7d · Head coach only │   │ legible
│ │ Fresh+deliverable only · Domain cap 40–50/day split 3 mailboxes │   │ send policy
│ │ ✅ Cold domain warmed · Engine released 14 sends 6m ago         │   │ (red if paused
│ └────────────────────────────────────────────────────────────────┘   │  / domain hot)
│  TRUE reply 6.1% · positive 2.8% · bounce 1.2% ✅   (NO open/click %) │ honest metrics
│ ─────────────────────────────────────────────────────────────────────│
│  ① Day 0   Opener · [D1-W Pain ▾]   312 sent · 6.1% reply  [Preview ▸]│ per-step REPLY
│  ② +3d     Break-up + referral      198 sent · 4.0% reply  [Preview ▸]│ metrics (not opens)
│ ─────────────────────────────────────────────────────────────────────│
│  ▾ Enrollments (188)   Sam Lee · stopped (replied ✓)   [bulk pause]   │ reply auto-stop
└──────────────────────────────────────────────────────────────────────┘
  "Dry-run" = run the selection logic with NO Resend call → trust the batch before it fires, from a phone.
```

---

## 6. Consolidated findings (audit + research, severity-ranked)

| # | Sev | Finding | Source | Fix |
|---|---|---|---|---|
| 1 | **P0** | Cold sending from the **root product domain** — a `.edu` spam spike poisons customer mail | research | Dedicated warmed `outreach.` subdomain |
| 2 | **P0** | Engagement view scores **"hot" off bot clicks** (`click×3`, hot at >0.5) → re-bugs clicked coaches | research | Invert: replies-only temperature; clicks→0 + bot-flag |
| 3 | **P0** | Coach list truncates at **1,000 of 2,293** rows; all counts wrong | audit | Wrap `fetchAllCoaches` in existing `fetchAllRowsResult`; `count:'exact'` |
| 4 | **P0** | Segment resolver **enrolls a different set than it displays** | audit | One shared `matchesSegment()`; resolved-count confirm; pre-filter suppressed |
| 5 | **P0** | Caps/dedup/suppression are **UI-only** → phone + desktop can double-touch | research | Server-side invariants; atomic claim + `SKIP LOCKED`; UNIQUE on `lower(email)` |
| 6 | **P0** | No verified-email **gate**; bounces permanently burn under one-touch | research | Verify before queue entry; route risky `.edu` to manual bucket |
| 7 | **P0** | Open-pixel + click-link-wrapping **on** for cold → −placement + bot noise | research | Turn both off for the cold stream |
| 8 | **P0** | Phone-send blocked (composer is a 90vh modal trap) | audit | Route-level full-screen stepped Compose + preview peek |
| 9 | **P0** | CRM hard-gated to single `admin`; Ben/Leah can't log in | audit | `crm_members` + `fn_is_crm_member()` (replaces ~28 RLS policies) |
| 10 | **P0** | No coach **ownership** → can't divide the book / prevent double-touch | both | `owner_id` + "My/Unassigned/All" scope + Claim |
| 11 | P1 | No **/Today queue** — no "who do I email next" | research | Fit-scored queue as Home; auto-advance on send |
| 12 | P1 | Only one touch; the **highest-ROI follow-up is missing** | research | Add one break-up+referral touch *(Decision 1)* |
| 13 | P1 | Loved `CoachDetailPanel` is **not an accessible dialog** (zero aria) | audit | role/aria-modal/labelledby + focus trap + inert; bottom-sheet on mobile |
| 14 | P1 | 11 flat tabs; 5 are "email viewed differently" | audit | Collapse to 5 destinations + sub-tabs |
| 15 | P1 | Filter pills oversized/solid-green + redundant "All" | audit | Facet dropdowns + chips + soft primary-50 |
| 16 | P1 | Dashboard shows **open/click %** (meaningless + bot noise) | research | Delete them; show TRUE reply / positive-reply / bounce / meetings |
| 17 | P1 | No reply triage/classifier; drips keep emailing repliers | both | Keyword→LLM 6-bucket classifier + auto-stop + phone alert |
| 18 | P1 | Tasks can't be delegated (`assignee_id: null` hardcoded) | audit | Assignee picker (default self) |
| 19 | P1 | Pipeline/tables unusable + gesture-hostile on touch | audit | Mobile stage-switcher; card-view breakpoints; 44px targets |
| 20 | P2 | 8–12 segment templates beat 2,300 AI openers; spintax neutral-negative | research | Segment template library, not per-coach generation |
| 21 | P2 | Accent-color overload (7 hues/row); kelly-green diluted | audit | Semantic color contract; reply-heat as the only chroma |
| 22 | P2 | `ConferenceGroupView` hardcodes D2/D3 — erases D1/NAIA/JUCO | audit | `Record<Division,number>` rollup |
| 23 | P2 | No dedup/merge on a 2,293-row, EIN-less, multi-ingest list | both | Import-time fuzzy dedup + `mergeCoaches` |
| 24 | P2 | No command palette (cmdk engine already exists) | audit | Mount Cmd+K |
| 25 | P2 | Long lists not virtualized; every tab re-fetches | audit | `react-virtual` + TanStack Query caching |

*(Full 35-finding table retained in the audit output; condensed here to the action set.)*

---

## 7. Phased roadmap

**Sequencing principle: deliverability + correctness → engine → IA → mobile → multi-user → intelligence.** Each phase ships independently.

### P0 — Protect the domain & make it correct *(days, mostly wiring existing primitives)*
- Stand up `outreach.helmsportslabs.com` in Resend (SPF/DKIM/DMARC `p=none`+rua); **begin the 3–4 week warm-up clock now** (it's the long pole).
- Turn off open-pixel + click-wrapping for cold; switch sender `FROM` to the subdomain once warm.
- Invert `crm_coach_engagement` (clicks→0, replies-only, bot-flag from `email_clicks.user_agent/ip`).
- Wrap `fetchAllCoaches` in `fetchAllRowsResult`; `count:'exact'` totals; lint-guard any `.from('crm_*').select()` without `.range/.limit/count`.
- Shared `matchesSegment()` + resolved-count confirmation + suppressed pre-filter.
- Reply auto-stop (`stopEnrollment('replied')`) + verified-email gate before queue entry.

### P1 — The engine & the queue *(1–2 sprints)*
- Server-side send endpoint with the cap/dedup/suppression invariants + atomic claim (`SKIP LOCKED`) + UNIQUE `lower(email)`.
- Jittered pacing cron (releases the *approved* queue; phone/desktop only add to it).
- Fit-score (Score 1) + the `/Today` queue as the new Home, score-ordered, 7-day-cooldown-excluded.
- Reply classifier (6-bucket) + phone push on Interested/Referral/Question only.
- *(If approved)* the day-3–4 break-up + referral Touch 2.

### P2 — Condense the IA *(1–2 sprints, nav re-parenting, no logic moves)*
- 11→5 manifest-driven destinations; delete orphan routes; mount Cmd+K; relocate saved Views into Coaches; honest reply-only dashboard.

### P3 — Mobile-first + phone-send *(3–4 sprints — the flagship build)*
- DS primitives first (44px coarse-pointer utility, `dvh/svh`, `touch:` variant — one change fixes 91 files); one headless overlay primitive (Radix/react-aria) for every modal + the coach panel.
- Route-level stepped **Compose**; bottom tab bar; bottom-sheet panels; card-view tables; mobile Pipeline stage-switcher; `aria-live` sends; axe + 375/768/1440 viewport CI gate.

### P4 — Multi-user (Ben & Leah) *(2–3 sprints)*
- `crm_members(role ∈ owner|manager|rep)` replacing `role='admin'` in layout + actions + ~28 RLS policies; `owner_id` ownership + Claim; role-scoped nav; Settings → Team page; realtime presence/soft-locks.

### P5 — Salesforce-grade depth *(XL, parallelizable)*
- Faceted multi-select segments → saved Views; sequence cockpit (per-step reply metrics, live preview, dnd reorder, dry-run); dedup/merge; inline edit + rich bulk bar; server-driven keyset pagination + virtualization.

---

## 8. Decisions I need from you

1. **One touch vs two?** The data strongly favors adding **exactly one** break-up + referral follow-up (≈doubles replies). It conflicts with your "one email, don't retouch under a week" rule. Options: **(a)** keep strict one-touch; **(b)** add Touch 2 at **day 3–4** (research-optimal); **(c)** add Touch 2 at **day 7** (honors your weekly cap, captures most of the lift). My recommendation: **(c)**.
2. **Move cold off Resend entirely?** *(Upgraded from "dedicated subdomain" — see the §4.1 correction.)* Resend's terms prohibit cold outreach, and cold currently shares the domain that sends your signups/password-resets, so a Resend suspension would be a **product outage**. Recommend **yes**: keep Resend for transactional/opt-in; run cold from GMass + a ~$7/mo Google Workspace mailbox on a separate GolfHelm-branded cold domain (~$10/yr). The Workspace seat is the only near-unavoidable spend. Start the 3–4 week domain warm-up clock as soon as the domain is bought.
3. **Split sending across 3 mailboxes** (Nick/Ben/Leah, ~15–17/day each) vs one? Recommend **yes** (safer for a young domain, and it's how the team naturally divides the book).
4. **Scope of build now.** Recommend we execute **P0 immediately** (it's protective + correctness, low-risk, mostly wiring) and I bring you a working `/Today` queue + the new filter bar + the responsive coach panel as the first visible slice, before committing to the full P3 mobile build.

---

*Inputs: audit `tasks/wq6yurcuw.output` (12 maps + 8 dimension audits, avg 3.4/10); research `tasks/wlvt1stw4.output` (9 web-grounded angles + playbook). Key files: `src/app/golf/admin/crm/{page,layout}.tsx`, `components/{CoachDetailPanel,CoachFilters,BulkEmailModal,CoachTable}.tsx`, `components/sequences/SequenceBuilder.tsx`, `actions/crm-sequences.ts`, `src/lib/supabase/fetch-all-rows.ts`, `src/components/golf/CommandPalette.tsx`, `vercel.json`, `supabase/config.toml`, the `crm_coach_engagement` view, `scripts/{coach-priority,process-sequence-batch,setup-coach-sequence}.mjs`.*
