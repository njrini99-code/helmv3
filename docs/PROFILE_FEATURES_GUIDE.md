# PROFILE_FEATURES_GUIDE.md

## Profile Customization & Privacy System

This guide covers all the new profile customization, privacy toggles, and display features added to Helm Sports Labs.

---

## What's New

### 1. Public Profile Pages
Everyone can have a public profile that others can visit:
- **Players**: `/player/[id]` - Visible to coaches and anyone with link
- **Programs**: `/program/[id]` - Visible to players and other coaches  
- **Teams**: `/team/[id]` - Shows roster, staff, location

### 2. Privacy Toggles
Users control exactly what's visible on their public profile via toggle switches.

### 3. Green Glow Recruiting Indicator
Anyone with an active recruiting profile shows a **green dot/glow** to indicate they're actively recruiting.

### 4. Staff Management for Programs
Coaches can add staff with headshots, bios, and titles.

### 5. Dream Schools for Players
Players can list their top 10 dream schools.

### 6. Improved Calendar with Practice Plans
Coaches can create practice plans and send them to the team.

---

## Database Changes

Run `PROFILE_CUSTOMIZATION_SCHEMA.sql` to add:

### New Tables
- `player_dream_schools` - Player's ranked list of dream schools
- `organization_settings` - Privacy toggles for programs
- `organization_staff` - Staff members with headshots/bios
- `organization_facilities` - Facility photos and info
- `organization_media` - Cover photos, gallery images
- `player_stats` - Verified player statistics
- `practice_plans` - Practice plan templates and schedules
- `program_commitments` - Committed players list

### Modified Tables
- `player_settings` - Added 18 new privacy toggle columns
- `events` - Added `event_category`, `is_public`, `practice_plan_id`

---

## File Structure

```
app/
├── actions/
│   └── profile-settings.ts          # Server actions for all profile features
├── (dashboard)/
│   ├── player/
│   │   └── settings/
│   │       └── privacy/
│   │           └── page.tsx          # Player privacy settings page
│   └── coach/
│       └── college/
│           └── program/
│               └── page.tsx          # Program profile editor
├── (public)/
│   ├── player/
│   │   └── [id]/
│   │       └── page.tsx              # Public player profile
│   ├── program/
│   │   └── [id]/
│   │       └── page.tsx              # Public program profile
│   └── team/
│       └── [id]/
│           └── page.tsx              # Public team profile

components/
├── shared/
│   ├── Toggle.tsx                    # Reusable toggle component
│   ├── PlayerCard.tsx                # Modern centered player cards
│   └── Calendar.tsx                  # Improved calendar with practice plans
├── player/
│   └── settings/
│       └── PrivacySettingsForm.tsx   # Privacy settings form
└── coach/
    └── program/
        └── ProgramProfileEditor.tsx  # Program editor with tabs

types/
└── profile.ts                        # TypeScript types for all profile features
```

---

## Player Privacy Settings

Players can toggle visibility of:

### Basic Information
| Setting | Default | Description |
|---------|---------|-------------|
| `show_full_name` | ✓ ON | Show full name (otherwise just first name) |
| `show_location` | ✓ ON | City and state |
| `show_school` | ✓ ON | High school and club team |
| `show_contact_email` | OFF | Direct email (default hidden) |
| `show_phone` | OFF | Phone number (default hidden) |
| `show_social_links` | ✓ ON | Twitter, Instagram |

### Physical & Baseball
| Setting | Default | Description |
|---------|---------|-------------|
| `show_height_weight` | ✓ ON | Physical measurements |
| `show_position` | ✓ ON | Primary/secondary positions |
| `show_grad_year` | ✓ ON | Graduation year |
| `show_bats_throws` | ✓ ON | Batting and throwing hand |

### Recruiting Features (require `recruiting_activated`)
| Setting | Default | Description |
|---------|---------|-------------|
| `show_in_discover` | ✓ ON | Appear in coach searches |
| `show_videos` | ✓ ON | Display highlight videos |
| `show_dream_schools` | ✓ ON | Top 10 dream schools list |
| `show_calendar` | OFF | Public event calendar |
| `show_stats` | ✓ ON | Verified statistics |

### Academics
| Setting | Default | Description |
|---------|---------|-------------|
| `show_gpa` | ✓ ON | Grade point average |
| `show_test_scores` | OFF | SAT/ACT scores |

### Privacy
| Setting | Default | Description |
|---------|---------|-------------|
| `allow_messages` | ✓ ON | Coaches can message directly |
| `notify_on_interest` | ✓ ON | Notified when coaches view profile |

---

## Program/Organization Settings

Coaches can toggle visibility of:

### Program Info
- `show_description` - About section
- `show_program_stats` - Championships, pro players count
- `show_conference_info` - Division/conference
- `show_facilities` - Facility photos
- `show_commitments` - Committed players list

