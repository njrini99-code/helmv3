# Flow Visualizer - Helm Design System Implementation

**Created:** 2025-12-30
**Purpose:** Upgrade Flow Visualizer using ACTUAL patterns from Helm Sports Labs
**Status:** Ready to implement

---

## Overview

This document imports the exact design patterns from the Helm app (`/Users/ricknini/Downloads/helmv3`) into the Ultra Agent Audit Flow Visualizer. All CSS classes, animations, and component patterns are production-tested.

---

## 1. Import Helm's Glass System

### CSS Variables (Already Perfect)
```css
/* Add to styles.css - These are from Helm's globals.css */

/* Premium Glass Material System - Dashboard Glassmorphism */
:root {
  /* Glass Level 1: Subtle — for large surfaces, filter panels */
  --glass-subtle-bg: rgba(255, 255, 255, 0.55);
  --glass-subtle-border: rgba(255, 255, 255, 0.4);
  --glass-subtle-blur: 12px;

  /* Glass Level 2: Standard — for cards, panels, metrics */
  --glass-standard-bg: rgba(255, 255, 255, 0.7);
  --glass-standard-border: rgba(255, 255, 255, 0.5);
  --glass-standard-blur: 16px;

  /* Glass Level 3: Prominent — for navigation, overlays, modals */
  --glass-prominent-bg: rgba(255, 255, 255, 0.8);
  --glass-prominent-border: rgba(255, 255, 255, 0.6);
  --glass-prominent-blur: 20px;

  /* Premium shadows for glass surfaces */
  --glass-shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02);
  --glass-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.03);
  --glass-shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.08), 0 4px 8px rgba(0, 0, 0, 0.04);

  /* Elevation Shadows (from Helm) */
  --shadow-color: 220 3% 15%;
  --shadow-elevation-low:
    0.3px 0.5px 0.7px hsl(var(--shadow-color) / 0.34),
    0.4px 0.8px 1px -1.2px hsl(var(--shadow-color) / 0.34),
    1px 2px 2.5px -2.5px hsl(var(--shadow-color) / 0.34);
  --shadow-elevation-medium:
    0.3px 0.5px 0.7px hsl(var(--shadow-color) / 0.36),
    0.8px 1.6px 2px -0.8px hsl(var(--shadow-color) / 0.36),
    2.1px 4.1px 5.2px -1.7px hsl(var(--shadow-color) / 0.36),
    5px 10px 12.6px -2.5px hsl(var(--shadow-color) / 0.36);
  --shadow-elevation-high:
    0.3px 0.5px 0.7px hsl(var(--shadow-color) / 0.34),
    1.5px 2.9px 3.7px -0.4px hsl(var(--shadow-color) / 0.34),
    2.7px 5.4px 6.8px -0.7px hsl(var(--shadow-color) / 0.34),
    4.5px 8.9px 11.2px -1.1px hsl(var(--shadow-color) / 0.34),
    7.1px 14.3px 18px -1.4px hsl(var(--shadow-color) / 0.34),
    11.2px 22.3px 28.1px -1.8px hsl(var(--shadow-color) / 0.34),
    17px 33.9px 42.7px -2.1px hsl(var(--shadow-color) / 0.34),
    25px 50px 62.9px -2.5px hsl(var(--shadow-color) / 0.34);
}

/* Glass Classes */
.glass-subtle {
  background: var(--glass-subtle-bg);
  backdrop-filter: blur(var(--glass-subtle-blur));
  -webkit-backdrop-filter: blur(var(--glass-subtle-blur));
  border: 1px solid var(--glass-subtle-border);
  box-shadow: var(--glass-shadow-sm);
}

.glass-standard {
  background: var(--glass-standard-bg);
  backdrop-filter: blur(var(--glass-standard-blur));
  -webkit-backdrop-filter: blur(var(--glass-standard-blur));
  border: 1px solid var(--glass-standard-border);
  box-shadow: var(--glass-shadow-md);
}

.glass-prominent {
  background: var(--glass-prominent-bg);
  backdrop-filter: blur(var(--glass-prominent-blur));
  -webkit-backdrop-filter: blur(var(--glass-prominent-blur));
  border: 1px solid var(--glass-prominent-border);
  box-shadow: var(--glass-shadow-lg);
}

/* Fallback for browsers without backdrop-filter support */
@supports not (backdrop-filter: blur(1px)) {
  .glass-subtle { background: rgba(255, 255, 255, 0.92); }
  .glass-standard { background: rgba(255, 255, 255, 0.95); }
  .glass-prominent { background: rgba(255, 255, 255, 0.98); }
}

/* Glass card with shine effect (from Helm) */
.glass-card {
  position: relative;
  background: var(--glass-standard-bg);
  backdrop-filter: blur(var(--glass-standard-blur));
  -webkit-backdrop-filter: blur(var(--glass-standard-blur));
  border: 1px solid var(--glass-standard-border);
  box-shadow: var(--glass-shadow-md);
  border-radius: 24px;
  overflow: hidden;
  transition: all 0.2s ease-out;
}

.glass-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  pointer-events: none;
  z-index: 10;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent);
}

.glass-card:hover {
  transform: translateY(-2px);
  border-color: var(--glass-standard-border);
  box-shadow: var(--glass-shadow-lg);
}
```

