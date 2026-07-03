# Helm Mission Control — The "Make It Amazing" Plan (Helm-only)

> Scope: **Helm Sports Labs product + its own free GTM** (GolfHelm/CoachHelm, BaseballHelm, Lift Lab).
> Explicitly EXCLUDED: the ADP day-job pipeline and all paid CRM/enrichment (Apollo, ZoomInfo,
> Sprouts, Indeed, ZipRecruiter, IBISWorld, bigdata). Helm sales runs free: own Supabase
> `crm_coaches` + Gmail/Resend outreach.

## 1. Vision
The one screen you open with coffee, and the one page a partner opens to trust the company. It watches three loops a solo founder can't watch by hand: **is prod safe to demo today**, **which coach in my pipeline needs me now**, and **is the product actually being used** — always-on, writing every signal into the Notion command center, paging your phone only for true P0s, and never sending an email or deploying during a live demo window without you. The daily deliverable is a schedule-aware brief that knows you're in the field Tue–Thu; the weekly deliverable is a partner one-pager that assembles itself instead of Friday hand-typing.

## 2. Capability Matrix (Helm-only, ranked by leverage)

| Capability | Powered by | Value | Effort | Status |
|---|---|---|---|---|
| **Demo-readiness green board** (before every Tue/Thu demo) | Supabase + Sentry + Vercel + Playwright | A demo on a broken deploy or empty roster is a lost school — highest-stakes check | medium | verify |
| **Prod error early-warning → Notion Incidents** (Seer root-cause) | Sentry (helm-xs) | Early-warning line before a paying-school outage; auto-filed with root cause | quick | live |
| **Deploy + Supabase-pause watcher** (auto-deploy is ON) | Vercel + Supabase CLI | Empty-log "provisioning failed" = paused Supabase; breaks live users, easy to miss | quick | live |
| **Nightly Supabase security-advisor + drift sweep** | Supabase `get_advisors` + `information_schema` | Agents keep re-shipping GRANT ALL TO anon + recorded-but-unran migrations — top recurring prod risk | medium | verify |
| **Morning PR digest** (green / red / blocked / mergeable) | gh CLI + CodeRabbit/Greptile | Wave-based clean-slate work = many concurrent PRs; one-glance triage | quick | live |
| **Ship-safety gate** ("no auto-merge/deploy during a demo window") | GitHub + Vercel + Google Calendar | Mid-demo deploy breaks a prospect call | medium | needs-setup |
| **NCAA coach outreach funnel** (emailed→opened→replied→booked) — FREE | Resend + Gmail + Supabase `crm_coaches` | The actual GolfHelm/BaseballHelm acquisition motion; today it's fire-and-forget | medium | needs-setup |
| **Gmail reply/meeting detector → "needs reply" queue** | Gmail (draft-only) | A warm coach reply sitting 2 days is the most expensive miss in a solo op | quick | live |
| **Email deliverability + coach engagement health** | Resend (crm_email_events/stats) | Bounce/spam spikes on cold outreach are an existential daily signal | quick | live |
| **Product activation metrics** (rounds, check-ins, teams, dormant programs) | Supabase + PostHog | Truest measure of use + churn leading-indicator; a program dark in week 2 is still saveable | medium | verify |
| **AI value + LLM spend meter** (insights vs silent template-downgrades) | Supabase `golf_coachhelm_llm_budget` | Template downgrades = invisible trust erosion the coach is "paying" for; your only P&L lever | medium | needs-setup |
| **Background job / cron health** (~20 Vercel crons + Inngest) | Vercel Cron + Inngest | CoachHelm value depends on nightly genome/insight jobs; can't eyeball 20 crons | medium | verify |
| **Dependency / CVE alert** on Next.js 16 + Supabase tree | endor (SCA) | Public repo + fast shipping = supply-chain exposure with no time to audit | quick | live |
| **Weekly partner/investor one-pager** (auto-assembled) | Notion + all feeds | You explicitly want partner updates; beats hand-assembling every Friday | quick | live |
| **Competitive-intel watch** (Clippd primary threat, DECADE, Arccos, baseball) | Tavily (free) | A Clippd conversational layer would erase a Helm differentiator — needs same-week | medium | verify |
| **Weekly perf / Core-Web-Vitals audit** (marketing + golf dashboard) | chrome-devtools Lighthouse + Vercel Speed Insights | Premium overhaul + WebGL scroll lives or dies on feel; catch LCP/INP regressions | medium | verify |
| **Schedule-aware Daily Brief** (field vs desk days) | Google Calendar | Coach-call reminders on field days, deep-work PRs on office days | quick | verify |
| **Roadmap execution tracker** (waves, ~100 open issues) → "next task" | Taskmaster-ai + gh CLI | Paces wave work so it doesn't stall between sessions | medium | verify |
| **True-P0 phone escalation only** | PagerDuty | One channel that means "stop what you're doing" | medium | needs-setup |
| **Partner-facing diagrams** (funnel, architecture) | Mermaid / tldraw | On-demand visuals for the one-pager and demos | quick | live |

