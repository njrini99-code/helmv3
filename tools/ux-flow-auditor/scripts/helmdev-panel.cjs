/**
 * HelmDev Panel - HTML/CSS/JS components for the UX Audit Dashboard
 */

const HELMDEV_STYLES = `
    .helmdev-panel { background: var(--glass); backdrop-filter: blur(20px); border: 1px solid var(--glass-border); border-radius: 16px; overflow: hidden; margin-bottom: 24px; display: none; }
    .helmdev-panel.visible { display: block; }
    .helmdev-header { background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(59, 130, 246, 0.1)); border-bottom: 1px solid var(--border); padding: 20px; display: flex; align-items: center; justify-content: space-between; }
    .helmdev-logo { display: flex; align-items: center; gap: 12px; }
    .helmdev-logo-icon { width: 48px; height: 48px; background: linear-gradient(135deg, #8b5cf6, #3b82f6); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3); }
    .helmdev-title { font-size: 18px; font-weight: 700; background: linear-gradient(135deg, #8b5cf6, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .helmdev-subtitle { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
    .helmdev-controls { display: flex; align-items: center; gap: 12px; }
    .helmdev-timer { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(16, 185, 129, 0.1)); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 8px; font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 600; color: #22c55e; }
    .helmdev-timer.paused { background: var(--bg-tertiary); border-color: var(--border); color: var(--text-muted); }
    .helmdev-interval-select { background: var(--bg-primary); border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; font-size: 12px; color: var(--text-primary); cursor: pointer; font-family: 'JetBrains Mono', monospace; }
    .helmdev-interval-select:focus { outline: none; border-color: #22c55e; }
    .helmdev-play-btn { width: 44px; height: 44px; border-radius: 50%; border: none; background: linear-gradient(135deg, #22c55e, #16a34a); color: white; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3); }
    .helmdev-play-btn:hover { transform: scale(1.05); }
    .helmdev-play-btn.running { background: linear-gradient(135deg, #ef4444, #dc2626); box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3); }
    .helmdev-status-indicator { display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: var(--bg-tertiary); border-radius: 8px; font-size: 12px; }
    .helmdev-status-dot { width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; }
    .helmdev-status-dot.running { background: #22c55e; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .helmdev-content { padding: 20px; }
    .helmdev-autonomous-banner { display: none; align-items: center; justify-content: space-between; padding: 16px 20px; margin-bottom: 20px; border-radius: 12px; background: linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(16, 185, 129, 0.1)); border: 1px solid rgba(34, 197, 94, 0.3); }
    .helmdev-autonomous-banner.visible { display: flex; }
    .helmdev-autonomous-info { display: flex; align-items: center; gap: 12px; }
    .helmdev-autonomous-icon { width: 40px; height: 40px; border-radius: 10px; background: rgba(34, 197, 94, 0.2); display: flex; align-items: center; justify-content: center; font-size: 20px; }
    .helmdev-autonomous-title { font-size: 14px; font-weight: 600; color: #22c55e; }
    .helmdev-autonomous-desc { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
    .helmdev-autonomous-stats { display: flex; gap: 20px; font-size: 12px; }
    .helmdev-autonomous-stat { text-align: center; }
    .helmdev-autonomous-stat-value { font-size: 18px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
    .helmdev-autonomous-stat-label { font-size: 10px; color: var(--text-muted); }
    .helmdev-actions-row { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
    .helmdev-action-btn { display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; color: var(--text-primary); font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.2s; }
    .helmdev-action-btn:hover { background: var(--bg-tertiary); border-color: var(--border-hover); }
    .helmdev-action-btn.typescript { background: rgba(59, 130, 246, 0.15); border-color: rgba(59, 130, 246, 0.3); }
    .helmdev-action-btn.improvement { background: rgba(236, 72, 153, 0.15); border-color: rgba(236, 72, 153, 0.3); }
    .helmdev-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .helmdev-stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 20px; }
    .helmdev-stat { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; padding: 16px; text-align: center; }
    .helmdev-stat-value { font-size: 28px; font-weight: 700; font-family: 'JetBrains Mono', monospace; margin-bottom: 4px; }
    .helmdev-stat-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; }
    .helmdev-stat.pending .helmdev-stat-value { color: #f59e0b; }
    .helmdev-stat.completed .helmdev-stat-value { color: #22c55e; }
    .helmdev-stat.skipped .helmdev-stat-value { color: #6b7280; }
    .helmdev-stat.errors .helmdev-stat-value { color: #ef4444; }
    .helmdev-stat.improvements .helmdev-stat-value { color: #ec4899; }
    .helmdev-stat.success .helmdev-stat-value { color: #22c55e; }
    .helmdev-queue { display: grid; grid-template-columns: 1fr 380px; gap: 20px; }
    .helmdev-queue-list { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
    .helmdev-queue-header { padding: 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
    .helmdev-queue-title { font-size: 14px; font-weight: 600; }
    .helmdev-queue-actions { display: flex; gap: 8px; }
    .helmdev-queue-btn { padding: 6px 12px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-secondary); font-size: 11px; font-weight: 500; cursor: pointer; }
    .helmdev-queue-btn:hover { background: var(--bg-elevated); color: var(--text-primary); }
    .helmdev-queue-items { max-height: 400px; overflow-y: auto; }
    .helmdev-task-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); cursor: pointer; }
    .helmdev-task-item:hover { background: var(--bg-tertiary); }
    .helmdev-task-item.active { background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(59, 130, 246, 0.05)); border-left: 3px solid #8b5cf6; }
    .helmdev-task-item.processing { background: linear-gradient(135deg, rgba(236, 72, 153, 0.15), rgba(139, 92, 246, 0.1)); border-left: 3px solid #ec4899; }
    .helmdev-task-priority { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .helmdev-task-priority.p1 { background: #ef4444; }
    .helmdev-task-priority.p2 { background: #f59e0b; }
    .helmdev-task-priority.p3 { background: #3b82f6; }
    .helmdev-task-priority.p4 { background: #ec4899; }
    .helmdev-task-priority.p5 { background: #8b5cf6; }
    .helmdev-task-content { flex: 1; min-width: 0; }
    .helmdev-task-type { font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 2px; }
    .helmdev-task-message { font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .helmdev-task-file { font-size: 10px; font-family: 'JetBrains Mono', monospace; color: var(--text-muted); margin-top: 4px; }
    .helmdev-task-badge { font-size: 9px; padding: 2px 6px; border-radius: 4px; background: rgba(236,72,153,0.2); color: #ec4899; margin-left: 8px; }
    .helmdev-current-task { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
    .helmdev-current-header { padding: 16px; border-bottom: 1px solid var(--border); background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), transparent); }
    .helmdev-current-title { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .helmdev-current-content { padding: 16px; }
    .helmdev-current-empty { padding: 40px 20px; text-align: center; color: var(--text-muted); }
    .helmdev-current-empty-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.5; }
    .helmdev-prompt-preview { background: var(--bg-primary); border: 1px solid var(--border); border-radius: 8px; padding: 16px; font-family: 'JetBrains Mono', monospace; font-size: 11px; max-height: 200px; overflow-y: auto; white-space: pre-wrap; margin-top: 12px; }
    .helmdev-activity-log { margin-top: 20px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; display: none; }
    .helmdev-activity-log.visible { display: block; }
    .helmdev-activity-header { padding: 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
    .helmdev-activity-title { font-size: 14px; font-weight: 600; }
    .helmdev-activity-items { max-height: 200px; overflow-y: auto; padding: 8px; }
    .helmdev-activity-item { display: flex; align-items: flex-start; gap: 10px; padding: 8px; font-size: 11px; }
    .helmdev-activity-time { font-family: 'JetBrains Mono', monospace; color: var(--text-muted); flex-shrink: 0; }
    .helmdev-activity-msg { color: var(--text-secondary); }
    .helmdev-activity-msg.success { color: #22c55e; }
    .helmdev-activity-msg.error { color: #ef4444; }
    .helmdev-activity-msg.info { color: #3b82f6; }
    .helmdev-activity-msg.executing { color: #ec4899; }
    .helmdev-results { margin-top: 20px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
    .helmdev-results-header { padding: 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
    .helmdev-results-content { padding: 16px; max-height: 300px; overflow-y: auto; }
    .helmdev-ts-result { padding: 12px; border-radius: 8px; }
    .helmdev-ts-result.passed { background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.2); }
    .helmdev-ts-result.failed { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); }
    .helmdev-memory { margin-top: 20px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
    .helmdev-memory-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .helmdev-memory-title { font-size: 14px; font-weight: 600; }
    .helmdev-memory-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .helmdev-memory-item { background: var(--bg-tertiary); border-radius: 8px; padding: 12px; }
    .helmdev-memory-value { font-size: 20px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
    .helmdev-memory-label { font-size: 10px; color: var(--text-muted); margin-top: 4px; }
`;

