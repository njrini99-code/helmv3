# Helm Sports Labs - User Flows

> Complete user journey documentation for all user types.

---

## Authentication Flows

### Sign Up Flow

```
1. User lands on /auth/signup
2. Selects role: "I'm a Player" or "I'm a Coach"
3. Enters email, password
4. Clicks "Create Account"
5. Email verification sent
6. User clicks verification link
7. Redirected to onboarding flow
```

**Error States:**
- Email already exists → "This email is already registered. Log in?"
- Weak password → "Password must be at least 8 characters"
- Invalid email → "Please enter a valid email"

---

### Login Flow

```
1. User lands on /auth/login
2. Enters email, password
3. Clicks "Log In"
4. Redirected to dashboard based on role:
   - Player → /player
   - College Coach → /coach/college
   - HS Coach → /coach/high-school
   - JUCO Coach → /coach/juco
   - Showcase Coach → /coach/showcase
```

---

### Forgot Password Flow

```
1. User clicks "Forgot password?" on login
2. Enters email
3. Clicks "Send Reset Link"
4. Email sent with reset link
5. User clicks link → /auth/reset-password?token=xxx
6. Enters new password (2x)
7. Clicks "Reset Password"
8. Redirected to login with success message
```

---

## Onboarding Flows

### Coach Onboarding

```
STEP 1: Welcome
- "Welcome to Helm Sports Labs!"
- "Let's set up your program in 2 minutes."
- [Get Started →]

STEP 2: Program Info
- School/Organization name *
- Division (if college/juco)
- Conference
- City, State *

STEP 3: Your Profile
- Full name *
- Title/Role *
- Email
- Phone
- Photo (optional)

STEP 4: Branding (optional)
- Upload logo
- Set primary color (defaults to Kelly Green)

STEP 5: Complete
- "Your program is ready!"
- CTA based on coach type:
  - College/JUCO: "Find your first recruit" → Discover
  - HS/Showcase: "Invite your first player" → Team invites
```

---

### Player Onboarding

```
STEP 1: Welcome
- "Let's build your profile"
- Explain what Helm does

STEP 2: Basic Info
- First name, Last name *
- Grad year *
- City, State

STEP 3: Baseball Info
- Primary position *
- Secondary position
- Bats (R/L/S)
- Throws (R/L)

STEP 4: Physical
- Height (feet/inches)
- Weight

STEP 5: Metrics (at least one)
- Pitch velocity
- Exit velocity
- 60-yard time

STEP 6: Photo
- Upload profile photo
- Or skip for now

STEP 7: Complete
- Profile completion percentage shown
- "Continue improving your profile" CTA
```

---

### Team Join Flow (via Invite)

```
1. Player clicks invite link: /join/ABC12345
2. System checks if logged in:

   IF LOGGED IN:
   - Show team info with "Join Team" button
   - On click: Add to roster, redirect to Team Hub
   
   IF NOT LOGGED IN:
   - Show signup form
   - After signup: Auto-add to roster
   - Redirect to Team Hub

3. Toast: "Welcome to the team!"
```

**Error States:**
- Expired invite → "This invite has expired. Contact your coach."
- Already on team → "You're already on this team."
- Invalid code → "Invalid invite link."

---

### Recruiting Activation Flow (Player)

```
1. Player clicks "Activate Recruiting" CTA

2. Check profile completion:
   IF < 60%: Show what's missing, guide to complete
   IF >= 60%: Continue

3. Recruiting Preferences:
   - Preferred divisions (D1, D2, D3, NAIA, JUCO)
   - Preferred regions/states
   - School size preference
   - Distance from home

4. Top Schools (optional):
   - Add up to 5 dream schools
   - "These coaches will be notified"

5. Confirmation:
   - Checkbox: "I'm 13+ or have parent permission"
   - [Activate Recruiting]

6. Success:
   - Mode toggle appears
   - Recruiting features unlocked
   - "You're now discoverable!"
```

---

## Core Feature Flows

### Discover Players Flow (College/JUCO Coach)

```
1. Coach navigates to /coach/college/discover

2. Page loads with:
   - Search bar
   - Filter panel
   - US Map showing player density
   - Results grid (24 players)

3. Filtering options:
   - Click state on map → Filters to that state
   - Use filter chips (grad year, position)
   - Expand filter panel for advanced filters
   - URL updates with each filter change

4. Viewing results:
   - Infinite scroll loads more
   - Sort dropdown (Best Match, Newest, Velo)
   
5. Player card interactions:
   - Click card → Navigate to player profile
   - Click heart → Add to watchlist (optimistic)
   - Click dropdown → Add to stage, Compare

6. No results:
   - "No players match your filters"
   - [Clear Filters] button
```

