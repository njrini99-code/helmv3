# Resend Deliverability & Tooling Review — GolfHelm Cold Outreach + Transactional

**Date:** 2026-06-17 · **Scope:** Cold `.edu` outreach to ~2,300 US college golf coaches (40–50/day, plain-text, Gmail Primary target) + transactional product mail, both currently on Resend from `admin@helmsportslabs.com`.
*AUP language below independently verified against `https://resend.com/legal/acceptable-use` on 2026-06-17.*

## Bottom line

You are **not** maxing Resend (~40–50% of features used), and the unused ones are exactly the deliverability-critical ones. But the bigger issue is upstream: **Resend's Acceptable Use Policy explicitly prohibits cold outreach**, so the cold half is a standing ToS violation on the same account/domain that sends your password resets and signups. The fix is a **stream split** — keep Resend for transactional/opt-in, move cold to a cold-permitted tool on a separate domain. None of the cost-conscious fixes require meaningful spend except a ~$7/mo Google Workspace seat.

> **⚠️ Active violation right now.** Cold sends already went out through Resend today (the `process-sequence-batch.mjs` runs). Every cold batch is an AUP breach on the account that also carries signup/password-reset mail. **Pause cold sends through Resend until the cold stream is re-homed.**

---

## 1. Are we using Resend to its fullest?

**No.** Verified against the code:

**Done well** — `src/app/api/webhooks/resend/route.ts`: Svix-verified webhook, full event-type set, idempotent `email_events` mirror, hardwired bounce/complaint → suppression. `resend-inbound/route.ts` threads replies. The human batch sender (`scripts/process-sequence-batch.mjs:172`) correctly sends true `text:` for text-format templates (the HTML-shell concern applies only to the *cron* sender).

**Left on the table (all free, all confirmed absent — send payloads carry only `from/to/subject/text`):**

| Feature | Why it matters here |
|---|---|
| `List-Unsubscribe` + `List-Unsubscribe-Post` one-click | #1 free Gmail Primary-vs-Spam signal for marketing-class mail (RFC 8058) |
| `reply_to` | Coach replies hit `admin@` not a monitored inbox; you already built `resend-inbound` plumbing |
| `Idempotency-Key` | DB status flags don't survive a crash between POST-success and DB-write |
| `tags` | No per-cohort bounce/complaint segmentation → can't pull a toxic segment before AUP thresholds |
| Managed suppression list | Free second net behind `crm_email_suppressions` |
| Audiences/Broadcasts | For opted-in mail only — auto one-click unsubscribe |

