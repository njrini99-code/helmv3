import Script from 'next/script';

const staleDeploymentRecoveryScript = `
(() => {
  if (window.__helmv3StaleDeploymentRecoveryInstalled) return;
  window.__helmv3StaleDeploymentRecoveryInstalled = true;

  const RELOAD_KEY = 'chunk-error-reload';
  const RELOAD_PARAM = '__deployment_refresh';
  // A deploy that lands during a traffic spike leaves the CDN edge briefly cold,
  // so the FIRST reload can hit the same cold window and fail again — leaving the
  // user stuck on a half-loaded page. Allow a few COOLDOWN-spaced retries instead
  // of one-and-stuck, but keep a HARD cap so a genuinely broken bundle can never
  // trigger an infinite reload loop. The cap is encoded in the URL param so it
  // survives the reload even when sessionStorage is unavailable (Safari private
  // mode), which the original one-shot guard did NOT protect against.
  const MAX_RELOADS = 3;
  const RELOAD_COOLDOWN_MS = 12000;
  let reloadScheduled = false;

  function currentReloadCount() {
    try {
      const v = parseInt(new URL(window.location.href).searchParams.get(RELOAD_PARAM) || '0', 10);
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch {
      return 0;
    }
  }

  function isStaleDeploymentError(message) {
    const lower = String(message || '').toLowerCase();
    return (
      lower.includes('loading chunk') ||
      lower.includes('loading css chunk') ||
      lower.includes('chunkloaderror') ||
      (lower.includes('cannot read properties of undefined') && lower.includes("'call'")) ||
      (lower.includes('undefined is not an object') && lower.includes('.call')) ||
      (lower.includes('server action') &&
        (lower.includes('not found on the server') || lower.includes('was not found'))) ||
      lower === 'load failed' ||
      lower.includes('an unexpected response was received from the server') ||
      // ESM dynamic-import wording for the same stale-asset failure — see the
      // matching note in error-logging.ts's isChunkLoadErrorMessage.
      lower.includes('failed to fetch dynamically imported module')
    );
  }

  function extractMessage(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value.message === 'string') return value.message;
    if (typeof value.reason === 'string') return value.reason;
    if (value.reason && typeof value.reason.message === 'string') {
      return value.reason.message;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  async function clearStaleState() {
    const tasks = [];

    if ('caches' in window) {
      tasks.push(
        caches.keys().then((keys) =>
          Promise.allSettled(
            keys
              .filter((key) => key.startsWith('golfhelm-'))
              .map((key) => caches.delete(key))
          )
        )
      );
    }

    if ('serviceWorker' in navigator) {
      tasks.push(
        navigator.serviceWorker.getRegistrations().then((registrations) =>
          Promise.allSettled(
            registrations
              .filter((registration) => {
                const scriptUrl =
                  registration.active?.scriptURL ||
                  registration.waiting?.scriptURL ||
                  registration.installing?.scriptURL ||
                  '';

                return scriptUrl.endsWith('/sw.js');
              })
              .map(async (registration) => {
              try {
                await registration.update();
              } catch {}

              try {
                if (registration.waiting) {
                  registration.waiting.postMessage({ type: 'CLEAR_CACHE' });
                }
              } catch {}

              try {
                await registration.unregister();
              } catch {}
              })
          )
        )
      );
    }

    await Promise.allSettled(tasks);
  }

  async function reloadFresh() {
    // One reload per page load — a cold load throws several chunk errors at once.
    if (reloadScheduled) return;

    const count = currentReloadCount();
    // Hard cap (lives in the URL → survives reload with or without storage): a
    // broken bundle can do at most MAX_RELOADS reloads, then we stop and let the
    // page show whatever it can rather than loop forever.
    if (count >= MAX_RELOADS) return;
    reloadScheduled = true;

    // Space successive retries by a cooldown so the cold edge has time to warm;
    // the first attempt fires immediately. The timestamp is best-effort via
    // sessionStorage — if it's unavailable the retry is simply immediate (still
    // bounded by the URL cap).
    let lastAt = 0;
    try {
      lastAt = parseInt(window.sessionStorage.getItem(RELOAD_KEY) || '0', 10) || 0;
    } catch {}
    const wait = count === 0 ? 0 : Math.max(0, RELOAD_COOLDOWN_MS - (Date.now() - lastAt));
    try {
      window.sessionStorage.setItem(RELOAD_KEY, String(Date.now() + wait));
    } catch {}

    await clearStaleState();

    setTimeout(() => {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set(RELOAD_PARAM, String(count + 1));
        window.location.replace(url.toString());
      } catch {
        window.location.reload();
      }
    }, wait);
  }

  window.addEventListener(
    'error',
    (event) => {
      const message = [
        event.message,
        event.error && event.error.message,
        event.filename,
      ]
        .filter(Boolean)
        .join(' ');

      if (!isStaleDeploymentError(message)) return;

      event.preventDefault();
      void reloadFresh();
    },
    true
  );

  window.addEventListener('unhandledrejection', (event) => {
    const message = extractMessage(event.reason);
    if (!isStaleDeploymentError(message)) return;

    event.preventDefault();
    void reloadFresh();
  });

  // Proactive deployment staleness check.
  // Polls /api/health every 5 minutes while the page is visible.
  // If the server deployment ID changes, shows a non-blocking banner.
  const BOOT_DEPLOYMENT_ID = document.querySelector('meta[name="x-deployment-id"]')?.getAttribute('content');
  if (BOOT_DEPLOYMENT_ID && BOOT_DEPLOYMENT_ID !== 'dev') {
    let staleNotified = false;
    async function checkDeployment() {
      if (staleNotified || document.visibilityState === 'hidden') return;
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (data.deploymentId && data.deploymentId !== BOOT_DEPLOYMENT_ID) {
          staleNotified = true;
          var banner = document.createElement('div');
          banner.id = 'stale-deploy-banner';
          banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#1c1917;color:white;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;font-size:14px;font-family:system-ui;';
          var text = document.createElement('span');
          text.textContent = 'A new version is available.';
          var btn = document.createElement('button');
          btn.textContent = 'Update Now';
          btn.style.cssText = 'background:#16a34a;color:white;border:none;padding:8px 16px;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;';
          btn.onclick = function() { window.location.reload(); };
          banner.appendChild(text);
          banner.appendChild(btn);
          document.body.appendChild(banner);
        }
      } catch {}
    }
    setInterval(checkDeployment, 5 * 60 * 1000);
    setTimeout(checkDeployment, 60 * 1000);
  }
})();
`;

export function StaleDeploymentRecoveryScript() {
  return (
    <Script id="stale-deployment-recovery" strategy="beforeInteractive">
      {staleDeploymentRecoveryScript}
    </Script>
  );
}