const HELMDEV_HTML = `
    <div class="helmdev-panel" id="helmdev-panel">
      <div class="helmdev-header">
        <div class="helmdev-logo">
          <div class="helmdev-logo-icon">🤖</div>
          <div>
            <div class="helmdev-title">HelmDev Agent</div>
            <div class="helmdev-subtitle">Claude Code CLI • <span id="helmdev-mode-label">Auto Accept Mode</span></div>
          </div>
        </div>
        <div class="helmdev-controls">
          <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-secondary); cursor: pointer;" title="When enabled, bypasses ALL permission checks (dangerous but fully autonomous)">
            <input type="checkbox" id="helmdev-full-auto" onchange="toggleFullAutoMode()" style="cursor: pointer;">
            Full Auto
          </label>
          <select class="helmdev-interval-select" id="helmdev-interval" onchange="changeInterval()">
            <option value="30">30s</option>
            <option value="60">1m</option>
            <option value="120">2m</option>
            <option value="180" selected>3m</option>
            <option value="300">5m</option>
          </select>
          <div class="helmdev-timer paused" id="helmdev-timer">
            ⏱️ <span id="helmdev-countdown">3:00</span>
          </div>
          <button class="helmdev-play-btn" id="helmdev-play-btn" onclick="toggleAutoMode()" title="Start/Stop Auto Mode">▶</button>
          <div class="helmdev-status-indicator">
            <div class="helmdev-status-dot" id="helmdev-status-dot"></div>
            <span id="helmdev-status-text">Idle</span>
          </div>
        </div>
      </div>
      <div class="helmdev-content">
        <div class="helmdev-autonomous-banner" id="helmdev-autonomous-banner">
          <div class="helmdev-autonomous-info">
            <div class="helmdev-autonomous-icon">🤖</div>
            <div>
              <div class="helmdev-autonomous-title">Auto Mode Active</div>
              <div class="helmdev-autonomous-desc" id="helmdev-autonomous-status">Running...</div>
            </div>
          </div>
          <div class="helmdev-autonomous-stats">
            <div class="helmdev-autonomous-stat">
              <div class="helmdev-autonomous-stat-value" id="helmdev-auto-processed">0</div>
              <div class="helmdev-autonomous-stat-label">Sent</div>
            </div>
            <div class="helmdev-autonomous-stat">
              <div class="helmdev-autonomous-stat-value" id="helmdev-auto-remaining">0</div>
              <div class="helmdev-autonomous-stat-label">Remaining</div>
            </div>
          </div>
        </div>
        <div class="helmdev-actions-row">
          <button class="helmdev-action-btn typescript" onclick="runTypeScriptCheck()" id="typescript-btn">📦 TypeScript Check</button>
          <button class="helmdev-action-btn" onclick="sendNextTaskNow()">⚡ Send Next Now</button>
          <button class="helmdev-action-btn improvement" onclick="addImprovements()">💡 Add Improvements</button>
        </div>
        <div class="helmdev-stats">
          <div class="helmdev-stat pending"><div class="helmdev-stat-value" id="helmdev-stat-pending">0</div><div class="helmdev-stat-label">Issues</div></div>
          <div class="helmdev-stat improvements"><div class="helmdev-stat-value" id="helmdev-stat-improvements">0</div><div class="helmdev-stat-label">Improvements</div></div>
          <div class="helmdev-stat completed"><div class="helmdev-stat-value" id="helmdev-stat-completed">0</div><div class="helmdev-stat-label">Completed</div></div>
          <div class="helmdev-stat skipped"><div class="helmdev-stat-value" id="helmdev-stat-skipped">0</div><div class="helmdev-stat-label">Skipped</div></div>
          <div class="helmdev-stat errors"><div class="helmdev-stat-value" id="helmdev-stat-errors">0</div><div class="helmdev-stat-label">Critical</div></div>
          <div class="helmdev-stat success"><div class="helmdev-stat-value" id="helmdev-stat-success">0%</div><div class="helmdev-stat-label">Success</div></div>
        </div>
        <div class="helmdev-queue">
          <div class="helmdev-queue-list">
            <div class="helmdev-queue-header">
              <span class="helmdev-queue-title">📋 Task Queue</span>
              <div class="helmdev-queue-actions">
                <button class="helmdev-queue-btn" onclick="refreshHelmdevQueue()">🔄 Refresh</button>
                <button class="helmdev-queue-btn" onclick="populateHelmdevQueue()">📥 Populate</button>
                <button class="helmdev-queue-btn" onclick="clearHelmdevHistory()">🗑️ Clear</button>
              </div>
            </div>
            <div class="helmdev-queue-items" id="helmdev-queue-items">
              <div style="padding: 40px 20px; text-align: center; color: var(--text-muted);">
                <div style="font-size: 32px; margin-bottom: 12px; opacity: 0.5;">📋</div>
                <p style="font-size: 13px;">No tasks in queue</p>
                <p style="font-size: 11px; margin-top: 4px;">Click "Populate" to add issues</p>
              </div>
            </div>
          </div>
          <div class="helmdev-current-task">
            <div class="helmdev-current-header"><div class="helmdev-current-title"><span>⚡</span><span>Current Task</span></div></div>
            <div class="helmdev-current-content" id="helmdev-current-content">
              <div class="helmdev-current-empty">
                <div class="helmdev-current-empty-icon">🎯</div>
                <p style="font-size: 13px;">No task in progress</p>
              </div>
            </div>
          </div>
        </div>
        <div class="helmdev-activity-log" id="helmdev-activity-log">
          <div class="helmdev-activity-header">
            <span class="helmdev-activity-title">📝 Activity Log</span>
            <button class="helmdev-queue-btn" onclick="clearActivityLog()">Clear</button>
          </div>
          <div class="helmdev-activity-items" id="helmdev-activity-items"></div>
        </div>
        <div class="helmdev-results" id="helmdev-results" style="display: none;">
          <div class="helmdev-results-header">
            <span class="helmdev-results-title" id="helmdev-results-title">Results</span>
            <button class="helmdev-queue-btn" onclick="hideResults()">✕ Close</button>
          </div>
          <div class="helmdev-results-content" id="helmdev-results-content"></div>
        </div>
        <div class="helmdev-memory">
          <div class="helmdev-memory-header"><span class="helmdev-memory-title">🧠 Session Stats</span></div>
          <div class="helmdev-memory-grid">
            <div class="helmdev-memory-item"><div class="helmdev-memory-value" id="helmdev-memory-fixes" style="color: #22c55e;">0</div><div class="helmdev-memory-label">Tasks Sent</div></div>
            <div class="helmdev-memory-item"><div class="helmdev-memory-value" id="helmdev-memory-failures" style="color: #ef4444;">0</div><div class="helmdev-memory-label">Skipped</div></div>
            <div class="helmdev-memory-item"><div class="helmdev-memory-value" id="helmdev-memory-insights" style="color: #3b82f6;">--</div><div class="helmdev-memory-label">Interval</div></div>
          </div>
        </div>
      </div>
    </div>
`;

