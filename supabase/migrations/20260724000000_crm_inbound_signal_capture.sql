-- ============================================================================
-- CRM inbound signal capture
--
-- For roughly six weeks every inbound buying signal that was not a Resend
-- delivery event landed somewhere unqueryable or nowhere at all. This
-- migration adds the columns and the one table the capture paths need; the
-- application changes that populate them ship alongside it.
--
-- What was measured in production before writing this (2026-07-24):
--
--   * Scanner prefetch dominates engagement. 1,133 of 1,218 recorded link
--     clicks (93%) fired less than 2 minutes after delivery, and 178 of 220
--     demo-gate sessions fired less than 2 minutes after that coach's send
--     timestamp. Corporate scanners spoof real browser user-agents — 79
--     sessions shared a single "Chrome/142.0.7..." UA across 49 distinct
--     IPs — so UA blocklists and bot-name regexes cannot separate them. The
--     only reliable discriminators are delivery-to-event latency and IP
--     fan-out for an identical UA, neither of which can be recomputed from
--     a row after the fact. The verdict is therefore stored per row.
--
--   * golf_demo_sessions held 220 rows and never once touched crm_coaches.
--     A coach who toured the entire product stayed invisible to pipeline.
--
--   * demo_requests.name / organization / phone / message sat empty while
--     the submit action concatenated name + school into the free-text notes
--     column, and captureRequestContext() collected ip / user-agent /
--     referer / country / city and then discarded all of it. Attribution
--     for every request to date is unrecoverable.
--
--   * crm_replies has 0 rows all-time. The Gmail ingest cron discarded any
--     reply whose sender was not already in crm_coaches, producing neither
--     a row nor a log line, so cold inbound to admin@ vanished silently.
--     crm_unmatched_inbound is the landing zone for exactly those messages.
--
--   * 170 email_events rows are email.opened / email.clicked with a NULL
--     contact_log_id. A null coach short-circuited the whole automations
--     block: no status change, no task, no sequence enrollment.
--
-- Everything below is guarded (IF NOT EXISTS / DO-block policy guard) and is
-- safe to re-run. No existing CHECK constraint is touched.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Demo-gate sessions (golf + baseball)
--
-- Both tables are written exclusively by the gate server action through the
-- service-role client and carry a RESTRICTIVE deny-all policy, so no new RLS
-- work is required here — the added columns inherit the table's posture.
-- ----------------------------------------------------------------------------

ALTER TABLE public.golf_demo_sessions
  ADD COLUMN IF NOT EXISTS traffic_quality text,
  ADD COLUMN IF NOT EXISTS quality_reason  text,
  ADD COLUMN IF NOT EXISTS crm_coach_id    uuid
    REFERENCES public.crm_coaches (id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.golf_demo_sessions'::regclass
      AND conname = 'golf_demo_sessions_traffic_quality_check'
  ) THEN
    ALTER TABLE public.golf_demo_sessions
      ADD CONSTRAINT golf_demo_sessions_traffic_quality_check
      CHECK (traffic_quality IN ('automated', 'likely_human', 'unknown'));
  END IF;
END $$;

COMMENT ON COLUMN public.golf_demo_sessions.traffic_quality IS
  'Verdict on whether this gate entry was a human or a security scanner: '
  'automated | likely_human | unknown. 178 of the first 220 rows in this '
  'table fired under 2 minutes after the demo-invite send timestamp, and the '
  'demo-invite email carries an auto-submitting gate link, so a scanner '
  'following that link manufactured a complete session including name, email '
  'and school. Scanners spoof real browser user-agents (79 sessions shared '
  'one Chrome/142 UA across 49 distinct IPs), so the verdict cannot be '
  'reconstructed later from user_agent — it is classified at write time from '
  'send-to-entry latency and IP fan-out, and stored here so pipeline counts '
  'can exclude automated rows instead of reporting 220 fake tours.';

COMMENT ON COLUMN public.golf_demo_sessions.quality_reason IS
  'Human-readable justification for traffic_quality (for example the measured '
  'send-to-entry latency, or the IP fan-out count for the shared user-agent). '
  'Kept alongside the verdict because the classifier is heuristic and will be '
  'retuned; without the reason a misclassified row is unauditable.';

COMMENT ON COLUMN public.golf_demo_sessions.crm_coach_id IS
  'Links a demo tour back to the CRM coach it belongs to. Gate entry used to '
  'write only to this table and never create or touch a crm_coaches row, so '
  'all 220 recorded tours — including coaches who walked the entire product — '
  'were invisible to the pipeline. ON DELETE SET NULL so purging a coach '
  'never destroys the traffic-quality evidence.';

