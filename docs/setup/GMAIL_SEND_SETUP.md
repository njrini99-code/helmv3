# Gmail API direct send — setup (cold outreach via your real mailbox)

This makes the CRM **"Gmail" buttons send cold email straight through your
Google Workspace mailbox** (`admin@helmsportslabs.com`) using the Gmail API —
instead of opening a compose tab, and instead of going through Resend.

## Why bother

For **1:1 cold outreach**, a message sent from a real, warmed Workspace mailbox
lands in the recipient's **Primary** tab far more reliably than a bulk-ESP send.
The send is a true `text/plain`, personalized, one-recipient email — the same
envelope a human would type — which is the single biggest lever for inbox
placement. The app also:

- **paces** the batch (a delay between sends),
- **caps** sends per day (`GMAIL_DAILY_CAP`, default 50),
- checks the **suppression list** and `email_status` before every send,
- sends **one email per school** (head/primary decision-maker only).

> **It's off until you complete the setup below.** With the env vars unset, the
> "Gmail" buttons keep their current behavior (open a pre-filled compose tab).
> Nothing else changes.

---

## What you'll set up

A **Google Cloud service account** with **domain-wide delegation (DWD)**, scoped
to **only** `gmail.send`, allowed to impersonate your mailbox. No interactive
OAuth, no refresh-token expiry — the server mints a short-lived token per send.

You need **Google Workspace admin** access to `helmsportslabs.com`. ~15 minutes.

---

## Step 1 — Create a Google Cloud project + service account

1. Go to <https://console.cloud.google.com/> → create (or pick) a project.
2. **APIs & Services → Library →** search **"Gmail API" → Enable**.
3. **APIs & Services → Credentials → Create credentials → Service account**.
   - Name it e.g. `helm-crm-gmail-sender`. No project roles needed. Create.
4. Open the service account → **Keys → Add key → Create new key → JSON**.
   - A `.json` file downloads. Keep it secret. You'll copy two fields out of it:
     `client_email` and `private_key`.
5. On the service account's **Details** tab, copy the **Unique ID** (a long
   number, the "Client ID") — you'll need it in Step 2.

## Step 2 — Authorize domain-wide delegation in Workspace Admin

1. Go to <https://admin.google.com/> → **Security → Access and data control →
   API controls → Domain-wide delegation → Manage domain-wide delegation**.
2. **Add new**:
   - **Client ID:** the service account's **Unique ID** from Step 1.5.
   - **OAuth scopes:** `https://www.googleapis.com/auth/gmail.send`
     (this scope ONLY — least privilege; it can send but not read your mail).
   - **Authorize.**

> Propagation can take a few minutes (occasionally up to ~24h, but usually fast).

## Step 3 — Set the environment variables

Set these in Vercel (Project → Settings → Environment Variables) for
**Production** (and Preview if you want to test there), and in `.env.local`
locally:

| Variable | Value |
|---|---|
| `GMAIL_SA_CLIENT_EMAIL` | the JSON's `client_email` (`…@<project>.iam.gserviceaccount.com`) |
| `GMAIL_SA_PRIVATE_KEY` | the JSON's `private_key` — the whole `-----BEGIN PRIVATE KEY-----…` block |
| `GMAIL_SEND_AS` | `admin@helmsportslabs.com` (the mailbox to send as) |
| `HELM_FROM_NAME` | *(optional)* display name on the From header, e.g. `Nick Rini` |
| `GMAIL_DAILY_CAP` | *(optional)* per-day send cap, default `50` |

**About `GMAIL_SA_PRIVATE_KEY`:** the JSON stores it with literal `\n`
sequences. You can paste it exactly as-is (single line with `\n`) — the code
restores the real newlines. In the Vercel UI you can also paste the multi-line
PEM directly; both work.

Redeploy after setting them. The CRM shows a green **"Direct send"** badge in the
Gmail-template bar once it detects the config — that's how you know it's live.

---

## How it behaves once configured

- **Per-coach "Send"** (Today queue, Coaches list, school-group header, detail
  panel): one click sends immediately to that coach via the Gmail API, marks
  them **contacted**, and logs a contact-log row. No compose tab.
- **"Send next 10"** (Gmail-template bar): sends a paced batch — head/primary
  decision-maker, **one per school**, `new_lead`, valid email, not contacted in
  the last 7 days, not suppressed. Asks for confirmation first.
