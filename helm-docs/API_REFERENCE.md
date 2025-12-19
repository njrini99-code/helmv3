# Helm Sports Labs - API Reference

> Complete API endpoint documentation for the Helm Sports Labs platform.

---

## Base URL

```
Production: https://api.helmsportslabs.com
Development: http://localhost:3000/api
```

## Authentication

All authenticated endpoints require a valid Supabase JWT token in the `Authorization` header:

```
Authorization: Bearer <token>
```

---

## Response Format

### Success Response

```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": { ... }  // Optional validation errors
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Not authenticated |
| `FORBIDDEN` | 403 | Not authorized for this action |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `RATE_LIMITED` | 429 | Too many requests |
| `CONFLICT` | 409 | Resource conflict (duplicate) |
| `SERVER_ERROR` | 500 | Internal server error |

---

## Authentication Endpoints

### POST /api/auth/signup

Create a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "role": "player",
  "firstName": "John",
  "lastName": "Smith"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "role": "player"
    }
  }
}
```

### POST /api/auth/login

Authenticate a user.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

### POST /api/auth/logout

Log out the current user.

### POST /api/auth/forgot-password

Request a password reset email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

### POST /api/auth/reset-password

Reset password with token.

**Request Body:**
```json
{
  "token": "reset_token",
  "password": "newPassword123"
}
```

### GET /api/auth/me

