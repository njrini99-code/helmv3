# Screenshot Integration - Quick Implementation Guide

## Step 1: Install Playwright

```bash
cd /Users/ricknini/Downloads/helmv3/tools/ux-flow-auditor
npm install
npx playwright install chromium
```

## Step 2: Test Screenshot Capture

```bash
# Make sure your app is running on localhost:3000
# In another terminal:

cd /Users/ricknini/Downloads/helmv3/tools/ux-flow-auditor

# Create a test routes file
cat > test-routes.json << 'EOF'
[
  "/",
  "/baseball",
  "/baseball/(dashboard)/dashboard",
  "/golf",
  "/golf/(dashboard)/dashboard"
]
EOF

# Capture screenshots
BASE_URL=http://localhost:3000 node scripts/capture.js test-routes.json

# View results
ls -la snapshots/latest/
cat snapshots/latest/screenshots.json | jq .summary
```

## Step 3: Add Screenshot Modal HTML

Insert after line 1140 in `scripts/dashboard.js` (after command palette div):

```html
<!-- Screenshot Modal -->
<div class="screenshot-modal" id="screenshot-modal">
  <div class="screenshot-modal-header">
    <span class="screenshot-modal-title" id="screenshot-modal-title">/route</span>
    <div class="screenshot-modal-controls">
      <div class="screenshot-view-toggle" id="screenshot-view-toggle">
        <button class="screenshot-view-btn active" data-view="desktop" onclick="switchScreenshotView('desktop')">Desktop</button>
        <button class="screenshot-view-btn" data-view="mobile" onclick="switchScreenshotView('mobile')">Mobile</button>
        <button class="screenshot-view-btn" data-view="fullPage" onclick="switchScreenshotView('fullPage')">Full Page</button>
      </div>
      <button class="screenshot-modal-close" onclick="closeScreenshotModal()">×</button>
    </div>
  </div>
  <div class="screenshot-modal-content">
    <img id="screenshot-modal-image" class="screenshot-modal-image" src="" alt="Screenshot">
  </div>
  <div class="screenshot-modal-footer">
    <span id="screenshot-modal-info">Captured: —</span>
    <span id="screenshot-modal-status">Status: —</span>
  </div>
</div>
```

## Step 4: Add Screenshots Button to Header

Find the header section (around line 1130) and add:

```html
<button class="refresh-btn" onclick="toggleScreenshotsView()">
  📸 Screenshots
</button>
```

## Step 5: Add Screenshot Gallery Panel

After the Quick Health panel, add:

```html
<div class="panel" id="screenshots-panel" style="display: none;">
  <div class="panel-header">
    <span class="panel-title">📸 Route Screenshots</span>
    <div style="display: flex; gap: 8px;">
      <button class="refresh-btn" onclick="captureScreenshots()" id="capture-btn">
        Capture All Routes
      </button>
      <button class="refresh-btn" onclick="loadLatestScreenshots()">
        Load Latest
      </button>
    </div>
  </div>
  <div class="panel-content">
    <div id="screenshot-gallery" class="screenshot-gallery">
      <div style="padding: 60px 20px; text-align: center; color: var(--text-muted);">
        <div style="font-size: 48px; margin-bottom: 16px;">📸</div>
        <p style="font-size: 14px; margin-bottom: 8px;">No screenshots captured yet</p>
        <p style="font-size: 12px;">Click "Capture All Routes" to get started</p>
      </div>
    </div>
  </div>
</div>
```

## Step 6: Add JavaScript Functions

Insert after `closeDetailPanel()` function (around line 1633):

