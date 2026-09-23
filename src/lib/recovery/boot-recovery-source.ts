/**
 * The one recovery decision owner, as boot-safe source.
 *
 * Four mechanisms used to be able to replace the document independently:
 * this inline script, `ChunkLoadErrorHandler`, `error-logging`'s
 * `softReloadForStaleServerAction`, and `RouteErrorBoundary`. They shared a
 * storage key but not a decision, so a single qualifying error could start
 * two recoveries, and a successful hydration reset the budget the other
 * paths were relying on.
 *
 * Everything that can navigate now goes through `window.__helmRecovery`,
 * installed by this string before interactive. Exported as source rather
 * than written inline in the component so the tests can execute the real
 * thing instead of running a regex over it.
 *
 * Three rules this encodes, in the order they are checked:
 *   1. Only a stale-ASSET error is eligible. A generic transport failure
 *      ("Load failed" on a flaky cell connection) is not proof of a stale
 *      deployment and must never replace the document.
 *   2. A document reload requires CONFIRMED-safe work state. Unknown is not
 *      safe. Owners of dirty inputs and of writes with an unknown outcome
 *      register through `registerWork`.
 *   3. An attempt is claimed before any async work, so two handlers racing
 *      the same error cannot both win, and the claim survives hydration.
 */

/** Attempt counter carried in the URL so the budget survives denied storage. */
export const RELOAD_PARAM = '__deployment_refresh';
/** Attempt ledger: `{ count, lastAt }`. Hydration absorbs, never clears. */
export const LEDGER_KEY = 'helm-recovery-ledger';
/** Hard cap on document replacements per session. */
export const MAX_ATTEMPTS = 3;

