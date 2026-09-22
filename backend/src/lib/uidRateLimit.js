'use strict';

/**
 * Rate limit in-memory por uid (Cloud Functions multi-instancia = best-effort).
 * Suficiente para frenar abusos de mint de tokens / start call.
 */
function createUidRateLimit({ windowMs, max } = { windowMs: 60_000, max: 60 }) {
  /** @type {Map<string, { count: number, start: number }>} */
  const buckets = new Map();

  function ok(uid) {
    const key = String(uid || '').trim() || 'anon';
    const now = Date.now();
    let row = buckets.get(key);
    if (!row || now - row.start > windowMs) {
      row = { count: 0, start: now };
    }
    row.count += 1;
    buckets.set(key, row);
    if (buckets.size > 5000) {
      const first = buckets.keys().next().value;
      if (first) buckets.delete(first);
    }
    return row.count <= max;
  }

  return { ok };
}

module.exports = { createUidRateLimit };