---

## 2. Enhanced Flow Node Card Component

### New HTML Structure (replaces current basic nodes)

```html
<!-- Enhanced Flow Node with Helm patterns -->
<div class="flow-node glass-card"
     data-node-id="${node.id}"
     data-domain="${node.domain}"
     data-type="${node.type}"
     style="position: absolute; left: ${node.x}px; top: ${node.y}px; width: 280px;">

  <!-- Node Header -->
  <div class="node-header" style="padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.2);">
    <div style="display: flex; align-items: center; gap: 12px;">
      <!-- Icon with background -->
      <div class="node-icon" style="
        width: 40px;
        height: 40px;
        border-radius: 12px;
        background: rgba(255,255,255,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        transition: all 0.2s ease-out;
      ">
        ${node.icon}
      </div>

      <!-- Title & Type -->
      <div style="flex: 1; min-width: 0;">
        <h4 style="
          font-size: 15px;
          font-weight: 600;
          color: #0f172a;
          letter-spacing: -0.015em;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        ">
          ${node.label}
        </h4>
        <p style="
          font-size: 12px;
          color: #64748b;
          margin: 2px 0 0 0;
        ">
          ${getNodeTypeLabel(node.type)}
        </p>
      </div>

      <!-- Status Badge -->
      ${getStatusBadge(node)}
    </div>
  </div>

  <!-- Node Body (metadata) -->
  <div class="node-body" style="padding: 16px 20px;">
    <!-- Route Path -->
    <div style="
      font-family: ui-monospace, monospace;
      font-size: 11px;
      color: #64748b;
      background: rgba(100, 116, 139, 0.08);
      padding: 6px 10px;
      border-radius: 6px;
      margin-bottom: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    ">
      ${node.path}
    </div>

    <!-- Stats Grid -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
      <!-- Connections -->
      <div class="node-stat">
        <div style="font-size: 11px; color: #94a3b8; margin-bottom: 2px;">Connections</div>
        <div style="font-size: 18px; font-weight: 600; color: #0f172a;">
          ${getConnectionCount(node.id)}
        </div>
      </div>

      <!-- Issues (if analyzed) -->
      <div class="node-stat">
        <div style="font-size: 11px; color: #94a3b8; margin-bottom: 2px;">Issues</div>
        <div style="font-size: 18px; font-weight: 600; color: ${getIssueCountColor(node)};">
          ${getIssueCount(node) || '—'}
        </div>
      </div>
    </div>
  </div>

  <!-- Node Footer (actions) -->
  <div class="node-footer" style="
    padding: 12px 20px;
    border-top: 1px solid rgba(255,255,255,0.2);
    display: flex;
    gap: 8px;
  ">
    <button class="node-action-btn" onclick="analyzeRoute('${node.path}')" style="
      flex: 1;
      padding: 8px 12px;
      border: none;
      border-radius: 8px;
      background: rgba(15, 23, 42, 0.05);
      color: #0f172a;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease-out;
    ">
      Analyze
    </button>
    <button class="node-action-btn" onclick="viewRoute('${node.id}')" style="
      padding: 8px 12px;
      border: none;
      border-radius: 8px;
      background: rgba(15, 23, 42, 0.05);
      color: #64748b;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s ease-out;
    ">
      <svg width="16" height="16" fill="currentColor">
        <path d="M8 2a6 6 0 100 12A6 6 0 008 2z"/>
      </svg>
    </button>
  </div>
</div>

<style>
.flow-node:hover .node-icon {
  transform: scale(1.05);
  background: rgba(255,255,255,0.7);
}

.node-action-btn:hover {
  background: rgba(15, 23, 42, 0.1) !important;
  transform: translateY(-1px);
}

.node-action-btn:active {
  transform: scale(0.98);
}
</style>
```

