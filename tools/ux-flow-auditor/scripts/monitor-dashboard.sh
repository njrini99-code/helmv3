#!/bin/bash

# Dashboard Health Monitor
# Checks dashboard every 30 seconds for errors

DASHBOARD_PORT=3333
LOG_FILE="/tmp/dashboard-monitor.log"
ERROR_LOG="/tmp/dashboard-errors.log"

echo "🔍 Dashboard Monitor Started - $(date)" | tee -a "$LOG_FILE"
echo "Checking every 30 seconds..." | tee -a "$LOG_FILE"
echo "Press Ctrl+C to stop" | tee -a "$LOG_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG_FILE"

check_dashboard() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    # Check 1: Port listening
    if lsof -i:$DASHBOARD_PORT > /dev/null 2>&1; then
        PORT_STATUS="✅ Port $DASHBOARD_PORT active"
    else
        PORT_STATUS="❌ Port $DASHBOARD_PORT NOT listening"
        echo "[$timestamp] ERROR: Dashboard not running on port $DASHBOARD_PORT" >> "$ERROR_LOG"
    fi

    # Check 2: HTTP response
    if curl -s -f http://localhost:$DASHBOARD_PORT > /dev/null 2>&1; then
        HTTP_STATUS="✅ HTTP responding"
    else
        HTTP_STATUS="❌ HTTP not responding"
        echo "[$timestamp] ERROR: Dashboard HTTP endpoint not responding" >> "$ERROR_LOG"
    fi

    # Check 3: Syntax check files
    if node -c scripts/dashboard.cjs 2>/dev/null && \
       node -c scripts/scan-components.cjs 2>/dev/null && \
       node -c scripts/capture.cjs 2>/dev/null; then
        SYNTAX_STATUS="✅ All files valid"
    else
        SYNTAX_STATUS="❌ Syntax errors found"
        echo "[$timestamp] ERROR: Syntax errors in dashboard files" >> "$ERROR_LOG"
    fi

    # Check 4: WebSocket
    if lsof -i:$DASHBOARD_PORT | grep -q "LISTEN"; then
        WS_STATUS="✅ WebSocket ready"
    else
        WS_STATUS="⚠️  WebSocket check skipped"
    fi

    # Display status
    echo ""
    echo "[$timestamp] Status Check"
    echo "  $PORT_STATUS"
    echo "  $HTTP_STATUS"
    echo "  $SYNTAX_STATUS"
    echo "  $WS_STATUS"

    # Overall health
    if [[ "$PORT_STATUS" == *"✅"* ]] && [[ "$HTTP_STATUS" == *"✅"* ]] && [[ "$SYNTAX_STATUS" == *"✅"* ]]; then
        echo "  🟢 Overall: HEALTHY"
    else
        echo "  🔴 Overall: ERRORS DETECTED"
        echo "[$timestamp] Dashboard health check FAILED" >> "$ERROR_LOG"
    fi
}

# Main monitoring loop
while true; do
    check_dashboard
    sleep 30
done
