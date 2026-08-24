-- Production received the terminal-state writer during the incident repair.
-- Pin its lookup path explicitly as a follow-up so existing production and
-- freshly provisioned databases have identical privileged-function hardening.

begin;

alter function public.record_round_coachhelm_terminal_state(
    uuid, timestamptz, timestamptz, text
)
set search_path = 'pg_catalog, public';

commit;