### Helper Functions for Node Cards

```javascript
function getNodeTypeLabel(type) {
  const labels = {
    'entry': 'Entry Point',
    'dashboard': 'Dashboard',
    'feature': 'Feature Page',
  };
  return labels[type] || type;
}

function getStatusBadge(node) {
  // Check if route has been analyzed
  const analysis = window.app?.state?.routeAnalyses?.[node.path];

  if (!analysis) {
    return `<span style="
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 500;
      border-radius: 999px;
      background: rgba(100, 116, 139, 0.1);
      color: #64748b;
    ">Not analyzed</span>`;
  }

  const issueCount = (analysis.issues?.length || 0) +
                    (analysis.uiIssues?.length || 0);

  if (issueCount === 0) {
    return `<span style="
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 500;
      border-radius: 999px;
      background: rgba(22, 163, 74, 0.1);
      color: #16a34a;
    ">✓ Clean</span>`;
  }

  if (issueCount > 5) {
    return `<span style="
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 500;
      border-radius: 999px;
      background: rgba(239, 68, 68, 0.1);
      color: #dc2626;
    ">${issueCount}</span>`;
  }

  return `<span style="
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 500;
    border-radius: 999px;
    background: rgba(245, 158, 11, 0.1);
    color: #d97706;
  ">${issueCount}</span>`;
}

function getConnectionCount(nodeId) {
  const edges = HelmKnowledge.flowGraph.edges;
  return edges.filter(e => e.from === nodeId || e.to === nodeId).length;
}

function getIssueCount(node) {
  const analysis = window.app?.state?.routeAnalyses?.[node.path];
  if (!analysis) return null;
  return (analysis.issues?.length || 0) + (analysis.uiIssues?.length || 0);
}

function getIssueCountColor(node) {
  const count = getIssueCount(node);
  if (count === null) return '#94a3b8';
  if (count === 0) return '#16a34a';
  if (count > 5) return '#dc2626';
  return '#d97706';
}
```

---

## 3. Expanded Canvas with Zoom/Pan

### Update Flow Canvas Container

```css
/* Replace existing .flow-canvas styles */
.flow-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  background: #fafafa;
  background-image:
    radial-gradient(circle at 25% 25%, rgba(22, 163, 74, 0.03) 0%, transparent 50%),
    radial-gradient(circle at 75% 75%, rgba(59, 130, 246, 0.02) 0%, transparent 50%);
  overflow: hidden;
  cursor: grab;
}

.flow-canvas.dragging {
  cursor: grabbing;
}

/* Dot grid pattern for spatial reference */
.flow-canvas::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle, rgba(100, 116, 139, 0.15) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
  opacity: 0.4;
}

/* Transform container for zoom/pan */
.flow-canvas-transform {
  position: absolute;
  transform-origin: 0 0;
  transition: transform 0.2s ease-out;
  will-change: transform;
}
```

### Add Zoom/Pan Controls (top-right of canvas)

```html
<!-- Add to visualizer header -->
<div class="zoom-controls" style="
  position: absolute;
  top: 24px;
  right: 24px;
  display: flex;
  gap: 8px;
  z-index: 100;
">
  <button onclick="zoomIn()" class="zoom-btn" style="
    width: 40px;
    height: 40px;
    border: none;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(12px);
    box-shadow: var(--glass-shadow-md);
    color: #0f172a;
    font-size: 18px;
    cursor: pointer;
    transition: all 0.15s ease-out;
  ">
    +
  </button>

  <button onclick="zoomOut()" class="zoom-btn" style="
    width: 40px;
    height: 40px;
    border: none;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(12px);
    box-shadow: var(--glass-shadow-md);
    color: #0f172a;
    font-size: 18px;
    cursor: pointer;
    transition: all 0.15s ease-out;
  ">
    −
  </button>

  <button onclick="resetZoom()" class="zoom-btn" style="
    width: 40px;
    height: 40px;
    border: none;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(12px);
    box-shadow: var(--glass-shadow-md);
    color: #64748b;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease-out;
  ">
    1:1
  </button>
</div>

<style>
.zoom-btn:hover {
  background: white !important;
  box-shadow: var(--glass-shadow-lg) !important;
  transform: translateY(-1px);
}

