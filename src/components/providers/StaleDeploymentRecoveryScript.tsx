import Script from 'next/script';

const staleDeploymentRecoveryScript = `
(() => {
  if (window.__helmv3StaleDeploymentRecoveryInstalled) return;
  window.__helmv3StaleDeploymentRecoveryInstalled = true;

  const RELOAD_KEY = 'chunk-error-reload';
  const RELOAD_PARAM = '__deployment_refresh';

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
      lower.includes('an unexpected response was received from the server')
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
    try {
      if (window.sessionStorage.getItem(RELOAD_KEY)) return;
      window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {}

    await clearStaleState();

    try {
      const url = new URL(window.location.href);
      url.searchParams.set(RELOAD_PARAM, String(Date.now()));
      window.location.replace(url.toString());
    } catch {
      window.location.reload();
    }
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