const HELMDEV_JS = `
    // HelmDev State
    var helmdevState = {
      isRunning: false,
      currentTask: null,
      currentPrompt: null,
      queue: { tasks: [], completed: [], skipped: [] },
      stats: {},
      selectedTaskId: null,
      autoProcessed: 0,
      activityLog: [],
      fullAutoMode: false  // When true, uses --dangerously-skip-permissions
    };
    var helmdevVisible = false;
    var timerIntervalId = null;
    var intervalSeconds = 180; // Default 3 minutes
    var secondsRemaining = 180;
    
    function toggleFullAutoMode() {
      helmdevState.fullAutoMode = document.getElementById('helmdev-full-auto').checked;
      var label = document.getElementById('helmdev-mode-label');
      if (helmdevState.fullAutoMode) {
        label.textContent = '⚠️ FULL AUTO (skip all permissions)';
        label.style.color = '#ef4444';
        logActivity('⚠️ FULL AUTO enabled - all permissions bypassed', 'error');
      } else {
        label.textContent = 'Auto Accept Mode';
        label.style.color = '';
        logActivity('✅ Switched to Auto Accept mode', 'info');
      }
    }

    function toggleHelmdevPanel() {
      helmdevVisible = !helmdevVisible;
      var panel = document.getElementById('helmdev-panel');
      if (helmdevVisible) {
        panel.classList.add('visible');
        refreshHelmdevState();
      } else {
        panel.classList.remove('visible');
      }
    }
    
    function changeInterval() {
      var select = document.getElementById('helmdev-interval');
      intervalSeconds = parseInt(select.value, 10);
      secondsRemaining = intervalSeconds;
      updateTimerDisplay();
      updateIntervalDisplay();
      logActivity('⏱️ Interval changed to ' + formatTime(intervalSeconds), 'info');
    }
    
    function formatTime(secs) {
      var m = Math.floor(secs / 60);
      var s = secs % 60;
      if (m > 0) {
        return m + ':' + (s < 10 ? '0' : '') + s;
      }
      return s + 's';
    }
    
    function updateTimerDisplay() {
      var m = Math.floor(secondsRemaining / 60);
      var s = secondsRemaining % 60;
      document.getElementById('helmdev-countdown').textContent = m + ':' + (s < 10 ? '0' : '') + s;
    }
    
    function updateIntervalDisplay() {
      var text = intervalSeconds >= 60 ? Math.floor(intervalSeconds/60) + 'm' : intervalSeconds + 's';
      document.getElementById('helmdev-memory-insights').textContent = text;
    }

    function toggleAutoMode() {
      if (helmdevState.isRunning) {
        stopAutoMode();
      } else {
        startAutoMode();
      }
    }
    
    function startAutoMode() {
      var tasks = helmdevState.queue.tasks || [];
      var pending = tasks.filter(function(t) { return t.status === 'pending'; });
      
      if (pending.length === 0) {
        alert('No pending tasks. Click Populate first.');
        return;
      }
      
      helmdevState.isRunning = true;
      helmdevState.autoProcessed = 0;
      secondsRemaining = intervalSeconds;
      
      // Update UI
      document.getElementById('helmdev-play-btn').classList.add('running');
      document.getElementById('helmdev-play-btn').innerHTML = '⏹';
      document.getElementById('helmdev-autonomous-banner').classList.add('visible');
      document.getElementById('helmdev-timer').classList.remove('paused');
      document.getElementById('helmdev-status-dot').classList.add('running');
      document.getElementById('helmdev-status-text').textContent = 'Running';
      document.getElementById('helmdev-activity-log').classList.add('visible');
      document.getElementById('helmdev-interval').disabled = true;
      
      updateTimerDisplay();
      updateIntervalDisplay();
      updateAutonomousStats();
      
      logActivity('🚀 Auto mode started (every ' + formatTime(intervalSeconds) + ')', 'info');
      
      // Clear any existing timer
      if (timerIntervalId) {
        clearInterval(timerIntervalId);
      }
      
      // Start the countdown timer - runs every second
      timerIntervalId = setInterval(function() {
        if (!helmdevState.isRunning) {
          clearInterval(timerIntervalId);
          return;
        }
        
        secondsRemaining--;
        updateTimerDisplay();
        
        if (secondsRemaining <= 0) {
          secondsRemaining = intervalSeconds;
          logActivity('⏰ Timer triggered, sending next task...', 'info');
          sendNextTask();
        }
      }, 1000);
      
      // Send first task immediately
      sendNextTask();
    }
    
    function stopAutoMode() {
      helmdevState.isRunning = false;
      
      if (timerIntervalId) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
      }
      
      document.getElementById('helmdev-play-btn').classList.remove('running');
      document.getElementById('helmdev-play-btn').innerHTML = '▶';
      document.getElementById('helmdev-autonomous-banner').classList.remove('visible');
      document.getElementById('helmdev-timer').classList.add('paused');
      document.getElementById('helmdev-status-dot').classList.remove('running');
      document.getElementById('helmdev-status-text').textContent = 'Stopped';
      document.getElementById('helmdev-interval').disabled = false;
      
      secondsRemaining = intervalSeconds;
      updateTimerDisplay();
      
      logActivity('⏹ Stopped. Sent ' + helmdevState.autoProcessed + ' tasks.', 'info');
    }
    
    async function sendNextTask() {
      if (!helmdevState.isRunning) return;
      
      // Refresh state first to get latest queue
      await refreshHelmdevState();
      
      var tasks = helmdevState.queue.tasks || [];
      var pending = tasks.filter(function(t) { return t.status === 'pending'; });
      
      if (pending.length === 0) {
        logActivity('✅ All tasks complete!', 'success');
        stopAutoMode();
        return;
      }
      
      var task = pending[0];
      var isImprovement = task.priority > 3;
      
      logActivity((isImprovement ? '💡' : '🔧') + ' Sending: ' + task.type, 'executing');
      document.getElementById('helmdev-autonomous-status').textContent = 'Sending: ' + task.type;
      
      helmdevState.currentTask = task;
      helmdevState.selectedTaskId = task.id;
      renderHelmdevQueue();
      
      try {
        // Get prompt
        var dispatchRes = await fetch('/api/helmdev/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: task.id })
        });
        var dispatchData = await dispatchRes.json();
        
        if (!dispatchData.prompt) {
          throw new Error('No prompt generated');
        }
        
        helmdevState.currentPrompt = dispatchData.prompt;
        renderCurrentTask();
        
        // Execute with Claude Code CLI
        var executeEndpoint = helmdevState.fullAutoMode 
          ? '/api/helmdev/execute-claude-autonomous' 
          : '/api/helmdev/execute-claude-cli';
        
        var execRes = await fetch(executeEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: dispatchData.prompt, taskId: task.id })
        });
        var execData = await execRes.json();
        
        if (execData.success) {
          logActivity('✅ Claude started: ' + task.type, 'success');
          helmdevState.autoProcessed++;
          
          // Mark as complete
          await fetch('/api/helmdev/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId: task.id, success: true })
          });
          
          // Refresh to update UI
          await refreshHelmdevState();
          updateAutonomousStats();
          
          document.getElementById('helmdev-autonomous-status').textContent = 'Next in ' + formatTime(secondsRemaining);
        } else {
          logActivity('⚠️ Error: ' + (execData.error || 'Unknown'), 'error');
        }
      } catch (err) {
        logActivity('❌ Error: ' + err.message, 'error');
      }
    }
    
    function sendNextTaskNow() {
      if (!helmdevState.isRunning) {
        // Just send one task
        sendSingleTask();
      } else {
        // Reset timer and send now
        secondsRemaining = intervalSeconds;
        updateTimerDisplay();
        sendNextTask();
      }
    }
    
    async function sendSingleTask() {
      await refreshHelmdevState();
      
      var tasks = helmdevState.queue.tasks || [];
      var pending = tasks.filter(function(t) { return t.status === 'pending'; });
      
      if (pending.length === 0) {
        alert('No pending tasks');
        return;
      }
      
      var task = pending[0];
      document.getElementById('helmdev-activity-log').classList.add('visible');
      logActivity('📤 Sending: ' + task.type, 'executing');
      
      try {
        var dispatchRes = await fetch('/api/helmdev/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: task.id })
        });
        var dispatchData = await dispatchRes.json();
        
        helmdevState.currentPrompt = dispatchData.prompt;
        helmdevState.currentTask = task;
        renderCurrentTask();
        
        var executeEndpoint = helmdevState.fullAutoMode 
          ? '/api/helmdev/execute-claude-autonomous' 
          : '/api/helmdev/execute-claude-cli';
        
        var execRes = await fetch(executeEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: dispatchData.prompt, taskId: task.id })
        });
        
        logActivity('✅ Claude started', 'success');
        
        await fetch('/api/helmdev/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: task.id, success: true })
        });
        
        await refreshHelmdevState();
      } catch (err) {
        logActivity('❌ Error: ' + err.message, 'error');
      }
    }
    
    async function addImprovements() {
      logActivity('💡 Generating improvements...', 'info');
      try {
        var res = await fetch('/api/helmdev/generate-improvements', { method: 'POST' });
        var data = await res.json();
        if (data.added > 0) {
          logActivity('✅ Added ' + data.added + ' improvements', 'success');
          await refreshHelmdevState();
        } else {
          logActivity('ℹ️ No new improvements', 'info');
        }
      } catch (err) {
        logActivity('❌ Error: ' + err.message, 'error');
      }
    }
    
    function updateAutonomousStats() {
      var tasks = helmdevState.queue.tasks || [];
      var pending = tasks.filter(function(t) { return t.status === 'pending'; }).length;
      document.getElementById('helmdev-auto-processed').textContent = helmdevState.autoProcessed;
      document.getElementById('helmdev-auto-remaining').textContent = pending;
    }
    
    function logActivity(msg, type) {
      var time = new Date().toLocaleTimeString();
      helmdevState.activityLog.unshift({ time: time, message: msg, type: type });
      if (helmdevState.activityLog.length > 50) helmdevState.activityLog.length = 50;
      renderActivityLog();
    }
    
    function renderActivityLog() {
      var container = document.getElementById('helmdev-activity-items');
      var html = '';
      helmdevState.activityLog.slice(0, 20).forEach(function(item) {
        html += '<div class="helmdev-activity-item"><span class="helmdev-activity-time">' + item.time + '</span><span class="helmdev-activity-msg ' + item.type + '">' + escapeHtml(item.message) + '</span></div>';
      });
      container.innerHTML = html;
    }
    
    function clearActivityLog() {
      helmdevState.activityLog = [];
      renderActivityLog();
    }

    async function refreshHelmdevState() {
      try {
        var res = await fetch('/api/helmdev/state');
        var data = await res.json();
        helmdevState.queue = data.queue || helmdevState.queue;
        helmdevState.stats = data.stats || helmdevState.stats;
        renderHelmdevUI();
      } catch (err) {
        console.error('Refresh failed:', err);
      }
    }

    async function refreshHelmdevQueue() {
      await refreshHelmdevState();
      logActivity('🔄 Queue refreshed', 'info');
    }

    async function populateHelmdevQueue() {
      try {
        var res = await fetch('/api/helmdev/populate', { method: 'POST' });
        var data = await res.json();
        helmdevState.queue = data.queue;
        helmdevState.stats = data.stats;
        renderHelmdevUI();
        document.getElementById('helmdev-activity-log').classList.add('visible');
        logActivity('📥 Loaded ' + (data.queue.tasks ? data.queue.tasks.length : 0) + ' tasks', 'info');
      } catch (err) {
        console.error('Populate failed:', err);
      }
    }

    async function clearHelmdevHistory() {
      if (!confirm('Clear completed and skipped tasks?')) return;
      await fetch('/api/helmdev/clear-history', { method: 'POST' });
      await refreshHelmdevState();
      logActivity('🗑️ History cleared', 'info');
    }

    async function runTypeScriptCheck() {
      var btn = document.getElementById('typescript-btn');
      btn.disabled = true;
      btn.textContent = 'Checking...';
      try {
        var res = await fetch('/api/helmdev/typescript-check');
        var data = await res.json();
        var html = '<div class="helmdev-ts-result ' + (data.passed ? 'passed' : 'failed') + '">';
        html += data.passed ? '✅ No errors' : '❌ ' + (data.errors ? data.errors.length : 0) + ' errors';
        html += '</div>';
        showResults('TypeScript', html);
      } catch (err) {
        showResults('TypeScript', '<div style="color:red;">Failed</div>');
      }
      btn.disabled = false;
      btn.textContent = '📦 TypeScript Check';
    }

    function showResults(title, content) {
      document.getElementById('helmdev-results-title').textContent = title;
      document.getElementById('helmdev-results-content').innerHTML = content;
      document.getElementById('helmdev-results').style.display = 'block';
    }

    function hideResults() {
      document.getElementById('helmdev-results').style.display = 'none';
    }

    function selectHelmdevTask(taskId) {
      helmdevState.selectedTaskId = taskId;
      helmdevState.currentTask = (helmdevState.queue.tasks || []).find(function(t) { return t.id === taskId; });
      renderHelmdevQueue();
      renderCurrentTask();
    }

    function renderHelmdevUI() {
      renderHelmdevStats();
      renderHelmdevQueue();
      renderCurrentTask();
      renderHelmdevMemory();
      updateAutonomousStats();
      updateIntervalDisplay();
    }

    function renderHelmdevStats() {
      var stats = helmdevState.stats || {};
      var queue = stats.queue || {};
      var memory = stats.memory || {};
      var tasks = helmdevState.queue.tasks || [];
      var issues = tasks.filter(function(t) { return t.status === 'pending' && t.priority <= 3; }).length;
      var improvements = tasks.filter(function(t) { return t.status === 'pending' && t.priority > 3; }).length;
      document.getElementById('helmdev-stat-pending').textContent = issues;
      document.getElementById('helmdev-stat-improvements').textContent = improvements;
      document.getElementById('helmdev-stat-completed').textContent = queue.completed || 0;
      document.getElementById('helmdev-stat-skipped').textContent = queue.skipped || 0;
      document.getElementById('helmdev-stat-errors').textContent = stats.byPriority ? stats.byPriority.critical : 0;
      document.getElementById('helmdev-stat-success').textContent = (memory.successRate || 0) + '%';
    }

    function renderHelmdevQueue() {
      var container = document.getElementById('helmdev-queue-items');
      var tasks = helmdevState.queue.tasks || [];
      if (tasks.length === 0) {
        container.innerHTML = '<div style="padding: 40px 20px; text-align: center; color: var(--text-muted);"><div style="font-size: 32px; margin-bottom: 12px;">📋</div><p>No tasks</p></div>';
        return;
      }
      var html = '';
      tasks.slice(0, 50).forEach(function(task) {
        var isActive = helmdevState.selectedTaskId === task.id;
        var isProcessing = helmdevState.currentTask && helmdevState.currentTask.id === task.id;
        var isImprovement = task.priority > 3;
        var cls = 'helmdev-task-item';
        if (isProcessing) cls += ' processing';
        else if (isActive) cls += ' active';
        html += '<div class="' + cls + '" onclick="selectHelmdevTask(\\'' + task.id.replace(/'/g, "\\\\'") + '\\')">';
        html += '<div class="helmdev-task-priority p' + task.priority + '"></div>';
        html += '<div class="helmdev-task-content">';
        html += '<div class="helmdev-task-type">' + escapeHtml(task.type);
        if (isImprovement) html += '<span class="helmdev-task-badge">improvement</span>';
        html += '</div>';
        html += '<div class="helmdev-task-message">' + escapeHtml(task.message) + '</div>';
        html += '<div class="helmdev-task-file">' + escapeHtml(task.file_path.split('/').slice(-2).join('/')) + '</div>';
        html += '</div></div>';
      });
      container.innerHTML = html;
    }

    function renderCurrentTask() {
      var container = document.getElementById('helmdev-current-content');
      var task = helmdevState.currentTask;
      if (!task && helmdevState.selectedTaskId) {
        task = (helmdevState.queue.tasks || []).find(function(t) { return t.id === helmdevState.selectedTaskId; });
      }
      if (!task) {
        container.innerHTML = '<div class="helmdev-current-empty"><div class="helmdev-current-empty-icon">🎯</div><p>No task selected</p></div>';
        return;
      }
      var html = '<div style="margin-bottom:16px;"><div style="font-size:12px;color:var(--text-muted);">TYPE</div><div style="font-size:16px;font-weight:600;">' + escapeHtml(task.type) + '</div></div>';
      html += '<div style="margin-bottom:16px;"><div style="font-size:12px;color:var(--text-muted);">FILE</div><div style="font-family:monospace;font-size:12px;">' + escapeHtml(task.file_path) + '</div></div>';
      html += '<div><div style="font-size:12px;color:var(--text-muted);">MESSAGE</div><div style="font-size:13px;">' + escapeHtml(task.message) + '</div></div>';
      if (helmdevState.currentPrompt) {
        html += '<div class="helmdev-prompt-preview">' + escapeHtml(helmdevState.currentPrompt.slice(0, 500)) + '...</div>';
      }
      container.innerHTML = html;
    }

    function renderHelmdevMemory() {
      document.getElementById('helmdev-memory-fixes').textContent = (helmdevState.queue.completed || []).length;
      document.getElementById('helmdev-memory-failures').textContent = (helmdevState.queue.skipped || []).length;
    }
`;

module.exports = { HELMDEV_STYLES, HELMDEV_HTML, HELMDEV_JS };