CREATE INDEX IF NOT EXISTS golf_demo_sessions_traffic_quality_entered_at_idx
  ON public.golf_demo_sessions (traffic_quality, entered_at DESC);

CREATE INDEX IF NOT EXISTS golf_demo_sessions_crm_coach_id_idx
  ON public.golf_demo_sessions (crm_coach_id);


ALTER TABLE public.baseball_demo_sessions
  ADD COLUMN IF NOT EXISTS traffic_quality text,
  ADD COLUMN IF NOT EXISTS quality_reason  text,
  ADD COLUMN IF NOT EXISTS crm_coach_id    uuid
    REFERENCES public.crm_coaches (id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.baseball_demo_sessions'::regclass
      AND conname = 'baseball_demo_sessions_traffic_quality_check'
  ) THEN
    ALTER TABLE public.baseball_demo_sessions
      ADD CONSTRAINT baseball_demo_sessions_traffic_quality_check
      CHECK (traffic_quality IN ('automated', 'likely_human', 'unknown'));
  END IF;
END $$;

COMMENT ON COLUMN public.baseball_demo_sessions.traffic_quality IS
  'Verdict on whether this gate entry was a human or a security scanner: '
  'automated | likely_human | unknown. Mirrors '
  'golf_demo_sessions.traffic_quality — the baseball gate is the same code '
  'path with the same auto-submitting demo-invite link, so it is exposed to '
  'the same scanner prefetch that made 93% of recorded link clicks machine '
  'traffic. Classified at write time from send-to-entry latency and IP '
  'fan-out, never from the user-agent, which scanners spoof.';

COMMENT ON COLUMN public.baseball_demo_sessions.quality_reason IS
  'Human-readable justification for traffic_quality. See '
  'golf_demo_sessions.quality_reason — the classifier is heuristic and will '
  'be retuned, so the reason is stored to keep verdicts auditable.';

COMMENT ON COLUMN public.baseball_demo_sessions.crm_coach_id IS
  'Links a demo tour back to the CRM coach it belongs to. The baseball gate, '
  'like the golf one, wrote only to this table and never created or touched a '
  'crm_coaches row, so a toured prospect left no coach-level trace. '
  'ON DELETE SET NULL so purging a coach never destroys the evidence.';

CREATE INDEX IF NOT EXISTS baseball_demo_sessions_traffic_quality_entered_at_idx
  ON public.baseball_demo_sessions (traffic_quality, entered_at DESC);

CREATE INDEX IF NOT EXISTS baseball_demo_sessions_crm_coach_id_idx
  ON public.baseball_demo_sessions (crm_coach_id);


-- ----------------------------------------------------------------------------
-- 2. demo_requests — persist the attribution the submit action already had
--
-- captureRequestContext() has been collecting all of this per submission and
-- using it only for error logs and the ops alert. The existing interest_type
-- and status CHECK constraints are deliberately left untouched.
-- ----------------------------------------------------------------------------