```javascript
// Screenshot Management
var currentScreenshots = {};
var currentScreenshotView = 'desktop';
var screenshotsVisible = false;

function toggleScreenshotsView() {
  screenshotsVisible = !screenshotsVisible;
  var panel = document.getElementById('screenshots-panel');
  if (screenshotsVisible) {
    panel.style.display = 'block';
    loadLatestScreenshots();
  } else {
    panel.style.display = 'none';
  }
}

async function loadLatestScreenshots() {
  try {
    var response = await fetch('/screenshots/latest');
    var data = await response.json();
    currentScreenshots = data.screenshots || {};
    renderScreenshotGallery();
  } catch (error) {
    console.error('Failed to load screenshots:', error);
  }
}

async function captureScreenshots() {
  if (!lastData || !lastData.routes) return;

  var btn = document.getElementById('capture-btn');
  btn.disabled = true;
  btn.textContent = 'Capturing...';

  try {
    var routes = Object.keys(lastData.routes);
    var response = await fetch('/api/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routes: routes })
    });

    var result = await response.json();
    currentScreenshots = result.screenshots || {};
    renderScreenshotGallery();

    btn.textContent = 'Captured ' + result.summary.success + ' routes!';
    setTimeout(function() {
      btn.disabled = false;
      btn.textContent = 'Capture All Routes';
    }, 2000);

  } catch (error) {
    console.error('Screenshot capture failed:', error);
    btn.disabled = false;
    btn.textContent = 'Capture Failed';
  }
}

function renderScreenshotGallery() {
  var container = document.getElementById('screenshot-gallery');
  if (!currentScreenshots || Object.keys(currentScreenshots).length === 0) {
    container.innerHTML = '<div style="padding: 60px 20px; text-align: center; color: var(--text-muted);"><div style="font-size: 48px; margin-bottom: 16px;">📸</div><p style="font-size: 14px;">No screenshots available</p></div>';
    return;
  }

  var html = '';
  Object.keys(currentScreenshots).sort().forEach(function(routePath) {
    var screenshot = currentScreenshots[routePath];
    var ri = lastData.route_intelligence ? lastData.route_intelligence[routePath] : null;

    html += '<div class="screenshot-card" onclick="openScreenshotModal(\'' + escapeHtml(routePath) + '\')">';

    if (screenshot.status === 'success') {
      html += '<div class="screenshot-preview">';
      html += '<img src="data:image/png;base64,' + screenshot.desktop + '" alt="' + escapeHtml(routePath) + '">';
      html += '<div class="screenshot-overlay">';
      html += '<div class="screenshot-badge desktop">Desktop</div>';
      html += '</div>';
      html += '</div>';
    } else {
      html += '<div class="screenshot-preview error">';
      html += '<div style="font-size: 24px;">⚠️</div>';
      html += '<div>' + escapeHtml(screenshot.error || 'Failed to capture') + '</div>';
      html += '</div>';
    }

    html += '<div class="screenshot-info">';
    html += '<div class="screenshot-path">' + escapeHtml(routePath) + '</div>';

    if (ri) {
      html += '<div class="screenshot-purpose">' + getPurposeIcon(ri.inferred_purpose) + ' ' + ri.inferred_purpose + '</div>';
      html += '<div class="screenshot-stats">';
      var scoreClass = ri.completion_score >= 80 ? 'high' : ri.completion_score >= 60 ? 'medium' : 'low';
      html += '<div class="screenshot-score ' + scoreClass + '">' + ri.completion_score + '/100</div>';
      html += '<div class="screenshot-issues">' + ri.issues_count + ' issues</div>';
      html += '</div>';
    } else {
      html += '<div class="screenshot-purpose">Route</div>';
    }

    html += '</div>';
    html += '</div>';
  });

  container.innerHTML = html;
}

function openScreenshotModal(routePath) {
  var modal = document.getElementById('screenshot-modal');
  var screenshot = currentScreenshots[routePath];

  if (!screenshot || screenshot.status !== 'success') return;

  document.getElementById('screenshot-modal-title').textContent = routePath;
  document.getElementById('screenshot-modal-info').textContent = 'Captured: ' + new Date(screenshot.capturedAt).toLocaleString();
  document.getElementById('screenshot-modal-status').textContent = 'Status: ' + screenshot.statusCode;

  switchScreenshotView('desktop');
  modal.classList.add('open');
}

function closeScreenshotModal() {
  var modal = document.getElementById('screenshot-modal');
  modal.classList.remove('open');
}

function switchScreenshotView(view) {
  currentScreenshotView = view;
  var modal = document.getElementById('screenshot-modal');
  var title = document.getElementById('screenshot-modal-title').textContent;
  var screenshot = currentScreenshots[title];

  if (!screenshot) return;

  var img = document.getElementById('screenshot-modal-image');
  img.src = 'data:image/png;base64,' + screenshot[view];

  document.querySelectorAll('.screenshot-view-btn').forEach(function(btn) {
    btn.classList.remove('active');
    if (btn.dataset.view === view) {
      btn.classList.add('active');
    }
  });
}

// Close screenshot modal with Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeScreenshotModal();
  }
});
```