### Staff Display
- `show_staff_bios` - Staff biographies
- `show_staff_photos` - Headshots
- `show_recruiting_indicators` - **Green glow on active recruiters**

### Contact & Features
- `show_email` / `show_phone` / `show_social_links`
- `show_camps` - Upcoming camps for registration
- `show_calendar` - Public team schedule
- `allow_player_messages` - Players can message

---

## Green Recruiting Indicator

The green dot/glow appears when:

### For Players
- `recruiting_activated = true`
- Shows on player cards, avatars, and profiles
- Indicates "Actively looking for college opportunities"

### For Coaches/Staff
- Coach has a linked account with recruiting access
- Shows on staff cards in program profile
- Indicates "Can be contacted for recruiting"

### Implementation
```tsx
// PlayerCard.tsx
{player.recruiting_activated && (
  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-2 border-white" />
)}

// Staff card
{member.has_recruiting_profile && (
  <div className="w-4 h-4 bg-green-500 rounded-full ring-2 ring-white shadow-lg animate-pulse" />
)}
```

---

## Dream Schools Feature

Players can set their top 10 dream schools:

```tsx
// Ranked list stored in player_dream_schools table
const dreamSchools = [
  { rank: 1, school: 'Texas' },
  { rank: 2, school: 'Texas A&M' },
  // ... up to 10
];
```

Shows on public profile when `show_dream_schools = true`.

Coaches can see which players have their school in top 10.

---

## Staff Management

Programs can add unlimited staff members:

```tsx
interface StaffMember {
  name: string;
  title: string;           // 'Head Coach', 'Pitching Coach', etc.
  bio: string;
  headshot_url: string;    // Uploaded photo
  has_recruiting_profile: boolean;  // Green indicator
}
```

### Features
- Drag to reorder
- Upload headshots
- Edit inline
- Link to coach account (enables green indicator)

---

## Improved Calendar

### New Features
- **Event Categories**: Practice, Game, Camp, Visit, Showcase, Other
- **Color coding** by category
- **Practice Plans**: Create detailed practice plans
- **Send to Team**: Notify players via push/email
- **Templates**: Save practice plans as reusable templates

### Practice Plan Structure
```tsx
interface PracticePlan {
  title: string;
  duration_minutes: number;
  activities: {
    name: string;
    duration: number;
    description: string;
  }[];
}
```

---

## Modern Player Cards

Updated `PlayerCard` component:
- **Centered layout** - Avatar at top, name below
- **Stats row** - Velo, GPA, Height in 3-column grid
- **Status badge** - Colored by recruiting stage
- **Quick actions** - View, Video, Message, Watchlist on hover
- **Green indicator** - For recruiting-active players
- **Responsive** - Works in 2, 3, or 4 column grids

```tsx
<PlayerCardGrid columns={4}>
  {players.map(player => (
    <PlayerCard 
      key={player.id}
      player={player}
      status="Contacted"
      onAddToWatchlist={handleWatchlist}
    />
  ))}
</PlayerCardGrid>
```

---

## Public Profile Data Flow

When a coach views a player profile:

1. **Fetch player data** with settings
2. **Apply privacy filter** - Remove fields where toggle is OFF
3. **Log engagement event** - Record profile view
4. **Render filtered profile** - Only show allowed fields

```tsx
// Example: Applying privacy settings
function applyPrivacySettings(player, settings) {
  return {
    name: settings.show_full_name ? player.last_name : null,
    email: settings.show_contact_email ? player.email : null,
    // ... etc
  };
}
```

---

## Integration Checklist

1. [ ] Run `PROFILE_CUSTOMIZATION_SCHEMA.sql` migration
2. [ ] Add types from `types/profile.ts`
3. [ ] Add server actions from `app/actions/profile-settings.ts`
4. [ ] Add Toggle component to `components/shared/Toggle.tsx`
5. [ ] Update PlayerCard component
6. [ ] Add Calendar component with practice plans
7. [ ] Create player privacy settings page
8. [ ] Create program profile editor page
9. [ ] Create public profile pages
10. [ ] Add green indicators throughout app

---

## Routes Summary

| Route | Description | Who Can Access |
|-------|-------------|----------------|
| `/player/settings/privacy` | Player privacy toggles | Player only |
| `/coach/college/program` | Program profile editor | Coach only |
| `/player/[id]` | Public player profile | Anyone |
| `/program/[id]` | Public program profile | Anyone |
| `/team/[id]` | Public team profile | Anyone |
| `/coach/calendar` | Calendar with practice plans | Coach only |

---

## Next Steps

1. **Test privacy toggles** - Verify fields hide/show correctly
2. **Add file uploads** - For headshots and facility photos
3. **Style public profiles** - Match v0 designs
4. **Add watchlist tracking** - When coach views player
5. **Email notifications** - When practice plan sent

---

**End of Guide**
