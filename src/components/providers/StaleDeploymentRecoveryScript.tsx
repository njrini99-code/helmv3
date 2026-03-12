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
        (lower.includes('not found on the server') || lower.includes('was not found')))
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
})();
`;

export function StaleDeploymentRecoveryScript() {
  return (
    <Script id="stale-deployment-recovery" strategy="beforeInteractive">
      {staleDeploymentRecoveryScript}
    </Script>
  );
}
