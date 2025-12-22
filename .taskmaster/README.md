# TaskMaster - Project Task Management

**Project:** helmv3 (Helm Sports Labs - Golf Shot Tracking Platform)
**Initialized:** 2025-12-22

---

## 📁 Folder Structure

```
.taskmaster/
├── config.json          # Project configuration and settings
├── tasks.json           # Active and completed tasks
├── logs/                # Task execution logs
├── templates/           # Task templates
│   └── task-template.json
└── README.md            # This file
```

---

## 🎯 Task Statuses

| Status | Description |
|--------|-------------|
| `todo` | Not started |
| `in_progress` | Currently being worked on |
| `blocked` | Waiting on dependencies or external factors |
| `review` | Ready for code review |
| `completed` | Finished and verified |
| `archived` | Completed tasks older than 30 days |

---

## 🔥 Priority Levels

| Priority | Use When |
|----------|----------|
| `critical` | Blocking issue, production bug, security issue |
| `high` | Important feature, significant bug |
| `medium` | Standard feature work, minor bugs |
| `low` | Nice-to-have, optimization, cleanup |

---

## 📋 Task Categories

- `feature` - New functionality
- `bug` - Bug fixes
- `refactor` - Code improvements
- `docs` - Documentation
- `test` - Testing
- `chore` - Maintenance, tooling, dependencies

---

## 🚀 Quick Commands

### View All Tasks
```bash
cat .taskmaster/tasks.json | jq '.tasks'
```

### View Active Tasks
```bash
cat .taskmaster/tasks.json | jq '.tasks[] | select(.status != "completed" and .status != "archived")'
```

### View Task by ID
```bash
cat .taskmaster/tasks.json | jq '.tasks[] | select(.id == "HELM-001")'
```

### Count Tasks by Status
```bash
cat .taskmaster/tasks.json | jq '[.tasks | group_by(.status)[] | {status: .[0].status, count: length}]'
```

---

## 📝 Task ID Format

Tasks follow the format: `HELM-XXX`
- Prefix: `HELM` (project identifier)
- Number: Sequential (001, 002, 003, etc.)

---

## ✅ Completed Tasks Summary

### HELM-001: Premium Dark Scorecard
- **Status:** Completed (2025-12-21)
- **Priority:** High
- **Files:** `src/components/golf/ShotTrackingFinal.tsx`
- **Commit:** `f6625a5`
- **Features:**
  - Dark theme with impossible-to-miss current hole
  - Color-coded score indicators
  - Performance badges
  - Premium totals section

### HELM-002: Fix Shot Distance Calculation Bug
- **Status:** Completed (2025-12-21)
- **Priority:** Critical
- **Files:** `src/components/golf/ShotTrackingFinal.tsx`
- **Commit:** `f6625a5`
- **Fix:**
  - Added shotDistanceUnit field
  - Fixed unit conversion (1105 feet, not yards)
  - Improved unit detection logic

---

## 🔧 Customization

Edit `.taskmaster/config.json` to customize:
- Task ID prefix
- Default priority/status
- Auto-archive settings
- Available statuses, priorities, and categories

---

**Last Updated:** 2025-12-22
