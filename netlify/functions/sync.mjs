let getStore = null;
let blobsLoadError = '';

/* Loaded on first request rather than at module load: a top-level await here
   can break the function bundler, and a function that fails to build is a 404
   with no error message anywhere. */
async function loadBlobs() {
  if (getStore) return true;
  try {
    const mod = await import('@netlify/blobs');
    getStore = mod.getStore;
    return true;
  } catch (e) {
    blobsLoadError = String(e && e.message || e);
    return false;
  }
}

/* Shared survey store.
   Keys:  meta            → property name, room standard, revision
          room:<id>       → one room, with its own revision
          photo:<id>      → { full, thumb, roomId, ts } as data URLs
   Rooms are stored separately so two people on different rooms never collide.
   Writes are compare-and-set on the room's revision: a stale write is
   rejected and the caller re-merges rather than overwriting. */

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type'
    }
  });

export default async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true });

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'ping';
  if (!(await loadBlobs())) {
    return json({ ok: false, where: 'import', error: 'Netlify Blobs unavailable: ' + blobsLoadError }, 500);
  }
  let store;
  try {
    store = getStore({ name: 'room-survey', consistency: 'strong' });
  } catch (e) {
    return json({ ok: false, where: 'getStore', error: String(e && e.message || e) }, 500);
  }

  try {
    if (action === 'ping') {
      const stamp = String(Date.now());
      await store.set('healthcheck', stamp);
      const back = await store.get('healthcheck', { type: 'text' });
      return json({
        ok: back === stamp,
        blobs: back === stamp ? 'working' : 'read-back mismatch',
        time: new Date().toISOString()
      });
    }

    if (action === 'manifest') {
      const rooms = [], photos = [];
      for await (const entry of store.list({ paginate: true })) {
        for (const b of entry.blobs) {
          if (b.key.startsWith('room:')) rooms.push(b.key.slice(5));
          else if (b.key.startsWith('photo:')) photos.push(b.key.slice(6));
        }
      }
      const stamps = {};
      await Promise.all(rooms.map(async id => {
        const r = await store.get('room:' + id, { type: 'json' }).catch(() => null);
        if (r) stamps[id] = { updated: r.updated || 0, rev: r.rev || 0, number: r.number };
      }));
      const meta = await store.get('meta', { type: 'json' }).catch(() => null);
      return json({ ok: true, rooms: stamps, photos, meta: meta || null });
    }

    if (action === 'room' && req.method === 'GET') {
      const id = url.searchParams.get('id');
      const r = await store.get('room:' + id, { type: 'json' }).catch(() => null);
      return r ? json({ ok: true, room: r }) : json({ ok: false, error: 'not found' }, 404);
    }

    if (action === 'room' && req.method === 'POST') {
      const body = await req.json();
      const room = body.room;
      if (!room || !room.id) return json({ ok: false, error: 'no room' }, 400);
      const current = await store.get('room:' + room.id, { type: 'json' }).catch(() => null);
      const curRev = current ? (current.rev || 0) : 0;
      if (current && (body.baseRev || 0) !== curRev) {
        // someone else wrote first — hand back what is there so the caller merges
        return json({ ok: false, conflict: true, room: current }, 409);
      }
      room.rev = curRev + 1;
      await store.setJSON('room:' + room.id, room);
      return json({ ok: true, rev: room.rev });
    }

    if (action === 'room' && req.method === 'DELETE') {
      await store.delete('room:' + url.searchParams.get('id'));
      return json({ ok: true });
    }

    if (action === 'photo' && req.method === 'GET') {
      const p = await store.get('photo:' + url.searchParams.get('id'), { type: 'json' }).catch(() => null);
      return p ? json({ ok: true, photo: p }) : json({ ok: false, error: 'not found' }, 404);
    }

    if (action === 'photo' && req.method === 'POST') {
      const body = await req.json();
      if (!body.id || !body.full) return json({ ok: false, error: 'bad photo' }, 400);
      const existing = await store.get('photo:' + body.id, { type: 'json' }).catch(() => null);
      if (!existing) await store.setJSON('photo:' + body.id, body);   // photos never change
      return json({ ok: true });
    }

    if (action === 'meta' && req.method === 'POST') {
      const body = await req.json();
      const current = await store.get('meta', { type: 'json' }).catch(() => null);
      if (!current || (body.updated || 0) >= (current.updated || 0)) await store.setJSON('meta', body);
      return json({ ok: true });
    }

    return json({ ok: false, error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ ok: false, where: action, error: String(e && e.message || e) }, 500);
  }
};

export const config = { path: '/api/sync' };
