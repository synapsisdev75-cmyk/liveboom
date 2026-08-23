const fs = require('fs');
const path = require('path');

const DATA_DIR =
  process.env.LIVEBOOM_DATA_DIR ||
  (process.env.VERCEL
    ? path.join('/tmp', 'liveboom-data')
    : path.join(__dirname, '../../.data'));

const timers = new Map();

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function load(name, fallback) {
  try {
    ensureDir();
    const file = path.join(DATA_DIR, `${name}.json`);
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`[persist] load ${name}:`, error.message);
    return fallback;
  }
}

function save(name, data) {
  try {
    ensureDir();
    const file = path.join(DATA_DIR, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(data));
  } catch (error) {
    console.warn(`[persist] save ${name}:`, error.message);
  }
}

function saveNow(name, data) {
  const prev = timers.get(name);
  if (prev) clearTimeout(prev);
  timers.delete(name);
  save(name, data);
}

function debouncedSave(name, data, delayMs = 400) {
  const prev = timers.get(name);
  if (prev) clearTimeout(prev);
  timers.set(
    name,
    setTimeout(() => {
      timers.delete(name);
      save(name, data);
    }, delayMs),
  );
}

module.exports = { load, save, saveNow, debouncedSave, DATA_DIR };