## 3. Quick Wins (this week)
1. **Sentry daily error feed** — 7:30am scan of helmv3 prod for new + spiking unhandled issues, run Seer on the top one, write each into Notion Incidents.
2. **Deploy + Supabase-pause watcher** — after every push to main, check latest prod deploy state; if failed/empty-log, probe Supabase status and post a red pill to Notion Deploys.
3. **Gmail "needs reply" queue** — search the outreach mailbox for coach replies + calendar-link clicks, label them, surface a same-day "needs reply" list in the Daily Brief. **Never auto-send.**
4. **Morning PR digest** — nightly `gh pr list` with CI + CodeRabbit/Greptile verdicts → "mergeable / red / blocked (admin-merge)" into Notion PRs.
5. **endor CVE scan** — weekly scan of the Next.js 16 / Supabase tree; open a Notion Incident on any new critical/high.
6. **Schedule-aware brief header** — merge your fixed week + booked demos so the brief opens with "FIELD day — 2 demos" vs "OFFICE day — deep work."
7. **Coach-outreach email health** — daily Resend bounce/spam/open-rate deltas so deliverability problems surface before they tank a batch.

## 4. Big Plays
1. **Stand up a `mission_events` table + thin `/admin/mission-control` cockpit** with a **Demo Readiness Score**. Every feed converges here — the persistence + single-pane-of-glass layer is the real deliverable.
2. **Demo-readiness green board as a pre-demo gate.** Scheduled Playwright E2E that logs into `demo@golfhelmdemo.com` + the Rini baseball demo accounts, walks dashboard→roster→round-logging, confirms seed data populated, prod Sentry-clean, deploy green — red-flags a silent broken login the morning of a demo.
3. **Close the NCAA coach funnel (free).** Wire emailed→opened→replied→booked→closed on your own `crm_coaches` + Resend/Gmail, with stuck-stage alerts. Biggest current GTM gap — it's fire-and-forget today. (No paid CRM.)
4. **Durable + reachable backbone.** Cloudflare Tunnel so the Partner Request webhook is reachable from real forms; launchd so Docker/n8n restart on boot. Today autonomy dies on a reboot.
5. **Product activation cohort + auto partner one-pager.** Instrument real product events (only `$pageview` exists today), build the demo→value funnel, and let the Friday update assemble itself: pipeline movement, demos run, activation deltas, ship velocity, prod-health.

## 5. New Routines to add (paste-ready)

> **Notion command-center targets** — add the matching one to each routine so output lands in the right place:
> narrative pages (briefs/updates) → home page `3908daf2-b331-8122-867a-d28b4c447602` · errors → **Incidents** `8b21409a-4bcf-4d61-8187-596d831b20ca` · deploys → **Deploys** `3bf9e736-655f-451f-99a6-d1465ce662cf` · PRs → `7ce9c1fa-5515-498f-b1a1-f229c6132281` · activation/roadmap → **Roadmap** `079c14c4-6418-4ec0-8be8-7ca7ece72287` · competitors → **Competitors** `77715adc-0d3a-443f-bb00-a6fa99970c02` · coach pipeline → **CRM** `1610b7c5-49e1-486f-b70f-b70f432cab47`.
> **All three core jobs (Daily Brief / Sweep / Weekly) are already running as session-crons that write to Notion — paste them (and these five) into the desktop app's Routines to make them always-on.**

**Routine: Helm Demo-Readiness Green Board** — *Tue & Thu 7:00am · Supabase, Sentry (helm-xs), Vercel, Playwright, Notion*
> You are Helm's demo-readiness gate; it's a field/demo day. 1) Confirm the latest njrini99-code/helmv3 prod Vercel deploy is READY and `/api/health` returns DB-reachable. 2) Sentry helm-xs: zero new P0 unhandled errors on the golf/baseball demo paths in 24h. 3) Supabase: verify `demo@golfhelmdemo.com` (Demo University Golf) and Rini University Baseball (njrini99 coach / rinin376 player) still have populated rounds/roster/Lift Lab rows. 4) Run the Playwright demo-login smoke on both accounts; flag any blank-screen or false-offline. Post a single GREEN/RED "Demo Ready" card to Notion; if RED, page via PagerDuty. Do not modify any data.