ALTER TABLE public.demo_requests
  ADD COLUMN IF NOT EXISTS source       text,
  ADD COLUMN IF NOT EXISTS referer      text,
  ADD COLUMN IF NOT EXISTS ip           text,
  ADD COLUMN IF NOT EXISTS user_agent   text,
  ADD COLUMN IF NOT EXISTS country      text,
  ADD COLUMN IF NOT EXISTS city         text,
  ADD COLUMN IF NOT EXISTS crm_coach_id uuid
    REFERENCES public.crm_coaches (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.demo_requests.source IS
  'Which surface produced this request: landing | pricing | mobile_nav. The '
  'form is mounted in three places and the row recorded none of them, so '
  'there was no way to tell which surface actually converts. Free text rather '
  'than a CHECK so a new surface does not require a migration, matching how '
  'the rest of this table treats its soft enums.';

COMMENT ON COLUMN public.demo_requests.referer IS
  'Referer header at submit time. Collected by captureRequestContext() and '
  'then dropped — it survived only in error logs, so inbound attribution for '
  'every request to date is unrecoverable.';

COMMENT ON COLUMN public.demo_requests.ip IS
  'Client IP at submit time. Collected by captureRequestContext() and then '
  'dropped. Needed here for the same reason the demo-gate tables need it: IP '
  'fan-out for an identical user-agent is one of only two reliable signals '
  'that a submission is automated rather than human.';

COMMENT ON COLUMN public.demo_requests.user_agent IS
  'User-agent at submit time. Collected by captureRequestContext() and then '
  'dropped. Recorded for forensics only — it is NOT a trustworthy bot signal, '
  'because scanners spoof real browser user-agents (79 demo sessions shared '
  'one Chrome/142 UA across 49 distinct IPs).';

COMMENT ON COLUMN public.demo_requests.country IS
  'Geo country from the edge request context. Collected by '
  'captureRequestContext() and then dropped; without it a request cannot be '
  'territory-routed or sanity-checked against the school it names.';

COMMENT ON COLUMN public.demo_requests.city IS
  'Geo city from the edge request context. Collected by '
  'captureRequestContext() and then dropped. Same rationale as country.';

COMMENT ON COLUMN public.demo_requests.crm_coach_id IS
  'The crm_coaches row this request belongs to. The submit action skipped '
  'creating the convenience coach row whenever the email already existed, so '
  'a repeat request from a known coach left no coach-level trace at all. '
  'Storing the link on the request makes the association explicit instead of '
  'inferring it from a case-sensitive email join. ON DELETE SET NULL so '
  'purging a coach never deletes the inbound request itself.';

CREATE INDEX IF NOT EXISTS idx_demo_requests_crm_coach_id
  ON public.demo_requests (crm_coach_id);


-- ----------------------------------------------------------------------------
-- 3. crm_unmatched_inbound — the landing zone for cold inbound email
--
-- The Gmail ingest cron resolved each sender against crm_coaches and, on a
-- miss, dropped the message with no row and no log. crm_replies has 0 rows
-- all-time; a cold prospect emailing admin@ produced literally nothing. Every
-- message that fails coach resolution now lands here instead, and an admin can
-- promote it into crm_coaches.
--
-- RLS: this table stores raw inbound email bodies, which is the most sensitive
-- content in the CRM. Most crm_* tables carry PERMISSIVE policies predicated on
-- users.role = 'admin', which grants direct authenticated read. That is
-- deliberately NOT used here. Instead this follows the posture the demo-session
-- tables use for service-role-written capture tables: a single RESTRICTIVE
-- deny-all policy, no anon or authenticated policy of any kind. The ingest cron
-- writes with the service-role client and admins read via createAdminClient(),
-- both of which bypass RLS, so no reachable role can read message bodies
-- through PostgREST.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.crm_unmatched_inbound (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  message_id        text        NOT NULL,
  thread_id         text,
  from_address      text        NOT NULL,
  to_addresses      text[],
  subject           text,
  body_text         text,
  body_html         text,
  received_at       timestamptz NOT NULL,
  raw_payload       jsonb       NOT NULL DEFAULT '{}',
  promoted_coach_id uuid        REFERENCES public.crm_coaches (id) ON DELETE SET NULL,
  reviewed          boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_unmatched_inbound_pkey PRIMARY KEY (id),
  CONSTRAINT crm_unmatched_inbound_message_id_key UNIQUE (message_id)
);

COMMENT ON TABLE public.crm_unmatched_inbound IS
  'Inbound email from senders who are not in crm_coaches. The Gmail ingest '
  'cron used to discard these outright — no row, no log — which is why '
  'crm_replies has 0 rows all-time and cold inbound to admin@ was invisible. '
  'Written exclusively by the ingest cron (service-role client); admins read '
  'via createAdminClient(). No public access — the RESTRICTIVE deny-all policy '
  'blocks every anon and authenticated request, and service-role bypasses RLS.';

COMMENT ON COLUMN public.crm_unmatched_inbound.id IS
  'Surrogate key. Deliberately separate from message_id so an admin action '
  'can reference a queued message by a stable internal id that does not leak '
  'the RFC 822 Message-ID into URLs or client payloads.';

COMMENT ON COLUMN public.crm_unmatched_inbound.message_id IS
  'RFC 822 Message-ID from Gmail. UNIQUE so the cron can re-run or backfill a '
  'wider window without duplicating rows — the ingest lookback was hardcoded '
  'to 2 days and 50 messages, so any outage longer than that needs a backfill '
  'and the backfill must be idempotent.';

COMMENT ON COLUMN public.crm_unmatched_inbound.thread_id IS
  'Gmail thread id, so a later promotion can pull the whole conversation into '
  'crm_replies rather than just the single message that triggered the miss.';

COMMENT ON COLUMN public.crm_unmatched_inbound.from_address IS
  'Raw sender address exactly as Gmail reported it, NOT lower-cased. The '
  'ingest path matched senders against crm_coaches.email case-sensitively '
  'while keying its own map lower-cased, so any coach whose stored email had '
  'an uppercase character never matched. Preserving the raw casing here keeps '
  'that class of miss diagnosable instead of silently normalising it away.';

COMMENT ON COLUMN public.crm_unmatched_inbound.to_addresses IS
  'Recipients of the inbound message, used to tell which alias was contacted '
  '(admin@ versus a rep address) when triaging an unmatched sender.';

COMMENT ON COLUMN public.crm_unmatched_inbound.subject IS
  'Subject line — the fastest signal for an admin triaging whether an '
  'unmatched sender is a real prospect, an auto-reply, or noise.';

COMMENT ON COLUMN public.crm_unmatched_inbound.body_text IS
  'Plain-text body. A reply is the strongest buying signal the CRM can '
  'receive and there is no Resend event for it (replies never touch Resend by '
  'product decision), so if it is not stored here it does not exist anywhere.';

COMMENT ON COLUMN public.crm_unmatched_inbound.body_html IS
  'HTML body, retained so a promoted message renders in the CRM inbox exactly '
  'as it was sent rather than as a lossy text flattening.';

COMMENT ON COLUMN public.crm_unmatched_inbound.received_at IS
  'When the message was received, per Gmail. Named to match '
  'crm_replies.received_at, which likewise has no created_at, so the two '
  'tables sort and join on the same column name.';

COMMENT ON COLUMN public.crm_unmatched_inbound.raw_payload IS
  'Full Gmail message payload. The whole point of this table is that these '
  'messages were previously destroyed at the point of the coach lookup, so '
  'the raw payload is kept to make any future re-parse possible without '
  'needing the Gmail API to still hold the message.';

COMMENT ON COLUMN public.crm_unmatched_inbound.promoted_coach_id IS
  'Set once an admin promotes this sender into crm_coaches, recording which '
  'coach the message became. ON DELETE SET NULL so deleting the promoted '
  'coach reverts the row to unpromoted rather than deleting the only copy of '
  'the inbound message.';

COMMENT ON COLUMN public.crm_unmatched_inbound.reviewed IS
  'Whether a human has triaged this row. Defaults to false so new cold '
  'inbound surfaces as an actionable queue — the failure mode being fixed is '
  'precisely that these messages were never surfaced to anyone.';

COMMENT ON COLUMN public.crm_unmatched_inbound.created_at IS
  'When the ingest cron wrote the row, as distinct from received_at. The gap '
  'between the two measures ingest lag and makes a stalled or unarmed cron '
  'visible, which the previous ok/skipped-not-armed HTTP 200 response hid.';

ALTER TABLE public.crm_unmatched_inbound ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'crm_unmatched_inbound'
      AND policyname = 'crm_unmatched_inbound_deny_all'
  ) THEN
    CREATE POLICY "crm_unmatched_inbound_deny_all"
      ON public.crm_unmatched_inbound
      AS RESTRICTIVE
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crm_unmatched_inbound_reviewed_received_at
  ON public.crm_unmatched_inbound (reviewed, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_unmatched_inbound_promoted_coach_id
  ON public.crm_unmatched_inbound (promoted_coach_id);


-- ----------------------------------------------------------------------------
-- 4. email_events — attribute engagement that never resolved a contact log
-- ----------------------------------------------------------------------------

ALTER TABLE public.email_events
  ADD COLUMN IF NOT EXISTS coach_id uuid
    REFERENCES public.crm_coaches (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.email_events.coach_id IS
  'The crm_coaches row this engagement event belongs to, resolved directly '
  'rather than only through contact_log_id. 170 rows are email.opened or '
  'email.clicked with contact_log_id IS NULL: when the Resend payload email_id '
  'failed to resolve a crm_contact_log row the coach came out null and the '
  'entire automations block was skipped, so the event produced no status '
  'change, no task and no sequence enrollment. Those rows are recoverable by '
  'resolving the coach from recipient_email, and this column stores that '
  'result so the recovery runs once instead of on every read. It also keeps '
  'crm_coaches.last_email_event_at / last_email_event_type — frozen at '
  '2026-06-25 while this table kept receiving events — mirrorable from a '
  'single indexed column. ON DELETE SET NULL so the raw event survives a '
  'coach purge.';

CREATE INDEX IF NOT EXISTS idx_email_events_coach_id
  ON public.email_events (coach_id);
