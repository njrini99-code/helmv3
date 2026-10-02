# Clubhouse UI ownership

This is an index of existing owners for plugin-assisted review. The page
CONTRACT, DESIGN and WIRING files remain the detailed sources. Native popup
behavior is preserved where the current shared control delegates to the OS;
this pass does not introduce a new select or date-picker system.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Select/Listbox | `ui/Select.tsx`, `ui/Menu.tsx` | Page DESIGN and CONTRACT | Native short choice lists; authored action menus | Shared control tests; browser keyboard and open-popup checks |
| Date | Calendar model and timezone helpers; existing sheet date fields | Calendar CONTRACT; `lib/calendar/timezone.ts` | Native entry; team-local timed instants; literal all-day dates | Calendar and Home date tests |
| Form | `styles/controls.css`; feature form components and their server actions | Each page CONTRACT and WIRING | Auth; editor sheets; inline composer | Auth and editor validation/recovery tests |
| Scrollbar | `styles/base.css` and scoped tokens | Shell DESIGN; runtime styles | Page/panel scrollers; hidden tab/hole strips and onboarding column | Browser computed styles, native scroll and forced colors |
| Toast | `ui/Toast.tsx`; `lib/use-action.ts` | Shell and page CONTRACT | Success; warning; error with Retry | Toast/action tests and failure-path browser checks |
| CRUD | Existing page containers and sport-specific server actions | Page CONTRACT and WIRING | Per-object optimistic replies/checks; confirmed editor writes | Hub, Messages and editor action tests |

The shared Button renders a link when supplied `href`; the Home `Form` component
is a scoring figure, not an HTML form. A literal-only auditor must distinguish
these React components before calling them actionless or unvalidated.

Notes fields use the shared `.ch-textarea` styling; message composers provide
their own bounded growth. The existing vertically resizable notes variant is
retained for long desktop content. A textarea's inherited CSS must be inspected
before treating absence of an inline resize declaration as missing behavior.

This review covers Clubhouse. Fairway, Baseball and Lift Lab retain their
existing owners. Locale is the existing English UI with explicit team timezones;
no Japanese locale or Japan-market behavior is introduced.

## Static auditor adjudication

The installed plugin strict scan of premium-ui.json exits 1: 25 detections,
zero unresolved ownership choices. This result is not a compliance pass.
All detections were inspected against their runtime owners:

- Eleven actionless-button detections are uppercase React Button calls with
  href, which the shared owner renders as Next links with real destinations.
- The missing-form-validation detection is Home's uppercase Form scoring
  component, which renders a section; it never submits credentials or data.
- Eight textarea detections span six shared .ch-textarea notes fields and two
  message composers. The six retain the established vertical-resize variant;
  the two use the bounded composer CSS with resize: none. The literal scan does
  not resolve either shared CSS owner.
- Five scrollbar detections are existing hidden-scroller variants: four
  horizontal strips and the onboarding column. Each already supplies
  scrollbar-width: none and hides the WebKit scrollbar. The
  new scoped base supplies standard color/width, WebKit track/thumb styling
  and forced-color defaults. The scan checks files in isolation.

The plugin-managed auditor and the project baselines were not modified. WebKit
observed themed native scrolling, automatic forced-color defaults and an
unchanged outer body. These scoped observations do not prove every application
control or physical Safari interaction.
