/**
 * CH-15607: a primary key's two labels held in one cell, so going in flight never reflows the key: the word leaves
 * upward as the working label and its spinner rise in (auth.css). The label not showing is hidden from assistive
 * technology, so the key reads "Sign in" or "Signing in…", never both.
 */
export function AuthKeyLabel({ busy, idle, working }: { busy: boolean; idle: string; working: string }) {
  return (
    <span className="ch-au-key" data-busy={busy ? '' : undefined}>
      <span className="ch-au-key__idle" aria-hidden={busy || undefined}>
        {idle}
      </span>
      <span className="ch-au-key__busy" aria-hidden={!busy || undefined}>
        <span className="ch-au-spin" aria-hidden="true" />
        {working}
      </span>
    </span>
  );
}
