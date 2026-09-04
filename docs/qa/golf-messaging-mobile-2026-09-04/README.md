<!-- markdownlint-disable MD013 -->

# Golf messaging mobile evidence — 2026-09-04

This evidence is generated from the shipping `MessageConversationRail`, `MessageThreadPane`, `MessageComposer`, and `FairwayNewMessageSheet` components in a local browser page. The harness imports the repository's Fairway Tailwind/token CSS; it is not a hand-built HTML mockup.

Run from the repository root:

```bash
npx tsx scripts/qa/golf-messaging-mobile/capture.ts
```

The command renders deterministic fixtures at 320, 390, and 430 CSS pixels, writes the fifteen PNGs and `manifest.json` here, and fails if a browser page reports `document.documentElement.scrollWidth > document.documentElement.clientWidth`.

Fixtures cover:

- `inbox-unread-group`: selected unread group row and actual `AvatarGroup` stack.
- `thread-short-group`: grouped incoming bubbles, group sender identity, reply metadata, composer.
- `thread-group-details`: the actual flat conversation-details sheet opened from that group thread.
- `thread-failed-send`: retained failed bubble, retry metadata, quote, and composer reply state.
- `new-private-group`: the actual mobile group sheet after two fixture roster recipients and a group name are selected.

Fixture people use the product Avatar fallback initials (no external images or external data). Narrow adapters only replace live Supabase/network hooks and dormant structured-message/attachment branches; all visible messaging surfaces above are the product components.

The failed-send fixture was visually rechecked after its bubble-column repair:
at 320px, 390px, and 430px its reply, body, and retry metadata remain inside
the viewport. The overflow assertion alone was not accepted as proof, because
the original clipped text without widening the document; the regenerated PNGs
are the final visual evidence.

This is Chromium browser evidence, not physical-device QA. It does not prove iPhone Safari/WebView keyboard, safe-area, touch, or native-sheet behavior.
