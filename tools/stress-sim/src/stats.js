'use strict';

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function createStats(name) {
  const latencies = [];
  let ok = 0;
  let fail = 0;
  const statusCounts = Object.create(null);
  const errors = Object.create(null);
  const startedAt = Date.now();

  return {
    name,
    record(ms, status, errMsg) {
      latencies.push(ms);
      const code = status || 0;
      statusCounts[code] = (statusCounts[code] || 0) + 1;
      if (status >= 200 && status < 400) ok += 1;
      else {
        fail += 1;
        const key = errMsg || `HTTP_${code}`;
        errors[key] = (errors[key] || 0) + 1;
      }
    },
    snapshot() {
      const sorted = latencies.slice().sort((a, b) => a - b);
      const total = ok + fail;
      const elapsedSec = Math.max(0.001, (Date.now() - startedAt) / 1000);
      return {
        name,
        total,
        ok,
        fail,
        errorRate: total ? fail / total : 0,
        rps: total / elapsedSec,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
        max: sorted.length ? sorted[sorted.length - 1] : 0,
        statusCounts: { ...statusCounts },
        topErrors: Object.entries(errors)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([msg, n]) => ({ msg, n })),
        elapsedSec,
      };
    },
  };
}

function printReport(snap) {
  const pct = (n) => `${(n * 100).toFixed(1)}%`;
  console.log(`\n=== ${snap.name} ===`);
  console.log(
    `requests=${snap.total} ok=${snap.ok} fail=${snap.fail} errorRate=${pct(snap.errorRate)} rps=${snap.rps.toFixed(1)}`,
  );
  console.log(
    `latency_ms p50=${snap.p50.toFixed(0)} p95=${snap.p95.toFixed(0)} p99=${snap.p99.toFixed(0)} max=${snap.max.toFixed(0)}`,
  );
  console.log(`status ${JSON.stringify(snap.statusCounts)}`);
  if (snap.topErrors.length) {
    console.log('errors', snap.topErrors.map((e) => `${e.msg}×${e.n}`).join(' | '));
  }
}

function passCriteria(snap, { maxP95Ms = 800, maxErrorRate = 0.01 } = {}) {
  const pass = snap.errorRate <= maxErrorRate && snap.p95 <= maxP95Ms;
  console.log(
    pass
      ? `PASS criteria (p95<=${maxP95Ms}ms, errors<=${(maxErrorRate * 100).toFixed(1)}%)`
      : `FAIL criteria (p95<=${maxP95Ms}ms, errors<=${(maxErrorRate * 100).toFixed(1)}%)`,
  );
  return pass;
}

module.exports = { createStats, printReport, passCriteria };