---

### View Player Profile Flow (Coach)

```
1. Coach clicks on player card
2. Navigate to /coach/college/player/[id]
3. Store scroll position for back navigation

4. Profile page shows:
   - Hero with player info, photo
   - Pipeline status dropdown
   - Action buttons (Message, Notes, Compare)
   - Tabs (Overview, Stats, Video, Timeline, Notes)

5. Tab interactions:
   - Overview: Key metrics, about, achievements
   - Stats: Season stats, career stats, charts
   - Video: Grid of videos/clips
   - Timeline: Activity history
   - Notes: Private notes (CRUD)

6. Actions:
   - Change pipeline stage
   - Message Player
   - Add to Compare (max 4)
   - Export PDF

7. Back navigation:
   - Restores scroll position
   - Filters preserved in URL
```

---

### Add to Watchlist Flow

```
1. Coach clicks heart icon on player card
2. Immediate UI feedback:
   - Heart fills with green
   - Toast: "Added to watchlist"
3. Background API call
4. If error:
   - Revert heart to empty
   - Toast: "Failed to add. Try again."
```

---

### Pipeline Management Flow

```
1. Coach navigates to /coach/college/pipeline
2. Kanban board loads with 4 columns:
   - Watchlist, Priority, Offers, Committed

3. Drag and drop:
   - Grab player card
   - Drag to new column
   - Drop
   - Optimistic update
   - API call in background

4. If error:
   - Card animates back
   - Toast: "Failed to update"
```

---

### Send Message Flow

```
1. Click "Message Player"
2. Check if conversation exists:
   
   IF EXISTS: Open existing conversation
   IF NEW: Open composer modal

3. Compose message:
   - Type in text area
   - Optional: Add attachment
   - Click Send

4. Optimistic update:
   - Message appears with "Sending..." status
   - Scroll to bottom

5. On success: Status changes to "Sent"
6. On error: "Failed" with retry button
```

---

### Create Camp Flow (College Coach)

```
1. Navigate to /coach/college/camps
2. Click "+ Create New Camp"

3. Fill form:
   - Camp name *
   - Description
   - Date/time with timezone
   - Location (with autocomplete)
   - Capacity *
   - Registration fee
   - Eligibility (grad years, positions)
   - Registration deadline
   - Additional info

4. Submit options:
   - "Save as Draft"
   - "Create Camp" (publishes)

5. On success:
   - Navigate to camp detail
   - Share link available
```

---

### Video Upload Flow (Player)

```
1. Click "Upload Video"
2. Upload modal opens:
   - Drag and drop zone
   - Or click to browse
   - Max 500MB, MP4/MOV/AVI

3. File selected → Upload starts:
   - Progress bar shows percentage
   - Can cancel

4. Upload complete → Processing:
   - Spinner/progress indicator
   - "This may take a few minutes"
   - Can close and be notified

5. Processing complete → Metadata form:
   - Title *
   - Description
   - Video type
   - Date recorded
   - Visibility
   - [Save Video]

6. Success:
   - Video appears in library
   - Option to create clips
```

---

### Create Clip Flow

```
1. Open video in player
2. Click "Create Clip" or scissors icon
3. Clip tool opens:
   - Video player preview
   - Timeline with markers
   - Start/end point controls
   - Fine adjustment (±1s, ±0.1s)

4. Set start point
5. Set end point (min 3s, max 60s)
6. Enter title
7. Select tags (predefined + custom)
8. Set visibility
9. Click "Create Clip"
10. Clip saved → Appears in library
```

---

### Messaging Flow

```
1. User clicks message icon or "Message" button
2. Check for existing conversation:

   IF EXISTS:
   - Open existing thread
   - Load message history
   - Real-time subscription active
   
   IF NEW:
   - Create new conversation
   - Show empty thread

3. Type message in composer
4. Click Send or press Enter
5. Optimistic update:
   - Message appears with "Sending..."
   - Scroll to bottom

6. On success:
   - Status changes to sent
   - Read receipts update

7. On error:
   - Status changes to "Failed"
   - "Retry" button appears
```

---

### Camp Registration Flow (Player)

