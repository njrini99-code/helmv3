# SETUP_INSTRUCTIONS.md

## 🚀 One-Time Setup (5 minutes)

### Step 1: Create the docs folder in your project

Open terminal in your Helm Sports Labs project root and run:

```bash
mkdir -p docs
```

### Step 2: Download all docs from Claude

1. Download the `helm-docs.zip` file I'll provide
2. Unzip it
3. Copy ALL `.md` files into your `docs/` folder

Your structure should look like:
```
helm-sports-labs/
├── docs/
│   ├── CLAUDE.md              ← Master context
│   ├── TODO.md                ← Task queue (Cursor follows this)
│   ├── FULL_AUDIT_PROMPT.md   ← Audit checklist
│   ├── SCHEMA.md              ← Database schema
│   ├── PHASE_1_COLLEGE_COACH.md
│   ├── PHASE_2_HS_COACH.md
│   ├── PHASE_3_PLAYER_CORE.md
│   ├── PHASE_4_PLAYER_RECRUITING.md
│   ├── PHASE_5_JUCO_COACH.md
│   ├── PHASE_6_SHOWCASE_COACH.md
│   ├── SHARED_SYSTEMS.md
│   ├── MVP_SPRINT_PLAN.md
│   ├── PROFILE_FEATURES_GUIDE.md
│   └── SUBSCRIPTIONS.md
├── .cursorrules               ← Cursor reads this automatically
├── app/
├── components/
└── ...
```

### Step 3: Add .cursorrules

Copy the `.cursorrules` file to your project ROOT (not in docs/):

```bash
# The file should be at:
helm-sports-labs/.cursorrules
```

### Step 4: Verify Setup

In Cursor, open a new chat and say:

```
Read /docs/TODO.md and tell me what the current task is
```

If it responds with "Sprint 1.1: Discover Players Page" - you're all set!

---

## 🎮 How To Use

### Start Working
Open Cursor and just say:
```
continue
```

Cursor will:
1. Read TODO.md
2. Find the current task
3. Read the implementation guide
4. Start building

### After Each Task
When you're happy with the result, say:
```
mark done and continue
```

Cursor will:
1. Check off the task in TODO.md
2. Move to the next task
3. Start implementing

### Run an Audit
After completing a sprint or when unsure of status:
```
run the audit from /docs/FULL_AUDIT_PROMPT.md
```

### Check Status
```
what's my current progress?
```

### Skip to Specific Task
```
skip to task 1.3 Pipeline Kanban
```

---

## 📁 Quick Reference

| Command | What It Does |
|---------|--------------|
| `continue` | Work on next task |
| `mark done` | Check off current task |
| `audit` | Full codebase check |
| `status` | Show progress |
| `skip to [task]` | Jump to specific task |

---

## 🔄 Keeping Docs Updated

When I give you new docs or updates:

1. Download the new file
2. Replace the old one in `/docs/`
3. That's it - Cursor reads fresh on each chat

---

## ❓ Troubleshooting

**Cursor isn't reading the docs:**
- Make sure `.cursorrules` is in project ROOT
- Make sure docs are in `/docs/` folder
- Start a NEW chat (old chats don't reload rules)

**Tasks are out of order:**
- Edit `TODO.md` directly to reorder
- Or say "skip to [task name]"

**Need to add a task:**
- Add it to TODO.md manually with `- [ ]` format
- Or say "add task: [description]"

---

## 🎯 Your Workflow

1. **Morning:** Open Cursor, say "continue"
2. **Work:** Cursor builds features, you review
3. **After each feature:** "mark done and continue"  
4. **End of session:** "audit" to check progress
5. **Repeat!**

---

That's it! Your docs are now your automated to-do list. 🚀
