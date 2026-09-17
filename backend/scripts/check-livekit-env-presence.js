/** Prints only OK/MISSING for LiveKit env keys. Never prints values. */
const fs = require('fs');
const path = require('path');

const KEYS = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'];
const files = ['.env', '.env.local', '.env.liveboom-app', '.env.bak-deploy', '.env.functions'];

for (const f of files) {
  const p = path.join(__dirname, '..', f);
  if (!fs.existsSync(p)) {
    console.log(`${f}: FILE_MISSING`);
    continue;
  }
  const text = fs.readFileSync(p, 'utf8');
  const found = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m || !KEYS.includes(m[1])) continue;
    const raw = m[2].trim().replace(/^["']|["']$/g, '');
    found[m[1]] = raw.length > 0;
  }
  console.log(
    `${f}: ` + KEYS.map((k) => `${k}=${found[k] ? 'OK' : 'MISSING'}`).join(' '),
  );
}