Get current authenticated user.

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "role": "player"
    },
    "profile": {
      // Player or Coach profile data
    }
  }
}
```

---

## Players

### GET /api/players

Search and filter players.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Search by name, school |
| `gradYear` | number | Filter by graduation year |
| `position` | string | Filter by position (P, C, 1B, etc.) |
| `state` | string | Filter by state (TX, CA, etc.) |
| `minVelo` | number | Minimum pitch velocity |
| `maxVelo` | number | Maximum pitch velocity |
| `minExitVelo` | number | Minimum exit velocity |
| `maxExitVelo` | number | Maximum exit velocity |
| `minGPA` | number | Minimum GPA |
| `hasVideo` | boolean | Has video content |
| `verified` | boolean | Has verified metrics |
| `uncommitted` | boolean | Not committed |
| `cursor` | string | Pagination cursor |
| `limit` | number | Results per page (default: 24, max: 50) |
| `sort` | string | Sort order (best_match, newest, velo_desc) |

**Response:**
```json
{
  "success": true,
  "data": {
    "players": [
      {
        "id": "uuid",
        "fullName": "Jake Smith",
        "firstName": "Jake",
        "lastName": "Smith",
        "avatarUrl": "https://...",
        "primaryPosition": "RHP",
        "secondaryPosition": "1B",
        "gradYear": 2026,
        "state": "TX",
        "highSchoolName": "Westview HS",
        "pitchVelo": 94,
        "exitVelo": 98,
        "sixtyTime": 6.8,
        "gpa": 3.8,
        "hasVideo": true,
        "verifiedMetrics": true,
        "commitmentStatus": null,
        "profileCompletionPercent": 85
      }
    ],
    "nextCursor": "cursor_string",
    "totalCount": 847
  }
}
```

### GET /api/players/:id

Get player by ID.

**Response:**
```json
{
  "success": true,
  "data": {
    "player": {
      "id": "uuid",
      "fullName": "Jake Smith",
      // ... all player fields
      "stats": [...],
      "achievements": [...],
      "videos": [...]
    }
  }
}
```

### PATCH /api/players/:id

Update player profile. (Player only - own profile)

**Request Body:**
```json
{
  "firstName": "Jake",
  "lastName": "Smith",
  "primaryPosition": "RHP",
  "pitchVelo": 95,
  "aboutMe": "Updated bio..."
}
```

### GET /api/players/:id/stats

Get player statistics.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `season` | number | Filter by season year |
| `type` | string | Stats type (pitching, hitting) |

### POST /api/players/:id/stats

Add stat entry. (Player only)

**Request Body:**
```json
{
  "seasonYear": 2024,
  "statType": "pitching",
  "wins": 8,
  "losses": 1,
  "era": 1.82,
  "inningsPitched": 62,
  "strikeouts": 89
}
```

### GET /api/players/:id/videos

Get player videos.

### GET /api/players/:id/achievements

Get player achievements.

### POST /api/players/:id/achievements

Add achievement. (Player only)

**Request Body:**
```json
{
  "achievementText": "2024 District 12-6A First Team",
  "achievementDate": "2024-05-15"
}
```

### GET /api/players/:id/timeline

Get recruiting timeline/activity.

### POST /api/players/:id/export

Export player profile to PDF.

---

## Coaches

### GET /api/coaches/:id

Get coach profile.

### PATCH /api/coaches/:id

Update coach profile. (Coach only - own profile)

### GET /api/coaches/:id/program

Get program information.

### PATCH /api/coaches/:id/program

Update program information.

---

## Watchlist & Pipeline

### GET /api/watchlist

Get coach's watchlist.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `stage` | string | Filter by pipeline stage |
| `gradYear` | number | Filter by grad year |
| `position` | string | Filter by position |

**Response:**
```json
{
  "success": true,
  "data": {
    "watchlist": [
      {
        "id": "uuid",
        "playerId": "uuid",
        "player": {
          "id": "uuid",
          "fullName": "Jake Smith",
          // ... player summary
        },
        "pipelineStage": "watchlist",
        "notes": "Great prospect...",
        "addedAt": "2025-01-15T10:00:00Z"
      }
    ]
  }
}
```

### POST /api/watchlist

Add player to watchlist.

**Request Body:**
```json
{
  "playerId": "uuid",
  "pipelineStage": "watchlist",
  "notes": "Saw at PG showcase..."
}
```

### DELETE /api/watchlist/:id

Remove from watchlist.

### GET /api/pipeline

Get full recruiting pipeline.

**Response:**
```json
{
  "success": true,
  "data": {
    "pipeline": {
      "watchlist": [...],
      "priority": [...],
      "offer_extended": [...],
      "committed": [...]
    },
    "counts": {
      "watchlist": 45,
      "priority": 12,
      "offer_extended": 5,
      "committed": 3
    }
  }
}
```

### PATCH /api/pipeline/:id

Update pipeline stage.

**Request Body:**
```json
{
  "pipelineStage": "priority"
}
```

### GET /api/pipeline/export

Export pipeline to CSV.

---

## Comparisons

### GET /api/comparisons

List saved comparisons.

### POST /api/comparisons

Create comparison.

**Request Body:**
```json
{
  "title": "2026 RHP Targets",
  "playerIds": ["uuid1", "uuid2", "uuid3"]
}
```

### GET /api/comparisons/:id

Get comparison with player data.

### PATCH /api/comparisons/:id

Update comparison (notes, clips, etc.)

**Request Body:**
```json
{
  "title": "Updated Title",
  "notes": [
    { "playerId": "uuid1", "note": "Best pure stuff" },
    { "playerId": "uuid2", "note": "Most polished" }
  ],
  "selectedClips": [
    { "playerId": "uuid1", "clipId": "clip_uuid" }
  ]
}
```

### DELETE /api/comparisons/:id

Delete comparison.

### POST /api/comparisons/:id/export

Export comparison to PDF.

---

## Notes

### GET /api/notes

Get notes for a player.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `playerId` | string | Required - Player ID |

### POST /api/notes

Create note.

**Request Body:**
```json
{
  "playerId": "uuid",
  "content": "Note content..."
}
```

### PATCH /api/notes/:id

Update note.

### DELETE /api/notes/:id

Delete note.

---

## Videos

### POST /api/videos/upload-url

Get presigned upload URL.

**Request Body:**
```json
{
  "fileName": "highlight.mp4",
  "fileSize": 52428800,
  "contentType": "video/mp4"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://...",
    "videoId": "uuid",
    "expiresAt": "2025-01-15T11:00:00Z"
  }
}
```

### POST /api/videos

Create video record after upload.

**Request Body:**
```json
{
  "videoId": "uuid",
  "title": "Bullpen Session",
  "description": "February bullpen...",
  "videoType": "practice",
  "visibility": "public",
  "recordedAt": "2025-02-15"
}
```

### GET /api/videos/:id

Get video details.

### DELETE /api/videos/:id

Delete video.

### POST /api/videos/:id/clips

Create clip from video.

**Request Body:**
```json
{
  "title": "FB 94mph Strikeout",
  "startTime": 32.5,
  "endTime": 47.2,
  "tags": ["pitching", "fastball", "strikeout"],
  "visibility": "public"
}
```

### PATCH /api/videos/clips/:id

Update clip.

### DELETE /api/videos/clips/:id

Delete clip.

### POST /api/videos/:id/notes

Add note to video.

**Request Body:**
```json
{
  "timestamp": 35.0,
  "content": "Great arm action here",
  "isPrivate": true
}
```

---

## Camps

### GET /api/camps

List camps.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `coachId` | string | Filter by coach |
| `status` | string | Filter by status (open, closed, etc.) |
| `state` | string | Filter by state |
| `after` | string | Camps after date |
| `before` | string | Camps before date |

### POST /api/camps

Create camp. (College coach only)

**Request Body:**
```json
{
  "name": "Elite Pitchers Camp",
  "description": "Intensive pitching development...",
  "startDate": "2025-06-15",
  "endDate": null,
  "startTime": "09:00",
  "endTime": "16:00",
  "timezone": "America/Chicago",
  "locationName": "Texas A&M Baseball Complex",
  "locationAddress": "123 Baseball Way",
  "locationCity": "College Station",
  "locationState": "TX",
  "capacity": 50,
  "registrationFee": 150.00,
  "registrationDeadline": "2025-06-10",
  "eligibleGradYears": [2025, 2026, 2027],
  "eligiblePositions": ["P"],
  "additionalInfo": "Bring glove, cleats..."
}
```

### GET /api/camps/:id

Get camp details.

### PATCH /api/camps/:id

Update camp.

### DELETE /api/camps/:id

Delete camp.

### GET /api/camps/:id/attendees

Get camp attendees.

**Response:**
```json
{
  "success": true,
  "data": {
    "attendees": [
      {
        "id": "uuid",
        "player": {
          "id": "uuid",
          "fullName": "Jake Smith",
          // ...
        },
        "status": "registered",
        "paymentStatus": "paid",
        "registeredAt": "2025-01-15T10:00:00Z"
      }
    ],
    "count": 42,
    "capacity": 50
  }
}
```

### POST /api/camps/:id/register

Register for camp. (Player only)

**Request Body:**
```json
{
  "paymentMethodId": "pm_xxx"  // If paid camp
}
```

### DELETE /api/camps/:id/register

Cancel registration.

### GET /api/camps/:id/export

Export attendee list to CSV.

---

## Messages

### GET /api/conversations

List conversations.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Filter by type (direct, group) |
| `archived` | boolean | Include archived |

**Response:**
```json
{
  "success": true,
  "data": {
    "conversations": [
      {
        "id": "uuid",
        "type": "direct",
        "participants": [
          {
            "id": "uuid",
            "name": "Jake Smith",
            "avatarUrl": "...",
            "userType": "player"
          }
        ],
        "lastMessage": {
          "content": "Thanks for reaching out!",
          "sentAt": "2025-01-15T14:30:00Z",
          "senderId": "uuid"
        },
        "unreadCount": 2,
        "updatedAt": "2025-01-15T14:30:00Z"
      }
    ]
  }
}
```

### POST /api/conversations

Create conversation.

**Request Body:**
```json
{
  "type": "direct",
  "participantIds": ["uuid"],
  "initialMessage": "Hi Jake, I wanted to reach out..."
}
```

### GET /api/conversations/:id

Get conversation with messages.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `cursor` | string | Pagination cursor |
| `limit` | number | Messages per page |

### POST /api/conversations/:id/messages

Send message.

**Request Body:**
```json
{
  "content": "Message content...",
  "attachments": [
    {
      "type": "file",
      "url": "https://...",
      "name": "document.pdf",
      "size": 1024000
    }
  ]
}
```

### PATCH /api/conversations/:id/read

Mark conversation as read.

### POST /api/conversations/:id/archive

Archive conversation.

---

## Teams

### GET /api/teams/:type/:id

Get team information.

**Path Parameters:**
- `type`: high_school, juco, college, showcase
- `id`: Team ID

### GET /api/teams/:type/:id/roster

Get team roster.

### POST /api/teams/:type/:id/roster

Add player to roster. (Coach only)

**Request Body:**
```json
{
  "playerId": "uuid",
  "jerseyNumber": "24",
  "teamRole": "player"
}
```

### DELETE /api/teams/:type/:id/roster/:playerId

Remove from roster.

### POST /api/teams/:type/:id/invites

Create team invite.

**Request Body:**
```json
{
  "email": "player@email.com",  // Optional
  "expiresInDays": 7
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "invite": {
      "id": "uuid",
      "code": "ABC12345",
      "inviteUrl": "https://helm.app/join/ABC12345",
      "expiresAt": "2025-01-22T10:00:00Z"
    }
  }
}
```

### GET /api/teams/invites/:code

Get invite details (public).

**Response:**
```json
{
  "success": true,
  "data": {
    "invite": {
      "teamName": "Westview HS Baseball",
      "teamType": "high_school",
      "coachName": "Mike Johnson",
      "location": "Austin, TX",
      "expiresAt": "2025-01-22T10:00:00Z"
    }
  }
}
```

### POST /api/teams/invites/:code/accept

Accept team invite.

---

## Dev Plans

### GET /api/dev-plans

List dev plans.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `playerId` | string | Filter by player |
| `status` | string | Filter by status |

### POST /api/dev-plans

Create dev plan. (Coach only)

**Request Body:**
```json
{
  "playerId": "uuid",
  "title": "Spring 2025 Velocity Program",
  "description": "Focus on increasing velocity...",
  "startDate": "2025-01-15",
  "dueDate": "2025-04-01",
  "goals": [
    "Increase FB velo from 88 to 91",
    "Improve slider depth"
  ],
  "phases": [
    {
      "title": "Foundation",
      "startDate": "2025-01-15",
      "endDate": "2025-02-15",
      "items": [
        {
          "type": "task",
          "title": "Long toss program - 3x/week"
        },
        {
          "type": "drill",
          "title": "Arm care routine - daily"
        }
      ]
    }
  ]
}
```

### GET /api/dev-plans/:id

Get dev plan with phases and items.

### PATCH /api/dev-plans/:id

Update dev plan.

### DELETE /api/dev-plans/:id

Delete dev plan.

### POST /api/dev-plans/:id/phases

Add phase.

### POST /api/dev-plans/:id/items

Add item.

### PATCH /api/dev-plans/items/:id

Update item (mark complete, etc.)

**Request Body:**
```json
{
  "completed": true
}
```

### POST /api/dev-plans/:id/comments

Add comment.

**Request Body:**
```json
{
  "content": "Great progress this week!"
}
```

---

## Calendar

### GET /api/calendar/events

Get calendar events.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `start` | string | Start date (ISO) |
| `end` | string | End date (ISO) |
| `teamId` | string | Filter by team |
| `type` | string | Event type filter |

### POST /api/calendar/events

Create event.

**Request Body:**
```json
{
  "title": "Practice",
  "description": "Regular practice",
  "eventType": "practice",
  "startTime": "2025-02-15T15:00:00-06:00",
  "endTime": "2025-02-15T17:30:00-06:00",
  "timezone": "America/Chicago",
  "allDay": false,
  "locationName": "Main Field",
  "visibility": "team",
  "teamType": "high_school",
  "highSchoolId": "uuid"
}
```

### PATCH /api/calendar/events/:id

Update event.

### DELETE /api/calendar/events/:id

Delete event.

### GET /api/calendar/export

Export calendar to ICS.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `eventId` | string | Single event export |
| `start` | string | Range start |
| `end` | string | Range end |

### GET /api/calendar/shared/:playerId

Get player's shared calendar. (Coach only)

### PATCH /api/calendar/sharing

Update sharing settings. (Player only)

**Request Body:**
```json
{
  "shareType": "watchlist",
  "shareGames": true,
  "shareShowcases": true,
  "sharePractices": false
}
```

---

## Notifications

### GET /api/notifications

List notifications.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `unreadOnly` | boolean | Only unread |
| `cursor` | string | Pagination |
| `limit` | number | Per page |

### PATCH /api/notifications/:id/read

Mark as read.

### POST /api/notifications/read-all

Mark all as read.

### DELETE /api/notifications/:id

Delete notification.

### GET /api/notifications/preferences

Get notification preferences.

### PATCH /api/notifications/preferences

Update preferences.

**Request Body:**
```json
{
  "notifyOnProfileView": true,
  "notifyOnWatchlistAdd": true,
  "notifyOnMessage": true,
  "emailDigestFrequency": "daily"
}
```

---

## Analytics

### GET /api/analytics/profile-views

Get profile view statistics. (Player only)

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `period` | string | Time period (7d, 30d, 90d) |

**Response:**
```json
{
  "success": true,
  "data": {
    "totalViews": 127,
    "changePercent": 23,
    "viewsByDay": [
      { "date": "2025-01-08", "count": 15 },
      { "date": "2025-01-09", "count": 18 }
    ],
    "topViewers": [
      {
        "collegeId": "uuid",
        "collegeName": "Texas A&M",
        "division": "D1",
        "viewCount": 8
      }
    ],
    "viewsByState": [
      { "state": "TX", "count": 45 },
      { "state": "CA", "count": 23 }
    ]
  }
}
```

### GET /api/analytics/video-views

Get video view statistics.

### GET /api/analytics/engagement

Get overall engagement metrics.

### GET /api/analytics/geographic

Get geographic breakdown of interest.

---

## Search

### GET /api/search/players

Search players (alias for GET /api/players with search).

### GET /api/search/colleges

Search colleges.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Search term |
| `division` | string | Filter by division |
| `state` | string | Filter by state |
| `conference` | string | Filter by conference |

### GET /api/search/saved

Get saved searches.

### POST /api/search/saved

Save search.

**Request Body:**
```json
{
  "name": "2026 TX Pitchers",
  "searchType": "players",
  "filters": {
    "gradYear": 2026,
    "position": "P",
    "state": "TX"
  }
}
```

### DELETE /api/search/saved/:id

Delete saved search.

---

## Activity

### GET /api/activity

Get activity feed.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `filter` | string | Filter type (all, views, follows, top5) |
| `cursor` | string | Pagination |
| `limit` | number | Per page |

**Response:**
```json
{
  "success": true,
  "data": {
    "activities": [
      {
        "id": "uuid",
        "type": "profile_view",
        "actor": {
          "id": "uuid",
          "name": "Jake Smith",
          "avatarUrl": "...",
          "position": "RHP",
          "gradYear": 2026,
          "state": "TX"
        },
        "action": "viewed your profile",
        "createdAt": "2025-01-15T14:30:00Z"
      }
    ],
    "nextCursor": "..."
  }
}
```

---

## Recruiting

### GET /api/recruiting/interests

Get player's college interests. (Player only)

### POST /api/recruiting/interests

Add college interest.

**Request Body:**
```json
{
  "collegeId": "uuid",
  "interestLevel": "high"
}
```

### PATCH /api/recruiting/interests/:id

Update interest level.

### DELETE /api/recruiting/interests/:id

Remove interest.

### GET /api/recruiting/top-schools

Get player's top 5 schools.

### PUT /api/recruiting/top-schools

Update top 5.

**Request Body:**
```json
{
  "schools": [
    { "collegeId": "uuid", "rank": 1 },
    { "collegeId": "uuid", "rank": 2 },
    { "collegeId": "uuid", "rank": 3 }
  ]
}
```

### POST /api/recruiting/activate

Activate recruiting features.

### POST /api/recruiting/deactivate

Deactivate recruiting features.

---

## Offers & Commitments

### GET /api/offers

List offers.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `direction` | string | sent or received |
| `status` | string | Filter by status |

### POST /api/offers

Send offer. (College coach only)

**Request Body:**
```json
{
  "playerId": "uuid",
  "offerType": "verbal",
  "scholarshipAmount": "full",
  "notes": "We'd love to have you..."
}
```

### PATCH /api/offers/:id

Update offer status.

### POST /api/commitments

Create commitment. (Player only)

**Request Body:**
```json
{
  "collegeId": "uuid",
  "status": "committed"
}
```

### PATCH /api/commitments/:id

Update commitment (e.g., signed, decommitted).

---

## Billing

### POST /api/billing/checkout

Create Stripe checkout session.

**Request Body:**
```json
{
  "plan": "pro",
  "successUrl": "https://...",
  "cancelUrl": "https://..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "checkoutUrl": "https://checkout.stripe.com/..."
  }
}
```

### POST /api/billing/portal

Create Stripe billing portal session.

### GET /api/billing/subscription

Get current subscription status.

---

## Webhooks

### POST /api/webhooks/stripe

Handle Stripe webhook events.

### POST /api/webhooks/mux

Handle Mux video processing events.

### POST /api/webhooks/resend

Handle email delivery events.

---

## Rate Limits

| Endpoint Category | Limit |
|-------------------|-------|
| Read operations | 100 requests/minute |
| Write operations | 20 requests/minute |
| Search | 30 requests/minute |
| File upload | 10 requests/minute |
| Authentication | 10 requests/minute |

Rate limit headers included in response:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705312800
```
