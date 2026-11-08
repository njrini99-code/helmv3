import Script from 'next/script';

import { BOOT_RECOVERY_SOURCE } from '@/lib/recovery/boot-recovery-source';

/**
 * Installs the recovery coordinator before interactive, then polls for a
 * newer deployment.
 *
 * The coordinator's own source lives in `@/lib/recovery/boot-recovery-source`
 * so the tests can execute it rather than pattern-match it, and so the
 * hydrated callers (`ChunkLoadErrorHandler`, `error-logging`,
 * `RouteErrorBoundary`) share one implementation instead of each carrying a
 * classifier and a budget of its own.
 *
 * The poll below only ever offers the user a button. It never navigates on
 * its own, so it is not a recovery path and does not consume the budget.
 */
const deploymentPollScript = `
(() => {
  if (window.__helmDeploymentPollInstalled) return;
  window.__helmDeploymentPollInstalled = true;

  // Proactive deployment staleness check.
  // Polls /api/health every 5 minutes while the page is visible.
  // If the server's release changes, shows a non-blocking banner.
  //
  // Compares against /api/health's release field (git SHA), not the raw
  // Vercel deployment id that field used to be — /api/health stopped
  // returning that id deliberately (see its own header comment: an
  // unauthenticated endpoint should not hand back a Vercel-internal
  // identifier). The !res.ok check below — now also true for a 503
  // "degraded" response, not just a network failure — still just skips this
  // poll cycle, same as before: a degraded backend must never be read as
  // "a new deploy landed".
  const BOOT_RELEASE = document.querySelector('meta[name="x-deployment-id"]')?.getAttribute('content');
  if (BOOT_RELEASE && BOOT_RELEASE !== 'dev') {
    let staleNotified = false;
    async function checkDeployment() {
      if (staleNotified || document.visibilityState === 'hidden') return;
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (data.release && data.release !== BOOT_RELEASE) {
          staleNotified = true;
          var banner = document.createElement('div');
          banner.id = 'stale-deploy-banner';
          banner.setAttribute('role', 'status');
          var host = document.querySelector('.ch-root');
          var text = document.createElement('span');
          text.textContent = 'A new version is available.';
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = 'Update';
          btn.onclick = function() { window.location.reload(); };
          banner.appendChild(text);
          banner.appendChild(btn);
          if (host) {
            banner.className = 'ch-stale';
            btn.className = 'ch-stale__go';
            var close = document.createElement('button');
            close.type = 'button';
            close.className = 'ch-stale__x';
            close.setAttribute('aria-label', 'Not now');
            close.textContent = '\u00d7';
            close.onclick = function() { banner.remove(); };
            banner.appendChild(close);
            host.appendChild(banner);
          } else {
            banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#1c1917;color:white;padding:12px 16px calc(12px + env(safe-area-inset-bottom));display:flex;align-items:center;justify-content:space-between;font-size:0.875rem;font-family:system-ui;';
            btn.style.cssText = 'background:#16a34a;color:white;border:none;min-height:44px;padding:8px 16px;border-radius:8px;font-weight:600;cursor:pointer;font-size:0.875rem;';
            document.body.appendChild(banner);
          }
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
      {BOOT_RECOVERY_SOURCE + deploymentPollScript}
    </Script>
  );
}