```
1. Player browses camps
2. Clicks on camp → Camp detail page
3. Reviews info:
   - Date, time, location
   - Description, fee
   - Spots remaining

4. Checks eligibility:
   - Grad year matches
   - Position matches

5. If eligible: Click "Register Now"
6. If paid camp:
   - Redirect to Stripe checkout
   - On success: Confirmed
   - On cancel: Return

7. Confirmation:
   - Email sent
   - Added to "My Camps"
   - Calendar event created
```

---

### Development Plan Flow (Coach Creates)

```
1. Navigate to /coach/high-school/dev-plans
2. Click "+ New Plan"
3. Select player from roster
4. Fill details:
   - Title, Description
   - Start/end dates
   - Goals (checklist)

5. Add phases:
   - Phase name
   - Date range
   - Items (tasks, drills, videos, metrics)

6. Review plan
7. "Send to Player" or "Save Draft"
8. If sent:
   - Player notified
   - Status: Active
```

---

### Development Plan Flow (Player Completes)

```
1. Player notified: "New development plan"
2. Navigate to /player/team/dev-plan
3. View plan:
   - Goals
   - Current phase
   - Items to complete

4. Mark item done:
   - Click checkbox
   - Optional: Add note
   - Coach notified

5. Add comments:
   - "Completed 3 sets today"
   - Coach sees comments

6. Progress updates:
   - Progress bar fills
   - Completed items checked
```

---

## Error Handling Flows

### Network Error

```
1. User performs action
2. Request fails (network error)
3. UI shows:
   - "Connection Error"
   - "Check your connection and try again"
   - [Retry] button
```

---

### Session Expired

```
1. Session expires
2. Next API call returns 401
3. Redirect to /auth/login
4. Message: "Your session expired. Please log in again."
5. After login: Redirect to previous page
```

---

### Not Found

```
1. User navigates to invalid route
2. Show 404 page:
   - "Page Not Found"
   - [Go to Dashboard] button
```

---

### Permission Denied

```
1. User tries unauthorized resource
2. Show 403 page:
   - "Access Denied"
   - [Go to Dashboard] button
```

---

## Edge Case Flows

### Player Commits to Another School

```
1. Player updates commitment status
2. System actions:
   - Coaches with player in pipeline notified
   - Player marked "Committed" in Discover
   - Watchlist shows commitment badge
   
3. Coach sees notification:
   - "Jake Smith committed to Texas"
   - [View Player] [Remove from Pipeline]
```

---

### Invite Link Expired

```
1. Player clicks expired link
2. Show: "This invite has expired"
3. "Contact your coach for a new invite link"
```

---

### Video Processing Failed

```
1. Video upload completes
2. Processing fails
3. User notified:
   - "Video Processing Failed"
   - "Try again with a different file"
```

---

### Rate Limited

```
1. User makes too many requests
2. API returns 429
3. Toast: "You're doing that too fast"
4. Disable action temporarily
5. Re-enable after cooldown
```

---

## Notification Flows

### Profile View Notification

```
TRIGGER: Coach views player's profile
IF: Player has recruiting activated
THEN:
  - Create notification
  - If activated: "Coach Davis from Texas A&M viewed your profile"
  - If not: "A program from Texas viewed your profile"
  - Increment view count
```

---

### Watchlist Add Notification

```
TRIGGER: Coach adds player to watchlist
IF: Player has recruiting activated
THEN:
  - Create notification
  - "You were added to a watchlist by Texas A&M"
```

---

### Message Notification

```
TRIGGER: New message received
THEN:
  - Create notification
  - Badge on messages icon
  - Email if not read within 1 hour
```

---

### Team Announcement Notification

```
TRIGGER: Coach posts announcement
THEN:
  - Notify all team players
  - Show in team dashboard
  - Badge on announcements
```

---

## Real-Time Flows

### Live Activity Feed

```
1. User on dashboard
2. Subscribe to activity channel
3. New activity occurs
4. Server broadcasts event
5. Client receives:
   - Update badge: "3 new"
6. User clicks → Items load
```

---

### Live Messaging

```
1. Open conversation
2. Subscribe to channel
3. Other user sends message
4. Client receives message
5. Add to thread
6. Scroll to bottom
7. Mark as read
```

---

### Live Notifications

```
1. User logged in
2. Subscribe to notifications channel
3. New notification created
4. Client receives:
   - Increment bell badge
   - Show toast (if high priority)
```