**Routine: Supabase Security + Migration-Drift Sweep** — *Nightly 2:00am · Supabase, Notion*
> Run `get_advisors` on the shared golf-prod project. Hunt the recurring regressions: (a) anon/authenticated EXECUTE on standing RPCs, (b) matview/table recreates that re-granted ALL to anon (check `pg_class.relacl`), (c) golf_rounds RLS gaps. Verify recent migrations actually ran via `information_schema` — NOT schema_migrations history (unreliable). For anything found, open a Notion Incident with the exact REVOKE statement. Propose only — do not auto-apply.

**Routine: NCAA Coach Reply + Pipeline Digest (free)** — *Daily 8:00am field / 12:00pm otherwise · Gmail, Supabase, Resend, Notion*
> 1) Gmail: scan the outreach mailbox for replies from NCAA coaches + any `calendar.app.google/s9DBb3bKD2teLLBT7` booking clicks; label + advance the contact to replied/meeting and build a same-day "needs reply" list (DRAFT replies only, never send). 2) Resend: surface bounce/spam/open-rate deltas on coach outreach. 3) Supabase `crm_coaches`: show the funnel (emailed→opened→replied→booked) and who's stuck. Write "Who to reply to today" + funnel to Notion CRM. Free-data only — no paid enrichment.

**Routine: Morning PR + Ship-Safety Gate** — *Weekdays 7:15am · gh CLI, Vercel, Google Calendar, Notion*
> For njrini99-code/helmv3: list open PRs with CI + CodeRabbit/Greptile verdicts; classify mergeable / red / blocked(admin-merge). Check Google Calendar for demos booked today; if a demo window exists, add a bold warning: "DEMO WINDOW — do not auto-merge or deploy to prod between [start] and [end]" (Vercel auto-deploy is ON). Post digest + gate to Notion PRs. Do not merge anything.

**Routine: Product Activation + AI Value Pulse** — *Weekly Mon 9:00am · Supabase, PostHog, Notion*
> Compute weekly activation across onboarded programs: rounds logged (GolfHelm), check-ins (Lift Lab), baseball recruiting profiles created, coach AI-insight opens; list programs that signed but never activated or went dark >7 days. From `golf_coachhelm_llm_budget`, report insights generated vs silent template-downgrades (budget_exhausted/zero) and per-team burn. Flag dormant programs (churn) and downgrade spikes (trust erosion). Write to Notion Roadmap + Activation.

**Routine: Competitive-Intel + CVE Watch** — *Weekly Fri 10:00am · Tavily, endor, Notion*
> Tavily sweep for moves by Clippd (PRIMARY THREAT — official NCAA scoring), DECADE, Arccos, and college-baseball recruiting rivals — new features, pricing, program wins — and diff against `docs/v3-research-competitive-landscape.md`; flag anything resembling a Clippd conversational/scheduling layer as same-week priority. Run endor on the helmv3 dependency tree; open a Notion Incident on any new critical/high CVE. Land both in Notion Competitors.

## 6. Gaps / Setup Needed (honest)
- **Cloudflare Tunnel — not configured.** n8n is localhost-only, so the Partner Request webhook is unreachable from real forms. Top infra quick win.
- **launchd/cron — empty.** Nothing guarantees Docker/n8n restart-on-boot or that sweeps survive a reboot.
- **PagerDuty — not connected.** Needs setup before it can be the single "stop everything" channel.
- **PostHog — only `$pageview` instrumented.** Funnels/activation need real product events added in code first.
- **Gmail cold-send (GMAIL_SA_*) — INERT** until env is set. Reply *detection* works today; direct-send does not.
- **Inngest — needs INNGEST_EVENT_KEY/SIGNING_KEY in prod** before job-health is trustworthy.
- **`mission_events` table + `/admin/mission-control` page — not built.** The aggregation layer to decide on.
- **"verify" connectors** (auth-check before scheduling): Supabase advisors, PostHog, Playwright, chrome-devtools, Google Calendar/Drive, Tavily, Taskmaster.
- **Decisions:** (1) Approve PagerDuty + define P0. (2) Confirm draft-only email everywhere — no routine ever sends.

*Guardrails in every routine: never auto-send email; never merge/deploy/rollback during a demo window; Supabase routines REVOKE anon grants after any recreate and verify migrations via `information_schema`; free-data-only for GTM.*
