/** A shortcut as key caps, one per key. Decorative: the row's own text names the action, and the control carries aria-keyshortcuts. */
export function Keys({ keys, className = 'ch-cmd-keys' }: { keys: readonly string[]; className?: string }) {
  return (
    <span className={className} aria-hidden="true">
      {keys.map((k, i) => (
        <kbd key={`${k}${i}`} className="ch-cmd-kbd">
          {k}
        </kbd>
      ))}
    </span>
  );
}
