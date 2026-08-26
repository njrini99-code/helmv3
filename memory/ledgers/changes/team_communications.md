
## 2026-08-26 — attachment send no longer blocks on notification fan-out

- SHA: pending commit on fix/message-attachment-fanout-after.
- Change: `sendGolfMessageWithAttachments` moves its email/push/in-app
  fan-out into `after()`; the sender's response returns as soon as the
  message, attachment rows, and conversation bump are durable.
- Why: on a 13-participant team chat the inline fan-out (one email + one
  push edge-function call per recipient) pushed the action past what
  mobile Safari would wait for. The response was lost and the composer
  reported failure for sends that had fully landed — observed live
  2026-08-26 (Guilford coach, same photo posted three times, told it
  failed each time; zero server-side errors in Sentry). Same
  response-loss class the round submit already fixed, same after() idiom.