Batch API and `scheduled_at` are low-value at 40–50/day (and can't be combined — batch has no `scheduled_at`).

---

## 2. Is the setup correct/optimal?

**No — two structural defects:**

1. **Cold + transactional share the root domain.** Cold sends `admin@helmsportslabs.com` (`process-sequence-batch.mjs:44`, `send-coach-batch.mjs:30`); transactional uses `notifications@helmsportslabs.com` (`task-reminders.ts:15`) + Supabase auth resets/signups on the same root. Hard bounces/complaints suppress **account-wide**, so a cold complaint degrades — or via AUP suspension, kills — password-reset deliverability.
2. **Missing compliance affordances** — no List-Unsubscribe, no reply_to, no CAN-SPAM physical-address footer on cold sends.

Plus: an **unverified scraped `.edu` list** risks the 4% hard-bounce kill threshold; the **cron sender** wraps cold mail in a branded HTML shell (`process-sequences/route.ts:505`).

---

## 3. Does Resend's ToS even allow this? (No — verified.)

[Resend AUP](https://resend.com/legal/acceptable-use), verbatim:
> "You are prohibited from sending unsolicited messages of any kind, including cold outreach, purchased lists, or scraped contact data."
> "All mail must be sent to recipients who have explicitly opted in… Sending to unsolicited recipients is not permitted on Resend."

Kill-thresholds in the same policy: **complaint rate < 0.08%** (~1 per 1,250 sends), **bounce rate < 4%**, account "may be shutdown without warning," no refund. Because cold + transactional share one account, **suspension = product outage** (signups/resets stop). Switching to Postmark/SendGrid/Mailgun does **not** help — they ban cold too.

**Important distinction:** cold B2B email is **legal** under US CAN-SPAM — accurate headers, honest subject, valid physical postal address, working unsubscribe honored within 10 business days (per-email penalty up to ~$53,088 as of Jan 2025). This is a **vendor-contract** problem, not a legality problem.

---

## 4. Stay or switch?

**Split the streams.**

- **Stay on Resend for transactional + opt-in** — it's the right tool: free 3,000/mo·100/day, Pro $20/mo lifts the daily cap + gives 10 domains. Plumbing already correct.
- **Switch cold OFF Resend** to a cold-permitted tool on a **separate domain** (not the product/billing domain). Cost-conscious path: a cheap **GolfHelm-branded** cold domain (~$10/yr — recognizable to coaches *and* reputation-isolated, e.g. a `getgolfhelm`/`golfhelm`-style domain) + one Google Workspace seat (~$7/mo) + **GMass** (usable free tier, ToS permits cold). Outgrow it → **Instantly** (~$37/mo) or **Smartlead** (~$39/mo) add warmup + inbox rotation + a unified reply inbox — the cold-specific features Resend structurally lacks.
- **Do NOT** buy a Resend dedicated IP ($30/mo, Scale, needs >500/day) — at 40–50/day it would stay cold and *hurt* deliverability.
- The ~$7/mo Workspace seat is the only near-unavoidable spend; cheap insurance against a banned Resend account that also kills product email.
- Keep `crm_coaches` / `email_events` / Supabase as the system-of-record; just repoint sends off `api.resend.com`.

---

## 5. Free tools to add

Separate domain (DNS, $0–10/yr) · **MillionVerifier** (10k free credits, never expire — covers the list ~4×) · DMARC RUA parser — **Postmark DMARC** / Cloudflare / dmarcian (free) · **mail-tester** (~3/day) · **GlockApps** (2 placement tests/mo) · **Google Postmaster Tools v2** (free; sparse at this volume — don't read an empty dashboard as "clean") · **MXToolbox** blacklist monitor (free). Warmup is a **paid** category — substitute behavioral warmup (slow ramp); don't spend on it.

---

## 6. Action items

- **P0 — Stop cold-sending through Resend now.** Pause `process-sequence-batch.mjs` / `send-coach-batch.mjs` / the `process-sequences` cron against `admin@helmsportslabs.com`. Active AUP violation that risks the account that also sends password resets/signups.
- **P0 — Stand up a separate cold domain** (GolfHelm-branded, not the product/billing domain), ~$10/yr, with its own SPF + DKIM + DMARC (`p=none`, `rua=` → free parser). Provision one Google Workspace mailbox.
- **P0 — Re-home cold sends** onto cold-permitted infra (GMass free tier from the new mailbox), repointing the existing ranked-lead pipeline (`coach-priority.mjs`, 7-day cap, status flips) at the new sender. Keep `crm_coaches`/`email_events` as system-of-record.
- **P1 — Verify the ~2,300 list** once via MillionVerifier; drop invalid/role/disposable; treat catch-all `.edu` as risky-but-slow, not valid.
- **P1 — Add** List-Unsubscribe + List-Unsubscribe-Post, reply_to (monitored inbox), and a CAN-SPAM footer (physical postal address + working unsubscribe) to every cold send on the new platform.
- **P1 — Warm** the new domain/mailbox: 5–10/day wk1 → 40–50/day by ~wk4; keep ≤1 email/coach/week + 7-day cap.
- **P2 — Free monitoring stack** on the cold domain: Google Postmaster Tools, MXToolbox blacklist monitor, a DMARC RUA parser, mail-tester before template changes (+ GlockApps 2/mo for Primary placement).
- **P2 — Resend (transactional) side:** keep for signups/resets/opt-in; consider Pro ($20/mo) to remove the 100/day cap that throttles real product mail; add Idempotency-Key + Tags; use Audiences/Broadcasts for opted-in only.
- **P3 — Fix or retire the cron sequence sender** (`process-sequences/route.ts:505` branded HTML shell) — moot once cold leaves Resend.
- **P3 — Document routing** in `RESEND-INTEGRATION.md`: Resend = transactional + opt-in on `helmsportslabs.com`; cold tool = outreach on the separate domain. Integration tests asserting suppressed coaches skip + List-Unsubscribe present + idempotency key present.

---

## Resend config checklist

**Transactional (keep on Resend, `helmsportslabs.com`):**
- [ ] Add `Idempotency-Key` to transactional sends
- [ ] Add `tags` for segmentation
- [ ] Verify SPF/DKIM/DMARC on the root domain; keep the `email_events` mirror (your only record beyond Resend's 30-day retention)
- [ ] Use Audiences/Broadcasts for **opted-in** contacts only (never the cold list)
- [ ] Consider Pro ($20/mo) to remove the 100/day cap that currently throttles real product mail
- [ ] Keep webhook + Svix verification + bounce/complaint suppression (already correct)

**Cold (move OFF Resend, separate domain):**
- [ ] Buy separate cold domain + Google Workspace mailbox; configure SPF + DKIM + DMARC (`p=none`, `rua=` → free parser)
- [ ] Verify the ~2,300 list via MillionVerifier; drop invalid/role/disposable
- [ ] Send via GMass (free) / Instantly / Smartlead — repoint pipeline off `api.resend.com`
- [ ] Add List-Unsubscribe + List-Unsubscribe-Post, reply_to, CAN-SPAM physical-address footer
- [ ] Warm: 5–10/day wk1 → 40–50/day by wk4; keep ≤1 email/coach/week + 7-day cap
- [ ] Stand up Google Postmaster Tools + MXToolbox blacklist monitor; run mail-tester before template changes
