#!/bin/bash
#
# HelmDev Claude Code Auto-Dispatcher
# 
# Sends task markdown files to Claude Code every 3 minutes
# with full permission bypass for autonomous operation.
#
# Usage:
#   ./auto-dispatch.sh                    # Default 3 min interval
#   ./auto-dispatch.sh 60                 # 60 second interval
#   TASK_FILE=./my-task.md ./auto-dispatch.sh  # Specific file
#

INTERVAL="${1:-180}"  # Default 3 minutes (180 seconds)
HELMDEV_DIR="${HELMDEV_DIR:-$(pwd)/../../.helmdev}"
PROJECT_ROOT="${PROJECT_ROOT:-$(pwd)/../../}"
TASKS_DIR="$HELMDEV_DIR/tasks"
LOGS_DIR="$HELMDEV_DIR/logs"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                              ║"
echo "║   🤖 HELMDEV AUTO-DISPATCH                                                   ║"
echo "║                                                                              ║"
echo "║   Autonomous Claude Code Runner                                              ║"
echo "║   Interval: ${INTERVAL}s | Press Ctrl+C to stop                                      ║"
echo "║                                                                              ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Ensure directories exist
mkdir -p "$TASKS_DIR" "$LOGS_DIR" "$TASKS_DIR/completed"

# Function to get the next task file
get_next_task() {
    # First check for current-task.md
    if [ -f "$TASKS_DIR/current-task.md" ]; then
        echo "$TASKS_DIR/current-task.md"
        return
    fi
    
    # Then check for any .md file
    for f in "$TASKS_DIR"/*.md; do
        if [ -f "$f" ] && [[ ! "$f" == *"dispatch-prompt"* ]]; then
            echo "$f"
            return
        fi
    done
}

# Function to run Claude Code with the task
run_claude_code() {
    local task_file="$1"
    local task_name=$(basename "$task_file")
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local log_file="$LOGS_DIR/${timestamp}_${task_name%.md}.log"
    
    echo -e "${GREEN}▶ Running task: $task_name${NC}"
    echo "  Log: $log_file"
    echo ""
    
    # Build the prompt
    local prompt="Read the task file at $task_file and complete all instructions in it. Follow all context files mentioned in .helmdev/context/. When done, create the result file as specified in the task."
    
    # Run Claude Code with dangerously-skip-permissions for full autonomy
    # This is the key flag that bypasses all permission prompts
    cd "$PROJECT_ROOT"
    
    # Use -y flag OR --dangerously-skip-permissions depending on Claude Code version
    # Try -y first as it's less dangerous
    if claude -y -p "$prompt" 2>&1 | tee "$log_file"; then
        echo -e "${GREEN}✅ Task completed${NC}"
        
        # Archive the completed task
        mv "$task_file" "$TASKS_DIR/completed/${timestamp}_${task_name}" 2>/dev/null || true
        return 0
    else
        echo -e "${RED}❌ Task failed or needs attention${NC}"
        return 1
    fi
}

# Main loop
task_count=0
while true; do
    task_file=$(get_next_task)
    
    if [ -n "$task_file" ] && [ -f "$task_file" ]; then
        ((task_count++))
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${CYAN}Task #$task_count | $(date '+%H:%M:%S')${NC}"
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        
        run_claude_code "$task_file"
    else
        echo -e "${YELLOW}⏳ No tasks in queue. Waiting...${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}💤 Sleeping for ${INTERVAL}s before next task...${NC}"
    echo "   (Ctrl+C to stop)"
    echo ""
    sleep "$INTERVAL"
done