- Every send respects the **daily cap**; once hit, sends stop until tomorrow.

## Staying out of spam (READ THIS — it's the difference between Primary and Spam)

The send *shape* is already optimized (true text/plain, no pixels, no link-
wrapping, no bulk headers, paced, capped, deduped, suppression-gated, sent from a
real authenticated mailbox). But **deliverability is mostly about domain auth,
warm-up, and behavior — not code.** The three things below are what actually
decide Primary vs Spam, in priority order.

### 1. Authenticate the domain — DKIM is NOT automatic on a fresh Workspace domain

This is the **#1 real-world miss.** Google signs your mail with SPF + DKIM only
if DNS is set up correctly:

- **DKIM — you must turn it on manually.** Admin console → **Apps → Google
  Workspace → Gmail → Authenticate email** → generate the key → publish the
  `google._domainkey` TXT record in DNS → click **Start authentication**. A fresh
  domain ships with a placeholder and is **not** DKIM-signing until you do this.
  Skip it and DMARC alignment fails → cold mail goes to Spam.
- **SPF:** the domain's TXT record must include `include:_spf.google.com`.
- **DMARC:** `_dmarc.helmsportslabs.com` must exist (you already have DMARC
  reporting wired). While warming, keep policy at `p=none` or `p=quarantine` —
  a `p=reject` policy with broken DKIM will hard-bounce your own outreach.

Verify all three before the first send (e.g. send yourself a test, then "Show
original" in Gmail and confirm SPF=pass, DKIM=pass `d=helmsportslabs.com`,
DMARC=pass).

### 2. Warm up — the ramp is now AUTOMATIC

Starting at 50/day from a mailbox with no sending history is the classic
outbound-spam trip. **The app now enforces a warm-up ramp for you**, keyed off
the first Gmail send in the log:

| Mailbox age | Effective daily cap |
|---|---|
| Day 0 (first day) | `5` |
| Day 1 | `10` |
| Day 2+ | your `GMAIL_DAILY_CAP` (default `50`) |

You don't have to touch the env var weekly — the cap auto-ramps and never exceeds
`GMAIL_DAILY_CAP`. (You can still lower `GMAIL_DAILY_CAP` to be *more*
conservative.) Sends are also **jitter-paced** (~2–6s apart) so the cadence looks
human. Set up **Google Postmaster Tools** for `helmsportslabs.com` and watch the
spam-rate + domain-reputation dashboards; stop if spam rate climbs.

### 3. Use the right From identity

- **Prefer a human-named mailbox** (`nick@helmsportslabs.com`) over the `admin@`
  role address for `GMAIL_SEND_AS`. A role address reads as automated and
  slightly underperforms for cold; it also means cold-outreach reputation risk
  lands on your operational/admin mailbox. `HELM_FROM_NAME` already defaults to a
  personal name, but the address itself matters too.
- Cold outreach carries **reputation risk to whatever mailbox sends it.** A
  dedicated human mailbox on the same domain isolates that risk from `admin@`
  while still sharing (good) domain reputation.

### Also

- **Personalize.** The templates merge name/school/etc.; keep them that way.
  Identical bulk copy from a real mailbox still looks like spam.
- **Watch the copy.** Avoid ALL-CAPS subjects, exclamation-heavy text, words like
  "free"/"guarantee," and **keep links to one** (a single calendar link is fine;
  multiple links or URL shorteners hurt). No tracking pixels, no image-only body.
- **List hygiene + bounces.** Bounces are a strong spam signal for a warming
  domain — the send path only contacts `email_status='valid'` addresses, so make
  sure that flag is actually populated by a verifier. Keep bounce rate under
  ~2–3%; stop and clean the list if it climbs.
- **Honor replies and opt-outs.** Replies are the real signal; if someone asks to
  stop, add them to the suppression list (the send path already skips it).

> Do **not** add a `List-Unsubscribe` header to these sends. That header is for
> bulk/list mail and *signals* "bulk" to Gmail — for genuine 1:1 cold outreach it
> hurts placement. (It's intentionally absent.)

## Revoking

Remove the env vars (or delete the DWD entry in Workspace Admin, or delete the
SA key in Cloud Console). The app falls back to the compose-tab flow instantly.
