/* eslint-env serviceworker */
/* global caches, fetch, Response */

/**
 * GolfHelm Service Worker
 *
 * Provides offline functionality for the golf shot tracking application:
 * - Caches static assets and API responses
 * - Enables offline access to shot tracking pages
 * - Background sync when connection is restored
 * - Push notifications for sync completion
 *
 * Cache Strategy:
 * - Static assets: Cache-first (versioned)
 * - API responses: Network-first with cache fallback
 * - Dashboard pages: Network-first with cache fallback
 */

const CACHE_VERSION = 'golfhelm-vb9c47339';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Assets to cache immediately on install
const STATIC_ASSETS = [
  '/manifest.json',
  '/offline.html',
];

// API routes to cache for offline access
const CACHEABLE_API_PATTERNS = [
  /\/api\/golf\/rounds/,
  /\/api\/golf\/players/,
  /\/api\/golf\/courses/,
  /\/api\/health/,
];

const GOLF_DASHBOARD_PATH = '/golf/dashboard';

// ============================================================================
// INSTALL EVENT
// ============================================================================

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        // Cache what we can, but don't fail if some assets aren't available
        return Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch((cacheError) => {
              console.warn(`[SW] Failed to cache ${url}:`, cacheError);
            })
          )
        );
      })
      .then(() => {
        // Take control immediately
        return self.skipWaiting();
      })
  );
});

// ============================================================================
// ACTIVATE EVENT
// ============================================================================

self.addEventListener('activate', (event) => {
  event.waitUntil(
    // Clean up old caches
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter(name => name.startsWith('golfhelm-') && name !== STATIC_CACHE && name !== DYNAMIC_CACHE && name !== API_CACHE)
            .map(name => {
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        // Claim all clients immediately
        return self.clients.claim();
      })
  );
});

// ============================================================================
// FETCH EVENT
// ============================================================================

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Handle different types of requests
  if (isApiRequest(url)) {
    event.respondWith(handleApiRequest(event.request));
  } else if (isGolfDashboardPage(event.request, url)) {
    event.respondWith(handlePageRequest(event.request));
  } else if (isStaticAsset(url)) {
    event.respondWith(handleStaticAsset(event.request));
  } else {
    event.respondWith(handleDynamicRequest(event.request));
  }
});

// ============================================================================
// REQUEST HANDLERS
// ============================================================================

/**
 * Handle API requests - Network first, cache fallback
 */
async function handleApiRequest(request) {
  const cache = await caches.open(API_CACHE);

  try {
    const response = await fetch(request);

    // Cache successful responses
    if (response.ok) {
      cache.put(request, response.clone());
    }

    return response;
  } catch {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Return offline response for API
    return new Response(
      JSON.stringify({
        error: 'offline',
        message: 'You are currently offline. Data will sync when connected.',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Handle dashboard page requests - network first, cache fallback.
 *
 * Returning cached HTML before checking the network can strand the app on an
 * older deployment whose route chunks no longer exist. Network-first keeps the
 * dashboard fresh while still preserving offline fallback.
 */
async function handlePageRequest(request) {
  const cache = await caches.open(DYNAMIC_CACHE);

  try {
    const response = await fetch(request);
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('text/html')) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    return getOfflinePage();
  }
}

/**
 * Handle static assets - Cache first
 */
async function handleStaticAsset(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 404 });
  }
}

/**
 * Handle dynamic requests - Network first
 */
async function handleDynamicRequest(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cache = await caches.open(DYNAMIC_CACHE);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // For navigation requests, show offline page
    if (request.mode === 'navigate') {
      return getOfflinePage();
    }

    return new Response('', { status: 503 });
  }
}

// ============================================================================
// BACKGROUND SYNC
// ============================================================================

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-shots' || event.tag === 'sync-rounds') {
    event.waitUntil(performBackgroundSync(event.tag));
  }
});

/**
 * Perform background sync of offline data
 */
async function performBackgroundSync(tag) {
  try {
    // Notify all clients to trigger sync
    const clients = await self.clients.matchAll();

    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_REQUESTED',
        tag,
      });
    });

    return true;
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
    throw error;
  }
}

