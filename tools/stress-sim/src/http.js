'use strict';

async function request(baseUrl, { method = 'GET', path, token, body, timeoutMs = 30000 } = {}) {
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const ms = performance.now() - t0;
    let json = null;
    const text = await res.text();
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      ok: res.ok,
      status: res.status,
      ms,
      json,
      error: res.ok ? null : (json && (json.error || json.message)) || text.slice(0, 120) || `HTTP_${res.status}`,
    };
  } catch (err) {
    const ms = performance.now() - t0;
    const msg = err?.name === 'AbortError' ? 'timeout' : String(err?.message || err);
    return { ok: false, status: 0, ms, json: null, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ramp virtual users: each VU loops `fn` until deadline.
 * `fn(vuIndex, ctx)` should call stats.record itself or return {status, ms, error}.
 */
async function runLoad({ vus, durationSec, rampSec, fn, label }) {
  const deadline = Date.now() + durationSec * 1000;
  const workers = [];

  for (let i = 0; i < vus; i++) {
    const delay = rampSec > 0 ? (i / Math.max(vus - 1, 1)) * rampSec * 1000 : 0;
    workers.push(
      (async () => {
        if (delay) await new Promise((r) => setTimeout(r, delay));
        while (Date.now() < deadline) {
          await fn(i);
        }
      })(),
    );
  }

  console.log(`[stress] ${label || 'load'} vus=${vus} duration=${durationSec}s ramp=${rampSec}s`);
  await Promise.all(workers);
}

module.exports = { request, runLoad };
