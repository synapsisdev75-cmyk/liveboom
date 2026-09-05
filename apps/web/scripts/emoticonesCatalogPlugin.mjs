import fs from 'node:fs';
import path from 'node:path';
import { catalogEmoticones } from './emoticonesLib.mjs';

const VIRTUAL_ID = 'virtual:liveboom-emoticones';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

export function emoticonesCatalogPlugin() {
  let dir = '';

  function source() {
    const list = catalogEmoticones(dir);
    return `export const EMOTICON_EMOJIS = ${JSON.stringify(list)};\n`;
  }

  return {
    name: 'liveboom-emoticones-catalog',
    configResolved(config) {
      dir = path.join(config.root, 'public', 'emojis', 'emoticones');
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },
    load(id) {
      if (id === RESOLVED_ID) return source();
    },
    configureServer(server) {
      if (!dir) return;
      fs.mkdirSync(dir, { recursive: true });
      server.watcher.add(dir);
      const reload = (file) => {
        if (!file) return;
        const normalized = String(file).replace(/\\/g, '/');
        if (!normalized.includes('/emojis/emoticones')) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', reload);
      server.watcher.on('unlink', reload);
      server.watcher.on('change', reload);
    },
  };
}