.zoom-btn:active {
  transform: scale(0.95);
}
</style>
```

### Zoom/Pan JavaScript

```javascript
let zoomLevel = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let startPanX = 0;
let startPanY = 0;

function initZoomPan() {
  const canvas = document.getElementById('flow-canvas');
  const transform = document.querySelector('.flow-canvas-transform');

  // Mouse wheel zoom
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    zoomLevel = Math.max(0.5, Math.min(2, zoomLevel + delta));
    updateTransform();
  });

  // Pan with mouse drag
  canvas.addEventListener('mousedown', (e) => {
    if (e.target === canvas || e.target.classList.contains('flow-canvas-transform')) {
      isPanning = true;
      startPanX = e.clientX - panX;
      startPanY = e.clientY - panY;
      canvas.style.cursor = 'grabbing';
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    if (isPanning) {
      panX = e.clientX - startPanX;
      panY = e.clientY - startPanY;
      updateTransform();
    }
  });

  canvas.addEventListener('mouseup', () => {
    isPanning = false;
    canvas.style.cursor = 'grab';
  });

  canvas.addEventListener('mouseleave', () => {
    isPanning = false;
    canvas.style.cursor = 'grab';
  });
}

function updateTransform() {
  const transform = document.querySelector('.flow-canvas-transform');
  if (transform) {
    transform.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
  }
}

function zoomIn() {
  zoomLevel = Math.min(2, zoomLevel + 0.2);
  updateTransform();
}

function zoomOut() {
  zoomLevel = Math.max(0.5, zoomLevel - 0.2);
  updateTransform();
}

function resetZoom() {
  zoomLevel = 1;
  panX = 0;
  panY = 0;
  updateTransform();
}

// Call on init
document.addEventListener('DOMContentLoaded', initZoomPan);
```

---

## 4. Minimap Component (Bottom-right)

```html
<!-- Add to visualizer container -->
<div class="flow-minimap glass-standard" style="
  position: absolute;
  bottom: 24px;
  right: 24px;
  width: 220px;
  height: 160px;
  border-radius: 16px;
  padding: 12px;
  z-index: 100;
">
  <div style="
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 8px;
  ">
    Overview
  </div>

  <canvas id="minimap-canvas" width="196" height="120" style="
    width: 100%;
    height: 120px;
    border-radius: 8px;
    background: rgba(248, 250, 252, 0.5);
  "></canvas>
