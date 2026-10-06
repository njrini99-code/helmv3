/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS preload (node --require), so it can run before the server loads */
/**
 * Preloaded into the Clubhouse perf server (`node --require`, see perf-measure.mjs): writes one NDJSON line for every request the
 * server answers and every Supabase call it makes, so the harness can say how many reads a page took and how long each one lasted
 * without touching product code. Active only when HELM_PERF_TRACE_FILE is set.
 *
 *   {"k":"req","id":7,"url":"/golf/dashboard/stats","method":"GET","rsc":false,"prefetch":false,"t":<epoch ms>,"ms":412}
 *   {"k":"read","req":7,"t":<epoch ms>,"ms":38,"ttfb":21,"status":200,"method":"GET","path":"rest/v1/golf_rounds","bytes":18211}
 *
 * A read carries the id of the request it ran under (an AsyncLocalStorage context opened around the HTTP server's 'request'
 * event, so everything the render starts is attributed to it, streaming included). Reads with no request (module-level work) have req 0.
 * `ms` runs to the end of the response body; `ttfb` to the response headers. Local runs only: the harness refuses a non-local stack.
 */
const file = process.env.HELM_PERF_TRACE_FILE;
if (file) {
  const fs = require('node:fs');
  const http = require('node:http');
  const { AsyncLocalStorage } = require('node:async_hooks');
  const als = new AsyncLocalStorage();
  const supabase = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const log = (o) => {
    try {
      fs.appendFileSync(file, `${JSON.stringify(o)}\n`);
    } catch {
      /* tracing must never break the server */
    }
  };
  const now = () => performance.timeOrigin + performance.now();
  let seq = 0;

  const emit = http.Server.prototype.emit;
  http.Server.prototype.emit = function patched(ev, req, res) {
    if (ev !== 'request' || !req || !res) return emit.apply(this, arguments);
    const id = ++seq;
    const t = now();
    const url = req.url || '';
    const rsc = req.headers.rsc === '1' || req.headers.rsc === 'true';
    const prefetch = !!req.headers['next-router-prefetch'];
    const method = req.method;
    res.once('close', () => log({ k: 'req', id, url, method, rsc, prefetch, t, ms: Math.round((now() - t) * 10) / 10, status: res.statusCode }));
    return als.run({ id }, () => emit.apply(this, arguments));
  };

  if (supabase && typeof globalThis.fetch === 'function') {
    const base = globalThis.fetch;
    globalThis.fetch = async function traced(input, init) {
      let href;
      try {
        href = typeof input === 'string' ? input : input instanceof URL ? input.href : input && input.url ? input.url : '';
      } catch {
        href = '';
      }
      if (!href.startsWith(supabase)) return base.call(this, input, init);
      const store = als.getStore();
      const t = now();
      const method = (init && init.method) || (input && input.method) || 'GET';
      const path = href.slice(supabase.length + 1).split('?')[0];
      const query = href.includes('?') ? href.slice(href.indexOf('?') + 1, href.indexOf('?') + 200) : '';
      let res;
      try {
        res = await base.call(this, input, init);
      } catch (err) {
        log({ k: 'read', req: store ? store.id : 0, t, ms: Math.round((now() - t) * 10) / 10, status: 0, method, path, error: String(err && err.message) });
        throw err;
      }
      const ttfb = Math.round((now() - t) * 10) / 10;
      const status = res.status;
      let bytes = 0;
      res
        .clone()
        .arrayBuffer()
        .then((b) => {
          bytes = b.byteLength;
        })
        .catch(() => {})
        .finally(() => log({ k: 'read', req: store ? store.id : 0, t, ms: Math.round((now() - t) * 10) / 10, ttfb, status, method, path, query, bytes }));
      return res;
    };
  }
}
