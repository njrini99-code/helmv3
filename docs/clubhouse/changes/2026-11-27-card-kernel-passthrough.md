## 2026-11-27

- **Card kernel, page attributes** (`ui/Card.tsx`, dsx-11): a card now carries the page attributes the live Rounds and Messages cards already had, so moving them onto the kernel drops nothing: `id` (a scroll target), `labelledBy` (the page's own heading names the card), `live` (`aria-live="polite"` on a card whose content swaps in place), `role="status"` (a card that is the answer to a search), `busy` (a page's own loading card that keeps its loaded shape, as opposed to `state="loading"`) and `code` (`data-ch-code`). No visible change.
