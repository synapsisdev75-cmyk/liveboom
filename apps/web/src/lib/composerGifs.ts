export type ComposerGif = {
  id: string;
  title: string;
  url: string;
  preview: string;
};

/** Catálogo local (animación conservada). La búsqueda también consulta Wikimedia. */
export const COMPOSER_GIF_CATALOG: ComposerGif[] = [
  {
    id: 'party',
    title: 'Fiesta',
    url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
    preview: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/200.gif',
  },
  {
    id: 'clap',
    title: 'Aplausos',
    url: 'https://media.giphy.com/media/l0MYyL8hSRjH6qAMw/giphy.gif',
    preview: 'https://media.giphy.com/media/l0MYyL8hSRjH6qAMw/200.gif',
  },
  {
    id: 'love',
    title: 'Amor',
    url: 'https://media.giphy.com/media/3o7abldj0b9m1n4k1i/giphy.gif',
    preview: 'https://media.giphy.com/media/3o7abldj0b9m1n4k1i/200.gif',
  },
  {
    id: 'wow',
    title: 'Wow',
    url: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif',
    preview: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/200.gif',
  },
  {
    id: 'laugh',
    title: 'Risa',
    url: 'https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif',
    preview: 'https://media.giphy.com/media/10JhviFuU2gWD6/200.gif',
  },
  {
    id: 'fire',
    title: 'Fuego',
    url: 'https://media.giphy.com/media/l41Yh1olOKd1Tgb3O/giphy.gif',
    preview: 'https://media.giphy.com/media/l41Yh1olOKd1Tgb3O/200.gif',
  },
  {
    id: 'dance',
    title: 'Baile',
    url: 'https://media.giphy.com/media/3o7TKMt1VVNkHV2PaE/giphy.gif',
    preview: 'https://media.giphy.com/media/3o7TKMt1VVNkHV2PaE/200.gif',
  },
  {
    id: 'ok',
    title: 'OK',
    url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif',
    preview: 'https://media.giphy.com/media/111ebonMs90YLu/200.gif',
  },
  {
    id: 'cry',
    title: 'Llora',
    url: 'https://media.giphy.com/media/d2lcHJTG5Tscg/giphy.gif',
    preview: 'https://media.giphy.com/media/d2lcHJTG5Tscg/200.gif',
  },
  {
    id: 'boom',
    title: 'Boom',
    url: 'https://media.giphy.com/media/l0MYC0L6xFfPzLzaw/giphy.gif',
    preview: 'https://media.giphy.com/media/l0MYC0L6xFfPzLzaw/200.gif',
  },
  {
    id: 'hearts',
    title: 'Corazones',
    url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif',
    preview: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/200.gif',
  },
  {
    id: 'yes',
    title: 'Sí',
    url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
    preview: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/200.gif',
  },
];

function filterCatalog(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return COMPOSER_GIF_CATALOG;
  return COMPOSER_GIF_CATALOG.filter((item) => item.title.toLowerCase().includes(q) || item.id.includes(q));
}

async function searchWikimedia(query: string): Promise<ComposerGif[]> {
  const q = query.trim() || 'gif';
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${q} gif`,
    gsrnamespace: '6',
    gsrlimit: '18',
    prop: 'imageinfo',
    iiprop: 'url|mime',
    iiurlwidth: '240',
  });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    query?: { pages?: Record<string, { title?: string; imageinfo?: Array<{ url?: string; thumburl?: string; mime?: string }> }> };
  };
  const pages = Object.values(data.query?.pages || {});
  const out: ComposerGif[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    const url = String(info?.url || '');
    const mime = String(info?.mime || '');
    if (!url || (!mime.includes('gif') && !url.toLowerCase().endsWith('.gif'))) continue;
    out.push({
      id: `wm-${encodeURIComponent(page.title || url).slice(0, 48)}`,
      title: String(page.title || 'GIF').replace(/^File:/i, ''),
      url,
      preview: String(info?.thumburl || url),
    });
  }
  return out;
}

export async function searchComposerGifs(query: string): Promise<ComposerGif[]> {
  const local = filterCatalog(query);
  try {
    const remote = await searchWikimedia(query);
    const seen = new Set(local.map((item) => item.url));
    const extra = remote.filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
    return [...local, ...extra].slice(0, 36);
  } catch {
    return local;
  }
}