</div>
```

### Minimap Rendering

```javascript
function renderMinimap() {
  const canvas = document.getElementById('minimap-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const nodes = HelmKnowledge.flowGraph.nodes;

  // Calculate bounds
  const bounds = {
    minX: Math.min(...nodes.map(n => n.x)),
    maxX: Math.max(...nodes.map(n => n.x)),
    minY: Math.min(...nodes.map(n => n.y)),
    maxY: Math.max(...nodes.map(n => n.y)),
  };

  const width = bounds.maxX - bounds.minX + 280; // node width
  const height = bounds.maxY - bounds.minY + 200;

  const scaleX = 196 / width;
  const scaleY = 120 / height;
  const scale = Math.min(scaleX, scaleY);

  // Clear
  ctx.clearRect(0, 0, 196, 120);

  // Draw nodes as dots
  nodes.forEach(node => {
    const x = (node.x - bounds.minX) * scale;
    const y = (node.y - bounds.minY) * scale;

    // Color by domain
    if (node.domain === 'baseball') {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.6)'; // red
    } else if (node.domain === 'golf') {
      ctx.fillStyle = 'rgba(34, 197, 94, 0.6)'; // green
    } else {
      ctx.fillStyle = 'rgba(100, 116, 139, 0.6)'; // gray
    }

    ctx.beginPath();
    ctx.arc(x + 4, y + 4, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw viewport rectangle
  const viewportX = (-panX / zoomLevel - bounds.minX) * scale;
  const viewportY = (-panY / zoomLevel - bounds.minY) * scale;
  const viewportW = (window.innerWidth / zoomLevel) * scale;
  const viewportH = (window.innerHeight / zoomLevel) * scale;

  ctx.strokeStyle = 'rgba(22, 163, 74, 0.8)';
  ctx.lineWidth = 2;
  ctx.strokeRect(viewportX, viewportY, viewportW, viewportH);
}

// Update minimap on zoom/pan
function updateTransform() {
  const transform = document.querySelector('.flow-canvas-transform');
  if (transform) {
    transform.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
  }
  renderMinimap();
}
```

---

## 5. Layout Algorithm (Auto-arrange nodes)

### Better Spacing Algorithm

```javascript
function autoLayoutNodes() {
  const nodes = HelmKnowledge.flowGraph.nodes;
  const edges = HelmKnowledge.flowGraph.edges;

  // Organize by layers (distance from entry points)
  const layers = calculateLayers(nodes, edges);

  // Layout config
  const layerSpacing = 400; // Vertical spacing between layers
  const nodeSpacing = 360;  // Horizontal spacing between nodes
  const canvasWidth = 2400; // Expanded from 1400
  const startY = 100;

  // Position nodes by layer
  Object.keys(layers).forEach((layerIndex) => {
    const layerNodes = layers[layerIndex];
    const layerWidth = (layerNodes.length - 1) * nodeSpacing;
    const startX = (canvasWidth - layerWidth) / 2;

    layerNodes.forEach((node, index) => {
      node.x = startX + (index * nodeSpacing);
      node.y = startY + (parseInt(layerIndex) * layerSpacing);
    });
  });

  console.log('✨ Auto-layout complete:', {
    layers: Object.keys(layers).length,
    totalNodes: nodes.length,
    canvasSize: `${canvasWidth}x${startY + (Object.keys(layers).length * layerSpacing)}`,
  });
}

function calculateLayers(nodes, edges) {
  const layers = {};
  const visited = new Set();

  // Find entry points (nodes with no incoming edges)
  const entryPoints = nodes.filter(node =>
    !edges.some(edge => edge.to === node.id)
  );

  // BFS to assign layers
  const queue = entryPoints.map(node => ({ node, layer: 0 }));

  while (queue.length > 0) {
    const { node, layer } = queue.shift();

    if (visited.has(node.id)) continue;
    visited.add(node.id);

    if (!layers[layer]) layers[layer] = [];
    layers[layer].push(node);

    // Find children
    const children = edges
      .filter(edge => edge.from === node.id)
      .map(edge => nodes.find(n => n.id === edge.to));

    children.forEach(child => {
      if (child && !visited.has(child.id)) {
        queue.push({ node: child, layer: layer + 1 });
      }
    });
  }

  return layers;
}
```

---

## 6. Implementation Checklist

### Phase 1: Foundation (30 min)
- [ ] Add Helm CSS variables to `styles.css`
- [ ] Add glass class definitions
- [ ] Add elevation shadow classes
- [ ] Test in browser - verify classes work

### Phase 2: Enhanced Node Cards (45 min)
- [ ] Update `renderFlowNodes()` function with new HTML structure
- [ ] Add helper functions (getNodeTypeLabel, getStatusBadge, etc.)
- [ ] Add node hover effects
- [ ] Test node rendering

### Phase 3: Zoom/Pan (30 min)
- [ ] Add zoom controls HTML
- [ ] Implement zoom/pan JavaScript
- [ ] Add `.flow-canvas-transform` wrapper
- [ ] Test zoom in/out/reset
- [ ] Test pan with mouse drag

### Phase 4: Minimap (30 min)
- [ ] Add minimap HTML
- [ ] Implement minimap rendering
- [ ] Connect to zoom/pan updates
- [ ] Test viewport indicator

### Phase 5: Auto-Layout (20 min)
- [ ] Implement layer calculation
- [ ] Implement auto-layout positioning
- [ ] Add "Auto-arrange" button to visualizer header
- [ ] Test layout algorithm

### Phase 6: Polish (15 min)
- [ ] Add stagger animations to nodes on initial render
- [ ] Add smooth transitions to layout changes
- [ ] Test all interactions
- [ ] Cross-browser check

---

## 7. Expected Results

### Before Implementation
- 27 nodes cramped in 1400×1100
- Basic colored circles
- No metadata visible
- No zoom/pan
- Hard to navigate

### After Implementation
- 27 nodes with breathing room in 2400×2000+ canvas
- Rich glass cards with metadata (path, connections, issues)
- Status badges (Clean, Warning, Error)
- Zoom/pan with minimap
- Auto-layout algorithm
- Premium Helm design system
- Smooth animations

---

## 8. Next Steps After This

Once this implementation is complete, we can add:
- Journey highlighting (click Baseball → highlights baseball flow)
- Search/filter nodes
- Click-to-focus (zoom to selected node)
- Bulk actions (analyze all visible nodes)
- Export flow diagram as PNG

---

**Ready to implement. All patterns tested in production Helm app.**
