import { MessagesFairway } from '@/components/baseball/messages/MessagesFairway';

// No page-level <Header> — the Fairway shell (BaseballFairwayShell → AppShell)
// already owns the one top bar + breadcrumb for every dashboard route,
// "Messages" included. Mirrors the sibling announcements/tasks/documents/
// travel `loading.tsx` files, none of which mount a Header either.
//
// FIX (mobile audit, messages-hub group): this route-level fallback used to
// render the old generic messages skeleton (since removed) — a hardcoded,
// non-responsive `w-80` + `flex-1` two-column desktop shape with its own
// `bg-white`/`rounded-2xl` chrome that shares nothing with the real Fairway
// surface.
// On a 320-430px phone the fixed 320px list column alone overflowed this
// route's own `p-6` wrapper, guaranteeing horizontal pan, and the mismatched
// chrome produced a visible shape/color flash the instant `MessagesClient`
// hydrated. `MessagesFairway`'s own `loading` branch is ALREADY the exact
// fallback `MessagesClient`'s internal `<Suspense>` uses (see its default
// export), so rendering it here too means there is exactly one skeleton
// shape for this route — list column full-width on phone, `lg:w-80` at
// desktop, chat pane `hidden` below `lg` — instead of two that can drift.
export default function MessagesLoading() {
  return (
    <MessagesFairway
      loading
      mobileShowChat={false}
      listSlot={null}
      chatSlot={null}
      modalSlot={null}
    />
  );
}
