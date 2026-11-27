## 2026-11-27

- **Card kernel, list cards** (`styles/card.css`): a `kind="list"` card's rows run to its bottom edge. The card's bottom gutter now applies to every kind except `list`, so a grouped list (Settings first) can sit on the kernel with its rows as direct children and look exactly as it did. No live screen changes from this alone: before this, only the card lab used the kernel.