// ============================================================================
// PUSH NOTIFICATIONS
// ============================================================================

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = { title: 'GolfHelm', body: event.data?.text() || 'Notification' };
  }

  const options = {
    body: data.body || 'You have a new notification',
    icon: '/helm-golf-logo-transparent.png',
    badge: '/helm-golf-logo-transparent.png',
    tag: data.tag || 'golfhelm-notification',
    data: data.data || {},
    actions: data.actions || [],
    requireInteraction: data.requireInteraction || false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'GolfHelm', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/golf/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Check if there's already a window open
        for (const client of windowClients) {
          if (client.url.includes('/golf') && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window if none found
        return self.clients.openWindow(urlToOpen);
      })
  );
});

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

self.addEventListener('message', (event) => {
  switch (event.data?.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CACHE_URLS':
      cacheUrls(event.data.urls);
      break;

    case 'CLEAR_CACHE':
      clearCache(event.data.cacheName);
      break;

    case 'SYNC_COMPLETE':
      notifySyncComplete(event.data);
      break;
  }
});

/**
 * Cache specific URLs
 */
async function cacheUrls(urls) {
  const cache = await caches.open(DYNAMIC_CACHE);
  await Promise.allSettled(
    urls.map(url => cache.add(url).catch(err => console.warn(`[SW] Failed to cache ${url}:`, err)))
  );
}

/**
 * Clear a specific cache
 */
async function clearCache(cacheName) {
  if (cacheName) {
    await caches.delete(cacheName);
  } else {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
  }
}

/**
 * Notify user that sync is complete
 */
async function notifySyncComplete(data) {
  const { syncedCount, failedCount } = data;

  if (syncedCount > 0 || failedCount > 0) {
    let body = '';
    if (syncedCount > 0) {
      body = `Successfully synced ${syncedCount} item${syncedCount !== 1 ? 's' : ''}`;
    }
    if (failedCount > 0) {
      body += body ? `. ${failedCount} failed.` : `${failedCount} item${failedCount !== 1 ? 's' : ''} failed to sync.`;
    }

    await self.registration.showNotification('GolfHelm Sync', {
      body,
      icon: '/helm-golf-logo-transparent.png',
      badge: '/helm-golf-logo-transparent.png',
      tag: 'sync-complete',
    });
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function isApiRequest(url) {
  return url.pathname.startsWith('/api/') ||
    CACHEABLE_API_PATTERNS.some(pattern => pattern.test(url.pathname));
}

function isGolfDashboardPage(request, url) {
  return request.mode === 'navigate' && (url.pathname === GOLF_DASHBOARD_PATH || url.pathname.startsWith(`${GOLF_DASHBOARD_PATH}/`));
}

function isStaticAsset(url) {
  return url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/);
}

async function getOfflinePage() {
  // Try to serve the cached offline.html first
  const cache = await caches.open(STATIC_CACHE);
  const cachedOffline = await cache.match('/offline.html');
  if (cachedOffline) {
    return cachedOffline;
  }

  // Fallback to inline HTML if cache miss
  return new Response(
    `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Offline - GolfHelm</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 20px;
          background: linear-gradient(135deg, #FFFEFA 0%, #F0FDF4 100%);
          color: #1c1917;
        }
        .container {
          text-align: center;
          max-width: 400px;
        }
        .icon {
          width: 80px;
          height: 80px;
          margin-bottom: 24px;
          opacity: 0.6;
        }
        h1 {
          font-size: 24px;
          font-weight: 600;
          margin-bottom: 12px;
        }
        p {
          font-size: 16px;
          color: #78716c;
          margin-bottom: 24px;
          line-height: 1.5;
        }
        button {
          background: #16A34A;
          color: white;
          border: none;
          padding: 12px 24px;
          font-size: 16px;
          font-weight: 500;
          border-radius: 12px;
          cursor: pointer;
          transition: background 0.2s;
        }
        button:hover {
          background: #15803D;
        }
        .note {
          margin-top: 24px;
          font-size: 14px;
          color: #a8a29e;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3" />
        </svg>
        <h1>You're Offline</h1>
        <p>Don't worry! Your shot data is saved locally and will sync automatically when you're back online.</p>
        <button onclick="location.reload()">Try Again</button>
        <p class="note">Continue tracking your round - all data will be saved.</p>
      </div>
    </body>
    </html>`,
    {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    }
  );
}
