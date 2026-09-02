/**
 * Seed/demo `organizations` rows behind Lift Lab's synthetic data.
 *
 * Same idiom as src/app/golf/actions/admin/demo-teams.ts's DEMO_TEAM_IDS —
 * matched by id, not by a `name ILIKE '%demo%'` filter, for the same
 * reason: a name-substring match risks a false positive against a real
 * program whose name happens to contain "demo", and "Rini University" (the
 * owner's own dev/test org) wouldn't match a "demo" substring at all.
 * Verified live in production 2026-08-21:
 *
 *   select id, name from organizations where name in ('Rini University', 'Demo University');
 *   -- returned exactly these two rows.
 *
 *   select o.name, count(*) from helm_lifting_sessions s
 *   left join organizations o on o.id = s.organization_id
 *   group by o.name order by count(*) desc;
 *   -- Rini University: 56, Demo University: 32 — no other org has EVER
 *   -- logged a helm_lifting_sessions row. 100% of Lift Lab's data, ever,
 *   -- is synthetic.
 *
 * Used to render an honest banner on /admin/lifting when every session in
 * the platform still belongs to one of these two orgs (fetchLiftingTab,
 * lib/admin/data/lifting.ts) — the page's own header already says "every
 * number below is platform-wide," which is true but currently means "100%
 * test data," and nothing on the page said so before this.
 */
export const DEMO_ORGANIZATION_IDS: ReadonlySet<string> = new Set([
  '6ce2c0bd-fb7d-4cae-a536-387f6aea8ff7', // Rini University
  'b3fac6a0-1410-5e7c-8082-15a7db570935', // Demo University
]);

export function isDemoOrganizationId(organizationId: string | null): boolean {
  return organizationId != null && DEMO_ORGANIZATION_IDS.has(organizationId);
}