export const BOOT_RECOVERY_SOURCE = `
(() => {
  if (window.__helmRecovery) return;

  var RELOAD_PARAM = '${RELOAD_PARAM}';
  var LEDGER_KEY = '${LEDGER_KEY}';
  var MAX_ATTEMPTS = ${MAX_ATTEMPTS};
  var COOLDOWN_MS = 12000;

  // Claimed synchronously, before the first await, so two listeners handling
  // the same error cannot both reach the navigation.
  var attemptInFlight = false;
  // Set by the hydrated half. Once true, "nobody registered" stops meaning
  // "nothing can be dirty" and starts meaning "we do not know".
  var providerMounted = false;
  var sawUserInteraction = false;
  var workOwners = Object.create(null);

  // Stale-asset wording only. Deliberately NOT here: a bare 'load failed'
  // and 'an unexpected response was received from the server', which any
  // aborted or timed-out request produces on a bad connection.
  function isAssetRecoveryMessage(message) {
    var lower = String(message == null ? '' : message).toLowerCase();
    return (
      lower.indexOf('loading chunk') !== -1 ||
      lower.indexOf('loading css chunk') !== -1 ||
      lower.indexOf('chunkloaderror') !== -1 ||
      lower.indexOf('failed to fetch dynamically imported module') !== -1 ||
      lower.indexOf('importing a module script failed') !== -1 ||
      (lower.indexOf('cannot read properties of undefined') !== -1 && lower.indexOf("'call'") !== -1) ||
      (lower.indexOf('undefined is not an object') !== -1 && lower.indexOf('.call') !== -1) ||
      // Next.js's own wording for an action id the new build no longer has.
      lower.indexOf('failed to find server action') !== -1 ||
      (lower.indexOf('server action') !== -1 &&
        (lower.indexOf('not found on the server') !== -1 || lower.indexOf('was not found') !== -1))
    );
  }

  function urlCount() {
    try {
      var raw = new URL(window.location.href).searchParams.get(RELOAD_PARAM);
      var v = parseInt(raw || '0', 10);
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch (e) {
      return 0;
    }
  }

  // A malformed or denied ledger reads as zero attempts stored — never as
  // permission to reload, because the URL half of the budget still applies.
  function storedLedger() {
    try {
      var raw = window.sessionStorage.getItem(LEDGER_KEY);
      if (!raw) return { count: 0, lastAt: 0 };
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return { count: 0, lastAt: 0 };
      var c = Number(parsed.count);
      var t = Number(parsed.lastAt);
      return {
        count: Number.isFinite(c) && c > 0 ? c : 0,
        lastAt: Number.isFinite(t) && t > 0 ? t : 0
      };
    } catch (e) {
      return { count: 0, lastAt: 0 };
    }
  }

  function readLedger() {
    var stored = storedLedger();
    var fromUrl = urlCount();
    return { count: Math.max(stored.count, fromUrl), lastAt: stored.lastAt };
  }

  function writeLedger(count, lastAt) {
    try {
      window.sessionStorage.setItem(LEDGER_KEY, JSON.stringify({ count: count, lastAt: lastAt }));
      return true;
    } catch (e) {
      return false;
    }
  }

  function workState() {
    var ids = Object.keys(workOwners);
    for (var i = 0; i < ids.length; i++) {
      if (workOwners[ids[i]] === 'dirty') return 'dirty';
    }
    if (ids.length > 0) return 'clean';
    // Before the app mounts, this document has not shown the user anything
    // to lose: no owner and no interaction is the one provably safe window.
    if (providerMounted) return 'unknown';
    return sawUserInteraction ? 'unknown' : 'clean';
  }

  // Only from the second attempt on. Tearing down caches and the service
  // worker is an escalation, not a first response, and it is scoped to this
  // app's own asset caches — never cookies, IndexedDB or every origin cache.
  function clearStaleAssets() {
    var tasks = [];

    if ('caches' in window) {
      tasks.push(
        caches.keys().then(function (keys) {
          return Promise.allSettled(
            keys
              .filter(function (key) { return key.indexOf('golfhelm-') === 0; })
              .map(function (key) { return caches.delete(key); })
          );
        })
      );
    }

    if ('serviceWorker' in navigator) {
      tasks.push(
        navigator.serviceWorker.getRegistrations().then(function (registrations) {
          return Promise.allSettled(
            registrations
              .filter(function (registration) {
                var scriptUrl =
                  (registration.active && registration.active.scriptURL) ||
                  (registration.waiting && registration.waiting.scriptURL) ||
                  (registration.installing && registration.installing.scriptURL) ||
                  '';
                return scriptUrl.indexOf('/sw.js') === scriptUrl.length - 6;
              })
              .map(function (registration) {
                return registration
                  .update()
                  .catch(function () {})
                  .then(function () {
                    try {
                      if (registration.waiting) {
                        registration.waiting.postMessage({ type: 'CLEAR_CACHE' });
                      }
                    } catch (e) {}
                    return registration.unregister().catch(function () {});
                  });
              })
          );
        })
      );
    }

    return Promise.allSettled(tasks);
  }

  function navigate(nextCount, persisted, wait) {
    window.setTimeout(function () {
      try {
        var url = new URL(window.location.href);
        url.searchParams.set(RELOAD_PARAM, String(nextCount));
        window.location.replace(url.toString());
      } catch (e) {
        // Without the URL marker the budget only exists if storage took it.
        // Reloading anyway would be an unbounded loop, so do not.
        if (persisted) window.location.reload();
      }
    }, wait);
  }

  function requestRecovery(message) {
    if (!isAssetRecoveryMessage(message)) return 'ineligible';
    if (attemptInFlight) return 'in-flight';
    if (workState() !== 'clean') return 'unsafe-work';

    var ledger = readLedger();
    if (ledger.count >= MAX_ATTEMPTS) return 'budget-spent';

    // Claim first. Everything below this line may be asynchronous.
    attemptInFlight = true;
    var nextCount = ledger.count + 1;
    var now = Date.now();
    var persisted = writeLedger(nextCount, now);
    // A deploy landing during a spike leaves the edge briefly cold, so space
    // retries; the first one fires immediately.
    var wait = ledger.count === 0 ? 0 : Math.max(0, COOLDOWN_MS - (now - ledger.lastAt));

    if (nextCount > 1) {
      clearStaleAssets().then(function () { navigate(nextCount, persisted, wait); });
    } else {
      navigate(nextCount, persisted, wait);
    }
    return 'scheduled';
  }

  function noteInteraction() { sawUserInteraction = true; }
  ['pointerdown', 'keydown', 'input', 'change', 'submit'].forEach(function (type) {
    window.addEventListener(type, noteInteraction, true);
  });

  window.addEventListener(
    'error',
    function (event) {
      var message = [event.message, event.error && event.error.message, event.filename]
        .filter(Boolean)
        .join(' ');
      if (!isAssetRecoveryMessage(message)) return;
      event.preventDefault();
      requestRecovery(message);
    },
    true
  );

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    var message = '';
    if (typeof reason === 'string') message = reason;
    else if (reason && typeof reason.message === 'string') message = reason.message;
    if (!isAssetRecoveryMessage(message)) return;
    event.preventDefault();
    requestRecovery(message);
  });

  window.__helmRecovery = {
    version: 1,
    isAssetRecoveryMessage: isAssetRecoveryMessage,
    requestRecovery: requestRecovery,
    workState: workState,
    attempts: function () { return readLedger().count; },
    registerWork: function (id, state) {
      workOwners[id] = state === 'dirty' ? 'dirty' : 'clean';
    },
    releaseWork: function (id) { delete workOwners[id]; },
    markProviderMounted: function () { providerMounted = true; },
    // Hydration tidies the URL marker away, but only once the count is
    // safely in storage. Absorbing is not clearing: the budget is preserved.
    absorbUrlMarker: function () {
      var fromUrl = urlCount();
      if (fromUrl === 0) return true;
      var stored = storedLedger();
      var merged = Math.max(stored.count, fromUrl);
      if (!writeLedger(merged, stored.lastAt || Date.now())) return false;
      try {
        var url = new URL(window.location.href);
        url.searchParams.delete(RELOAD_PARAM);
        window.history.replaceState(window.history.state, document.title, url.toString());
      } catch (e) {}
      return true;
    }
  };
})();
`;
