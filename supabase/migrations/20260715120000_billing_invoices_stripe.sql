-- ============================================================================
-- Migration: 20260715120000_billing_invoices_stripe.sql
-- Packet: stripe-invoicing (Stripe Invoicing + Tax scaffold, 2026-07-15)
--
-- WHY: The Stripe Invoicing scaffold (src/lib/stripe/server.ts,
-- src/app/admin/actions/billing.ts, src/app/api/webhooks/stripe/route.ts)
-- currently has NO persistence. Invoices exist only in Stripe; the webhook has
-- TODO(persistence) markers with nowhere to write. This adds the two tables it
-- needs:
--
--   1. billing_customers  — idempotent org -> Stripe customer mapping, so we
--      reuse one Stripe Customer per organization instead of matching by email
--      on every invoice (avoids duplicate customers).
--   2. billing_invoices   — a local record per Stripe invoice, kept in sync by
--      the webhook (finalized/sent/paid/payment_failed/void). Source of truth
--      stays Stripe; this is a queryable mirror for admin reporting + dunning.
--
-- PAYER ENTITY: public.organizations (the college/JUCO/HS/showcase record that
-- gets billed). organization_id is NULLABLE on billing_invoices because a
-- Stripe invoice can be created ad hoc (raw name/email/address) before it's
-- linked to an org row; the FK is ON DELETE SET NULL so deleting an org never
-- destroys its historical invoice records.
--
-- SECURITY / RLS: This is platform-plane billing data — NOT tenant-readable.
-- Both tables get RLS ENABLED with NO permissive policies (deny-by-default):
-- ordinary authenticated users (players/coaches) can never SELECT or write
-- these rows. All access is exclusively through the super-admin-gated
-- service-role path — createAdminClient() (SUPABASE_SERVICE_ROLE_KEY) bypasses
-- RLS by design, and every caller in app code is behind requireSuperAdmin()
-- (billing.ts) or Stripe signature verification (the webhook route). Enabling
-- RLS with zero policies is the intended, most-restrictive posture here; it is
-- deliberate, not an oversight, so the linter's "table has RLS but no policy"
-- advisory is expected and correct for these two tables.
--
-- Replay-safe: guarded with IF NOT EXISTS / to_regclass and DROP ... IF EXISTS
-- so it applies cleanly on the CI shadow DB (from migration 0) and on prod.
-- Purely additive — two new tables, no changes to existing objects.
--
-- STATUS: APPLIED to production 2026-07-29.
--
-- Pre-apply verification run against prod before touching it:
--   · public.organizations                  EXISTS  (both FKs resolve)
--   · public.billing_customers / _invoices  ABSENT  (clean create, no clash)
--   · service_role has BYPASSRLS            TRUE    (FORCE RLS cannot lock out
--                                                    createAdminClient)
--   · public.set_updated_at()               ABSENT  <- draft defect, see §3
-- ============================================================================

-- ── 1. org -> Stripe customer mapping ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_customers (
  organization_id    uuid PRIMARY KEY
                       REFERENCES public.organizations(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL UNIQUE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.billing_customers IS
  'Idempotent organization -> Stripe customer id mapping. Platform-plane; RLS deny-by-default, service-role access only.';

-- ── 2. local mirror of Stripe invoices ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_invoice_id  text NOT NULL UNIQUE,
  stripe_customer_id text NOT NULL,
  organization_id    uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  customer_email     text,
  -- Stripe invoice status: draft | open | paid | uncollectible | void
  status             text NOT NULL,
  currency           text NOT NULL DEFAULT 'usd',
  -- Money in the smallest currency unit (cents). bigint to match Stripe's
  -- 64-bit amount fields (integer/int4 would cap at ~$21.5M).
  total              bigint NOT NULL DEFAULT 0,
  amount_paid        bigint NOT NULL DEFAULT 0,
  tax                bigint,                        -- null until computed
  hosted_invoice_url text,
  invoice_pdf        text,
  memo               text,
  created_by         uuid,                          -- admin auth user id
  finalized_at       timestamptz,
  paid_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.billing_invoices IS
  'Local mirror of Stripe invoices, synced by the Stripe webhook. Platform-plane; RLS deny-by-default, service-role access only. Stripe remains source of truth.';

CREATE INDEX IF NOT EXISTS billing_invoices_organization_id_idx
  ON public.billing_invoices (organization_id);
CREATE INDEX IF NOT EXISTS billing_invoices_status_idx
  ON public.billing_invoices (status);
CREATE INDEX IF NOT EXISTS billing_invoices_stripe_customer_id_idx
  ON public.billing_invoices (stripe_customer_id);

-- ── 3. updated_at triggers ───────────────────────────────────────────────────
-- The draft referenced `public.set_updated_at()`, which DOES NOT EXIST in this
-- database — verified before applying. Because the block was guarded on
-- to_regprocedure(), it would have silently skipped and left `updated_at`
-- frozen at insert time forever, on a table whose whole job is to mirror a
-- changing remote status. The real repo convention is
-- `public.update_updated_at_column()` (no args, RETURNS trigger, 24 existing
-- triggers use it).
--
-- The guard is kept — it is what makes this replay-safe on a CI shadow DB built
-- from migration 0, where the function may not exist yet — but it now raises a
-- NOTICE instead of failing silently, so a future environment missing the
-- function is visible in the apply log rather than discovered months later via
-- stale timestamps.
DO $$
BEGIN
  IF to_regprocedure('public.update_updated_at_column()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS set_billing_customers_updated_at ON public.billing_customers;
    CREATE TRIGGER set_billing_customers_updated_at
      BEFORE UPDATE ON public.billing_customers
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

    DROP TRIGGER IF EXISTS set_billing_invoices_updated_at ON public.billing_invoices;
    CREATE TRIGGER set_billing_invoices_updated_at
      BEFORE UPDATE ON public.billing_invoices
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  ELSE
    RAISE NOTICE 'public.update_updated_at_column() not found — billing updated_at triggers SKIPPED; updated_at will not self-maintain.';
  END IF;
END $$;

-- ── 4. RLS: enable, deny-by-default (no policies) ────────────────────────────
-- Intentional: service-role (createAdminClient) bypasses RLS; no tenant role
-- may ever read/write billing. See header. Do NOT add authenticated policies.
ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_customers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices  FORCE ROW LEVEL SECURITY;

-- Belt-and-suspenders: explicitly strip table-level grants from the tenant
-- roles so the deny-by-default intent is self-documenting (RLS-with-no-policy
-- already denies them; this makes it obvious to readers + linters that the
-- absence of a policy is deliberate, not forgotten). service_role has
-- BYPASSRLS and is unaffected — createAdminClient() writes still work.
REVOKE ALL ON public.billing_customers FROM anon, authenticated;
REVOKE ALL ON public.billing_invoices  FROM anon, authenticated;