## Step 7: Add API Endpoint to Dashboard Server

Add to the dashboard.js HTTP server section (before `server.listen`):

```javascript
// Screenshot capture API
if (req.url === '/api/capture' && req.method === 'POST') {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { routes } = JSON.parse(body);
      const { captureAllRoutes, saveScreenshots } = require('./capture.js');

      const timestamp = new Date().toISOString();
      const result = await captureAllRoutes(routes, timestamp);
      await saveScreenshots(result, timestamp);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
  return;
}

// Serve latest screenshots
if (req.url === '/screenshots/latest' && req.method === 'GET') {
  const latestPath = path.join(__dirname, '../snapshots/latest/screenshots.json');
  if (fs.existsSync(latestPath)) {
    const data = fs.readFileSync(latestPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(data);
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ screenshots: {}, summary: { total: 0 } }));
  }
  return;
}
```

## Step 8: Test the Integration

1. Start your Next.js app: `npm run dev` (should run on localhost:3000)
2. Start the UX Auditor dashboard: `cd tools/ux-flow-auditor && npm start`
3. Open http://localhost:3333
4. Click "📸 Screenshots" button
5. Click "Capture All Routes"
6. Wait for capture to complete
7. Click any screenshot card to view in lightbox
8. Use Desktop/Mobile/Full Page toggle in lightbox

## Step 9: Add to Route Detail Panel

To show screenshot thumbnails in the route detail panel, add to `showDetailPanel()`:

```javascript
// At the top of the detail panel content
if (currentScreenshots[routePath] && currentScreenshots[routePath].status === 'success') {
  html += '<div style="margin-bottom: 16px;">';
  html += '<img src="data:image/png;base64,' + currentScreenshots[routePath].desktop + '" ';
  html += 'style="width: 100%; border-radius: 8px; cursor: pointer;" ';
  html += 'onclick="openScreenshotModal(\'' + escapeHtml(routePath) + '\')">';
  html += '</div>';
}
```

## Troubleshooting

**Screenshots not capturing:**
- Make sure app is running on localhost:3000
- Check Playwright browsers are installed: `npx playwright install chromium`
- Check console for errors

**Images not displaying:**
- Check base64 encoding is correct
- Check screenshot data is in `snapshots/latest/screenshots.json`
- Verify Content-Type headers in server responses

**Capture timeout errors:**
- Increase timeout in capture.js: `timeout: 60000`
- Check network tab for slow requests
- Ensure auth/protected routes are accessible

---

## Next Steps After Screenshot Integration

1. **AI Fix Suggestions**: Integrate Claude API
2. **Visual Diff**: Compare before/after screenshots
3. **Component Inventory**: Scan codebase for all components
4. **Gamification**: Add achievements and progress tracking
5. **Interactive Flow**: Replace Mermaid with D3.js animated flow

See `VISUAL_DASHBOARD_STATUS.md` for complete roadmap.
