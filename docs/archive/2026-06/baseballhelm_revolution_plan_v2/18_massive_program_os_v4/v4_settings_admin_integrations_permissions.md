# V4 Settings, Admin, Integrations, Imports, And Permissions

Settings are not an afterthought. In a platform serving college, high school, showcase, JUCO, staff roles, players, guardians, scouts, and external data sources, settings become the operating controls that keep the product usable and safe.

## Settings Architecture

Recommended route structure:

- `/baseball/dashboard/settings`
- `/baseball/dashboard/settings/program`
- `/baseball/dashboard/settings/teams`
- `/baseball/dashboard/settings/season`
- `/baseball/dashboard/settings/roles`
- `/baseball/dashboard/settings/permissions`
- `/baseball/dashboard/settings/player-access`
- `/baseball/dashboard/settings/guardian-access`
- `/baseball/dashboard/settings/showcase-profile`
- `/baseball/dashboard/settings/imports`
- `/baseball/dashboard/settings/integrations`
- `/baseball/dashboard/settings/ai`
- `/baseball/dashboard/settings/notifications`
- `/baseball/dashboard/settings/appearance`
- `/baseball/dashboard/settings/data-retention`
- `/baseball/dashboard/settings/demo-mode`

## Program Settings

Fields:

- program name
- program type: college, high_school, showcase, juco, academy, club
- competition level
- region/state
- season naming
- timezone
- brand colors
- logo
- default team
- public profile mode
- player account policy
- default visibility policy

Program type controls:

- route visibility
- default landing pages
- terminology
- feature flags
- permissions defaults
- onboarding flow

## Team And Season Settings

Team settings:

- team name
- team type
- season
- roster status
- join code
- invite policy
- player self-join allowed
- coach approval required

Season settings:

- fall
- winter
- preseason
- in-season
- postseason
- summer/showcase
- archive status

Season-specific:

- roster
- schedule
- stats
- practice templates
- lift groups
- performance baselines
- player status

## Role And Capability Settings

Use capabilities, not only role names.

Role templates:

- head coach
- assistant coach
- pitching coach
- hitting coach
- strength coach
- director of ops
- academic viewer
- player
- guardian
- manager
- showcase event director
- scout viewer
- admin

Capability groups:

- roster
- schedule
- practice
- stats
- performance
- wellness
- academics
- travel
- documents
- messages
- imports
- AI
- recruiting/exposure
- settings
- audit logs

Every sensitive capability:

- server-side enforced
- visible in role settings
- logged when changed

## Player Access Settings

Settings:

- players can create accounts
- players require invite
- players can edit profile
- players can edit public profile
- players can view own stats
- players can view team stats
- players can view practice plan
- players can self-log lift
- players can self-report availability
- players can upload video/documents
- players can see AI summaries
- players can see development goals

Default by program:

College:

- strict staff-controlled profile
- player Today enabled
- lift/check-in enabled
- team stats optional

High school:

- player profile editing more likely
- guardian policies available
- exposure features enabled if coach allows

Showcase:

- player profile completion enabled
- video/measurable upload enabled
- public profile visibility controls prominent

## Guardian Access Settings

High school only by default.

Guardian can see:

- schedule
- announcements
- travel details
- required acknowledgements if enabled
- player profile visibility status if enabled

Guardian cannot see:

- staff notes
- staff AI
- other player data
- internal recruiting boards
- wellness detail unless explicitly allowed and legally appropriate

## Showcase/Scout Access Settings

For showcase mode:

- scout viewer roles
- event packet visibility
- player profile public/private controls
- verified/unverified metric display
- contact rules
- download/export permissions
- event-specific access expiration

## Import Source Settings

Import source registry:

- source name
- source type
- trust level
- allowed import templates
- default visibility
- required review
- duplicate detection strictness
- player matching strategy
- external ID namespace

Source examples:

- GameChanger XML
- Presto/SIDEARM/NCAA stat file
- TrackMan CSV
- Rapsodo CSV
- Yakkertech CSV
- BaseballCloud export
- 6-4-3 Charts report
- TeamBuildr export
- BridgeAthletic export
- TrainHeroic export
- Google Sheets
- Excel
- coach chart
- manual entry

Trust levels:

- official
- device_export
- staff_entered
- player_entered
- AI_derived
- unreviewed

## Integrations Philosophy

Do not overpromise direct integrations.

V4 integration levels:

Level 1: Import template

- CSV/XLSX/XML upload
- mapping
- validation
- commit/rollback

Level 2: Attachment/link

- report PDF
- video link
- external dashboard link

Level 3: Assisted import

- AI mapping suggestions
- recurring source presets
- external IDs

Level 4: Direct API

- only after pilot evidence
- explicit vendor permission
- failure monitoring
- sync logs

In the current massive plan, most external systems should be Level 1-3.

## AI Settings

Settings:

- AI enabled
- staff AI enabled
- player-visible AI enabled
- require staff approval before player-visible AI
- AI source refs required
- AI confidence threshold
- stale output expiration
- allowed source types
- restricted note exclusion
- medical claim guardrail
- academic privacy guardrail

AI audit:

- generated_at
- model/provider
- prompt version
- source refs
- confidence
- visibility
- disposition
- reviewed_by

## Notification Settings

Notification types:

- event changed
- acknowledgement required
- practice published
- lift assigned
- check-in required
- import needs review
- signal assigned
- task due
- travel changed
- player profile update
- staff meeting item added

Channels:

- in-app
- email later
- SMS/push later

Controls:

- program defaults
- role defaults
- user preferences
- quiet hours

## Appearance And Brand Settings

Professional UI should allow program branding without destroying product quality.

Settings:

- logo
- primary accent
- neutral theme
- dark/light if supported
- public profile theme

Guardrails:

- no oversaturated color chaos
- keep readability
- keep status colors consistent
- brand color used sparingly

## Data Retention And Audit Settings

Settings:

- season archive policy
- import retention
- audit log retention
- deleted player policy
- inactive player historical data policy
- exported data policy

Audit events:

- role changed
- sensitive note created
- import committed
- import rolled back
- AI output generated
- player visibility changed
- public profile setting changed
- guardian access enabled
- data exported

## Admin Dashboards

Program admin dashboard:

- active users
- pending invites
- import health
- role issues
- feature flags
- data quality warnings
- public profile status

Platform admin later:

- programs
- organizations
- billing
- support
- logs
- abuse/security

## Permission Acceptance

Settings and permissions pass when:

- every visible feature has server-side capability enforcement
- role changes affect nav and API access
- player/guardian/scout views are safe
- imports and AI respect source visibility
- sensitive setting changes are logged
- settings are understandable without a support engineer

They fail when:

- hiding a tab is the only security
- program types are hard-coded forks
- external integrations are promised but not auditable
- player-visible AI can leak staff-only notes
