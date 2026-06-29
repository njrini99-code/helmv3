# Workflow Quick Reference

## Your New Setup

### Context Files (Auto-loaded)
| File | Tool | Purpose |
|------|------|---------|
| `CLAUDE.md` | Claude Code in Cursor | Full context (~2.5k tokens) |
| `.cursorrules` | Cursor | Quick reference (~400 tokens) |
| `.cursorignore` | Cursor | Speeds up indexing |

### When to Use What

**Go directly to Cursor when:**
- Adding a new component/feature you can describe simply
- "Add a button that saves X"
- "Create a stat card for scrambling %"
- Bug fixes with clear reproduction
- Refactoring existing code
- CRUD operations

**Come to Claude Chat when:**
- Architecture decisions ("How should I structure CoachHelm alerts?")
- Complex multi-file features that need planning
- You're stuck and need to think through options
- Design system decisions
- Database schema changes

### Efficient Cursor Prompts

**Good (Cursor has all it needs):**
```
Add a scrambling stat to the golf player card. 
Show it as a percentage with the label "Scrambling".
```

**Wasteful (re-explaining context Cursor already has):**
```
I'm building GolfHelm, a golf team management app using Next.js 14 
with TypeScript and Supabase. The design uses glassmorphism with 
kelly green (#16A34A) as the primary color. I need to add a 
scrambling percentage stat to the player card...
```

### Updating Context

When your project evolves, update `CLAUDE.md`:
- New tables → Add to "Key Tables" section
- New patterns → Add to "Key Patterns" section  
- New focus area → Update "Current Focus" section

Keep it under 3k tokens for speed.

---

## Quick Commands

```bash
# Dev
npm run dev

# Before committing
npm run typecheck && npm run lint

# Regenerate DB types after schema changes
npm run db:types
```

## Key Directories

```
src/app/golf/dashboard/    # Golf product pages
src/app/baseball/dashboard/ # Baseball product pages
src/components/ui/          # Shared UI primitives
src/components/golf/        # Golf-specific components
src/lib/coachhelm/          # CoachHelm AI logic
src/lib/types/              # All TypeScript types
```
