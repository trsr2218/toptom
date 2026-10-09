// Local-first storage: projects, media blobs, brand kits and settings live in IndexedDB on the device.
const DB = 'topier', VER = 1;
let dbp;
function open() {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('brands')) db.createObjectStore('brands', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
function tx(store, mode, fn) {
  return open().then((db) => new Promise((res, rej) => {
    const t = db.transaction(store, mode), s = t.objectStore(store);
    const req = fn(s);
    t.oncomplete = () => res(req && req.result);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}
const all = (store) => open().then((db) => new Promise((res, rej) => {
  const req = db.transaction(store, 'readonly').objectStore(store).getAll();
  req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
}));

export const projects = {
  list: async () => (await all('projects')).sort((a, b) => b.updated - a.updated),
  get: (id) => tx('projects', 'readonly', (s) => s.get(id)),
  put: (p) => { p.updated = Date.now(); const { history, ...rest } = p; return tx('projects', 'readwrite', (s) => s.put(rest)); },
  del: (id) => tx('projects', 'readwrite', (s) => s.delete(id)),
};
export const media = {
  list: () => all('media'),
  get: (id) => tx('media', 'readonly', (s) => s.get(id)),
  put: (m) => tx('media', 'readwrite', (s) => s.put(m)),
  del: (id) => tx('media', 'readwrite', (s) => s.delete(id)),
};
export const brands = {
  list: () => all('brands'),
  get: (id) => tx('brands', 'readonly', (s) => s.get(id)),
  put: (b) => tx('brands', 'readwrite', (s) => s.put(b)),
  del: (id) => tx('brands', 'readwrite', (s) => s.delete(id)),
};
export const settings = {
  get: async (key, dflt) => { const r = await tx('settings', 'readonly', (s) => s.get(key)); return r ? r.value : dflt; },
  set: (key, value) => tx('settings', 'readwrite', (s) => s.put({ key, value })),
};

export async function usage() {
  try { const e = await navigator.storage.estimate(); return { used: e.usage || 0, quota: e.quota || 0 }; } catch { return { used: 0, quota: 0 }; }
}
export async function persist() { try { return await navigator.storage.persist(); } catch { return false; } }

// Remove media no project references any more.
export async function sweepMedia() {
  const ps = await projects.list(), ms = await media.list();
  const used = new Set(ps.flatMap((p) => p.tracks.flatMap((t) => t.clips.map((c) => c.mediaId).filter(Boolean))));
  const bs = await brands.list();
  for (const b of bs) if (b.logoId) used.add(b.logoId);
  let n = 0;
  for (const m of ms) if (!used.has(m.id) && Date.now() - (m.created || 0) > 36e5) { await media.del(m.id); n++; }
  return n;
}
