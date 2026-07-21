export default async function CRMLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // /golf/admin/layout.tsx already performs the resilient session check and
  // admin-role gate for this entire subtree. Repeating both checks here added
  // another auth-server round trip to every CRM navigation and doubled the
  // chance that a transient GoTrue timeout looked like a signed-out session.
  return <>{children}</>;
}
