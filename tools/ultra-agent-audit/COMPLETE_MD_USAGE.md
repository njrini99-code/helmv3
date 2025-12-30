# Complete MD Feature - Usage Guide

## Overview

When you click "Complete" on an MD in the queue, it will:
1. ✅ Remove the MD from the queue
2. ✅ Remove the corresponding issue/enhancement/feature from the route analysis
3. ✅ Broadcast the completion to all connected clients

---

## Frontend Implementation

### WebSocket Message

Send this message to complete an MD:

```javascript
// When user clicks "Complete" button
function completeMD(mdId) {
  ws.send(JSON.stringify({
    action: 'completeMD',
    payload: {
      mdId: mdId  // The MD ID from the queue
    }
  }));
}
```

### Response

You'll receive a response:

```javascript
{
  type: 'md:completed',
  data: {
    success: true,
    md: { /* the removed MD object */ },
    route: '/path/to/route',
    issueId: 'issue-123'
  }
}
```

### Listening for Completions

```javascript
ws.onmessage = (event) => {
  const { type, data } = JSON.parse(event.data);

  if (type === 'md:completed') {
    console.log('✅ MD completed:', data.md.title);
    console.log('📍 Route:', data.route);
    console.log('🔧 Issue ID:', data.issueId);

    // Update UI
    removeFromQueue(data.md.id);
    removeIssueFromRoute(data.route, data.issueId);
  }
};
```

---

## Example Usage

### HTML Button

```html
<div class="md-item">
  <h3>{{ md.title }}</h3>
  <p>{{ md.route }}</p>
  <button onclick="completeMD('{{ md.id }}')">
    ✅ Mark Complete
  </button>
</div>
```

### React Component

```jsx
function MDQueueItem({ md }) {
  const handleComplete = () => {
    // Send completion message
    ws.send(JSON.stringify({
      action: 'completeMD',
      payload: { mdId: md.id }
    }));
  };

  return (
    <div className="md-item">
      <h3>{md.title}</h3>
      <p>{md.route}</p>
      <button onClick={handleComplete}>
        ✅ Mark Complete
      </button>
    </div>
  );
}
```

---

## What Happens Behind the Scenes

### 1. Orchestrator.completeMD()

```javascript
completeMD(mdId) {
  // Get the MD from queue
  const md = this.getMD(mdId);

  // Extract route and issue
  const { route, issue } = md;

  // Remove from queue
  this.removeMD(mdId);

  // Remove issue from route analysis
  const analysis = this.routeAnalyses.get(route);
  analysis.issues = analysis.issues.filter(i => i.id !== issue.id);
  analysis.uiIssues = analysis.uiIssues.filter(i => i.id !== issue.id);
  analysis.features = analysis.features.filter(i => i.id !== issue.id);

  // Emit event
  this.emit('md:completed', { mdId, route, issueId: issue.id });
}
```

### 2. Server Broadcasts

The server broadcasts the completion to all connected clients, so everyone sees the update in real-time.

### 3. Route Analysis Updates

When you re-analyze the route or fetch its summary, the completed issue will no longer appear.

---

## Testing

### 1. Generate an MD

```javascript
// Send an issue to agents
ws.send(JSON.stringify({
  action: 'sendToAgents',
  payload: {
    type: 'issue',
    issue: { id: 'test-1', title: 'Test Issue' },
    route: '/baseball/dashboard/discover',
    code: '...'
  }
}));
```

### 2. Check Queue

```javascript
// Get current status
ws.send(JSON.stringify({
  action: 'getStatus'
}));

// Response will include mdQueue count
```

### 3. Complete the MD

```javascript
ws.send(JSON.stringify({
  action: 'completeMD',
  payload: { mdId: 'md-123456-abc' }
}));
```

### 4. Verify Removal

```javascript
// Get status again - queue count should decrease
ws.send(JSON.stringify({
  action: 'getStatus'
}));

// Re-analyze route - issue should be gone
ws.send(JSON.stringify({
  action: 'analyzeRoute',
  payload: { routePath: '/baseball/dashboard/discover' }
}));
```

---

## Error Handling

### MD Not Found

```javascript
{
  type: 'md:completed',
  data: {
    success: false,
    error: 'MD not found'
  }
}
```

### Failed to Remove

```javascript
{
  type: 'md:completed',
  data: {
    success: false,
    error: 'Failed to remove MD from queue'
  }
}
```

### UI Error Display

```javascript
ws.onmessage = (event) => {
  const { type, data } = JSON.parse(event.data);

  if (type === 'md:completed') {
    if (!data.success) {
      alert('Error: ' + data.error);
    } else {
      // Success - update UI
      updateQueueUI();
    }
  }
};
```

---

## Benefits

1. **Clean Queue**: Only active/pending MDs remain in queue
2. **Accurate Analysis**: Completed issues don't show up on re-analysis
3. **Real-time Updates**: All clients see the completion immediately
4. **Better UX**: Users can track what's done vs what's pending

---

## Notes

- Completion is permanent - MDs are removed, not marked as "done"
- If you need a history, consider adding a separate "completedMDs" array
- The route analysis is updated in memory - refresh page to re-fetch
- Issue removal works for `issues`, `uiIssues`, and `features` arrays

---

**Ready to use!** Just send the `completeMD` action with an MD ID.
