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
 * - Shot data pages: Stale-while-revalidate
 */

const CACHE_VERSION = 'golfhelm-v1772823444796';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Assets to cache immediately on install
const STATIC_ASSETS = [
  '/',
  '/golf/dashboard',
  '/golf/dashboard/rounds',
  '/golf/dashboard/rounds/new',
  '/manifest.json',
  // Add critical CSS/JS bundles as they're identified
];

// API routes to cache for offline access
const CACHEABLE_API_PATTERNS = [
  /\/api\/golf\/rounds/,
  /\/api\/golf\/players/,
  /\/api\/golf\/courses/,
  /\/api\/health/,
];

// Pages that should work offline
const OFFLINE_PAGES = [
  '/golf/dashboard',
  '/golf/dashboard/rounds',
  '/golf/dashboard/rounds/new',
];

// ============================================================================
// INSTALL EVENT
// ============================================================================

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Pre-caching static assets...');
        // Cache what we can, but don't fail if some assets aren't available
        return Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(err => {
              console.warn(`[SW] Failed to cache ${url}:`, err);
            })
          )
        );
      })
      .then(() => {
        console.log('[SW] Service worker installed');
        // Take control immediately
        return self.skipWaiting();
      })
  );
});

// ============================================================================
// ACTIVATE EVENT
// ============================================================================

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    // Clean up old caches
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter(name => name.startsWith('golfhelm-') && name !== STATIC_CACHE && name !== DYNAMIC_CACHE && name !== API_CACHE)
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
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
  } else if (isOfflinePage(url)) {
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
  } catch (error) {
    console.log('[SW] Network failed for API request, checking cache:', request.url);

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
 * Handle page requests - Stale while revalidate
 */
async function handlePageRequest(request) {
  const cache = await caches.open(DYNAMIC_CACHE);

  // Try cache first
  const cachedResponse = await cache.match(request);

  // Fetch in background
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch((error) => {
      console.log('[SW] Network failed for page request:', error);
      return null;
    });

  // Return cached response immediately, or wait for network
  if (cachedResponse) {
    // Update cache in background
    fetchPromise.catch(() => {});
    return cachedResponse;
  }

  // Wait for network if no cache
  const networkResponse = await fetchPromise;
  if (networkResponse) {
    return networkResponse;
  }

  // Return offline page
  return getOfflinePage();
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
  } catch (error) {
    console.log('[SW] Failed to fetch static asset:', request.url);
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
  } catch (error) {
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
  console.log('[SW] Background sync triggered:', event.tag);

  if (event.tag === 'sync-shots' || event.tag === 'sync-rounds') {
    event.waitUntil(performBackgroundSync(event.tag));
  }
});

/**
 * Perform background sync of offline data
 */
async function performBackgroundSync(tag) {
  console.log('[SW] Performing background sync for:', tag);

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
  console.log('[SW] Push notification received');

  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = { title: 'GolfHelm', body: event.data?.text() || 'Notification' };
  }

  const options = {
    body: data.body || 'You have a new notification',
    icon: '/helm-golf-logo.png',
    badge: '/helm-golf-logo.png',
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
  console.log('[SW] Notification clicked');

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
  console.log('[SW] Message received:', event.data);

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
      icon: '/helm-golf-logo.png',
      badge: '/helm-golf-logo.png',
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

function isOfflinePage(url) {
  return OFFLINE_PAGES.some(page => url.pathname.startsWith(page));
}

function isStaticAsset(url) {
  return url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/);
}

function getOfflinePage() {
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

console.log('[SW] Service worker loaded');
