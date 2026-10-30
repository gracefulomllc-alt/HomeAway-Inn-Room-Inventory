/* End-to-end: the real app in a real browser, the real sync function, several
   "phones" sharing one link. Storage on the server is an in-memory stand-in
   for Netlify Blobs. Run: node tests/e2e/e2e.mjs */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

/* ---- server: public/ + the sync function over an in-memory blob store ---- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-'));
fs.writeFileSync(path.join(tmp, 'blobs.mjs'), `
const data=globalThis.__BLOBS=globalThis.__BLOBS||new Map();
export function getStore(){ return {
  async set(k,v){ data.set(k,String(v)); },
  async setJSON(k,v){ data.set(k,JSON.stringify(v)); },
  async get(k,o){ if(!data.has(k)) return null; const v=data.get(k); return o&&o.type==='json'?JSON.parse(v):v; },
  async delete(k){ data.delete(k); },
  list(o){ const p=(o&&o.prefix)||''; const page={blobs:[...data.keys()].filter(k=>k.startsWith(p)).map(key=>({key}))};
    if(o&&o.paginate) return (async function*(){ yield page; })();
    return Promise.resolve(page); }
};}`);
const fnSrc = fs.readFileSync(path.join(ROOT, 'netlify/functions/sync.mjs'), 'utf8')
  .replace("import('@netlify/blobs')", "import('./blobs.mjs')");
fs.writeFileSync(path.join(tmp, 'sync.mjs'), fnSrc);
const handler = (await import(pathToFileURL(path.join(tmp, 'sync.mjs')).href)).default;
let serverDown = false;
const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/.netlify/functions/sync')) {
    if (serverDown) { res.writeHead(503); return res.end('down'); }
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const r = await handler(new Request('http://x' + req.url, { method: req.method, headers: req.headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body }));
    res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(Buffer.from(await r.arrayBuffer()));
  }
  const f = path.join(ROOT, 'public', req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise(r => server.listen(0, r));
const URL0 = `http://localhost:${server.address().port}/`;

/* ---- tiny test kit ---- */
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } };
const section = s => console.log('\n--- ' + s + ' ---');
const wait = ms => new Promise(r => setTimeout(r, ms));
const PH = i => path.join(HERE, `photo${i % 8}.jpg`);

const browser = await chromium.launch();
const errors = [];
async function phone(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(name + ': ' + e.message));
  page.on('dialog', d => d.accept());
  await page.goto(URL0); await page.waitForFunction(() => typeof loadOK !== 'undefined' && loadOK, null, { timeout: 15000 });
  await wait(800);
  page.ev = (fn, arg) => page.evaluate(fn, arg);
  page.sync = async () => { await page.evaluate(async () => { while (syncState.busy) await new Promise(r => setTimeout(r, 100)); await syncNow(true); }); };
  return page;
}
const roomsOf = p => p.ev(() => state.rooms.map(r => ({ id: r.id, number: String(r.number), photos: r.photos.length, notes: r.notes, jobs: r.work.map(w => w.task) })));
const roomBy = async (p, num) => (await roomsOf(p)).find(r => r.number === num);
async function openRoom(p, num) {
  const id = await p.ev(n => state.rooms.find(r => String(r.number) === n).id, num);
  await p.click(`[data-room="${id}"]`); await wait(300);
  return id;
}
/* Tap "Take photo" exactly as a person would, with the phone dropping its
   storage connection while the camera is up (what iPhone Safari does). */
async function takePhoto(p, file, dropStorage = true) {
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#camBtn')]);
  if (dropStorage) await p.ev(() => { try { db.close(); } catch (e) {} });
  await chooser.setFiles(file);
}
const photoCountOnScreen = p => p.ev(() => document.querySelectorAll('#photoGrid .ph').length);

try {
  /* ============================================================ */
  section('Phone A opens the link for the first time');
  const A = await phone('A');
  const startRooms = (await roomsOf(A)).length;
  ok(startRooms >= 25, `the room list is there (${startRooms} rooms)`);
  await A.sync();
  const manifest = JSON.parse(await (await fetch(URL0 + '.netlify/functions/sync?action=manifest')).text());
  ok(Object.keys(manifest.rooms).length === startRooms, 'and every room reaches the shared copy');

  /* ============================================================ */
  section('Taking photo after photo on an iPhone (storage dropped each time)');
  await openRoom(A, '101');
  for (let i = 0; i < 6; i++) {
    await takePhoto(A, PH(i));
    await A.waitForFunction(n => state.rooms.find(r => String(r.number) === '101').photos.length === n, i + 1, { timeout: 15000 }).catch(() => {});
  }
  ok((await roomBy(A, '101')).photos === 6, 'six photos in a row all saved to room 101');
  await wait(400);
  ok(await photoCountOnScreen(A) === 6, 'all six show in the room');
  const lastToast = await A.ev(() => (document.getElementById('toast') || {}).textContent || '');
  ok(/added/.test(lastToast), `the phone confirms it ("${lastToast.trim()}")`);

  section('Choose several photos at once');
  const [ch2] = await Promise.all([A.waitForEvent('filechooser'), A.click('#libBtn')]);
  await ch2.setFiles([PH(6), PH(7), PH(0)]);
  await A.waitForFunction(() => state.rooms.find(r => String(r.number) === '101').photos.length === 9, null, { timeout: 20000 }).catch(() => {});
  ok((await roomBy(A, '101')).photos === 9, 'three chosen at once — nine total');

  section('Photos survive closing and reopening the app');
  await A.reload(); await A.waitForFunction(() => loadOK, null, { timeout: 15000 }); await wait(600);
  ok((await roomBy(A, '101')).photos === 9, 'still nine after reopening');
  const stored = await A.ev(async () => (await idbAll('photos')).length);
  ok(stored >= 9, `photo files are stored on the phone (${stored})`);

  /* ============================================================ */
  section('Phone B opens the link — gets everything, no restore');
  await A.sync();
  const B = await phone('B');
  await B.sync(); await B.sync();
  ok((await roomsOf(B)).length === (await roomsOf(A)).length, 'same number of rooms as phone A');
  ok((await roomBy(B, '101')).photos === 9, 'room 101 has all nine photos linked');
  const bStored = await B.ev(async () => (await idbAll('photos')).length);
  ok(bStored >= 9, `and the photo files downloaded (${bStored})`);
  await openRoom(B, '101'); await wait(600);
  ok(await photoCountOnScreen(B) === 9, 'all nine visible on phone B');
  await B.click('#backBtn'); await wait(200);

  section('Edits travel both ways on their own');
  await B.ev(() => { const r = state.rooms.find(r => String(r.number) === '102'); r.notes = 'Carpet stain by bed'; r.updated = Date.now(); save(); });
  await B.ev(() => flushSave());
  await B.sync(); await A.sync();
  ok((await roomBy(A, '102')).notes === 'Carpet stain by bed', 'a note typed on B shows on A');

  /* real wait for the background timer — no buttons */
  await A.ev(() => { const r = state.rooms.find(r => String(r.number) === '103'); r.notes = 'AC rattles'; r.updated = Date.now(); save(); });
  await A.ev(() => flushSave());
  await wait(46000);
  ok((await roomBy(B, '103')).notes === 'AC rattles', 'a note typed on A reaches B automatically (background sync)');

  section('Both phones edit the same room at the same time');
  await A.ev(() => { const r = state.rooms.find(r => String(r.number) === '104'); r.notes = 'from A'; r.updated = Date.now(); save(); });
  await B.ev(() => { const r = state.rooms.find(r => String(r.number) === '104'); r.work.push({ id: 'jb1', task: 'Replace blinds', status: 'notdone', priority: 'Normal', assignee: 'Handyman', notes: '' }); r.updated = Date.now(); save(); });
  await A.ev(() => flushSave()); await B.ev(() => flushSave());
  await A.sync(); await B.sync(); await A.sync();
  const a104 = await roomBy(A, '104'), b104 = await roomBy(B, '104');
  ok(a104.notes === 'from A' && a104.jobs.includes('Replace blinds'), 'phone A has both changes');
  ok(b104.notes === 'from A' && b104.jobs.includes('Replace blinds'), 'phone B has both changes');

  section('Photo taken on B while A is busy in the same room');
  await openRoom(B, '105');
  await takePhoto(B, PH(3));
  await B.waitForFunction(() => state.rooms.find(r => String(r.number) === '105').photos.length === 1, null, { timeout: 15000 }).catch(() => {});
  await B.sync(); await A.sync();
  ok((await roomBy(A, '105')).photos === 1, 'it appears on A');
  await B.click('#backBtn'); await wait(200);

  /* ============================================================ */
  section('Handyman list');
  await B.click('#hmBtn'); await wait(300);
  await B.click('[data-hmnew]'); await wait(300);
  const id106 = await B.ev(() => state.rooms.find(r => String(r.number) === '106').id);
  await B.click(`[data-hmpick="${id106}"]`);
  await B.selectOption('#hmFix', { index: 3 });
  await B.fill('#hmNewText', 'Drips at night');
  const [ch3] = await Promise.all([B.waitForEvent('filechooser'), B.click('[data-hmphoto="cam"]')]);
  await B.ev(() => { try { db.close(); } catch (e) {} });
  await ch3.setFiles(PH(5)); await wait(1500);
  await B.click('[data-hmsave]'); await wait(500);
  const job = await B.ev(() => state.rooms.find(r => String(r.number) === '106').work.slice(-1)[0]);
  ok(job && /Drips at night/.test(job.task + ' ' + (job.notes || '')), 'job added from the Handyman button');
  ok(job && job.photoId, 'with its photo, even after storage dropped');
  await B.ev(() => closeSheet && closeSheet());
  await B.sync(); await A.sync();
  const aJob = await A.ev(() => state.rooms.find(r => String(r.number) === '106').work.slice(-1)[0]);
  ok(aJob && aJob.photoId === job.photoId, 'the job and its photo reach phone A');
  const aHas = await A.ev(async id => !!(await idbGet('photos', id)), job.photoId);
  ok(aHas, 'the job photo file downloaded on A');

  /* ============================================================ */
  section('Rename and delete');
  await A.ev(() => { const r = state.rooms.find(r => String(r.number) === '107'); r.number = '107A'; r.updated = Date.now(); save(); });
  await A.ev(() => flushSave()); await A.sync(); await B.sync();
  ok(!!(await roomBy(B, '107A')) && !(await roomBy(B, '107')), 'a renamed room shows the new number on B');
  const delId = await A.ev(() => state.rooms.find(r => String(r.number) === '108').id);
  await A.ev(async id => { await deleteRooms([id]); }, delId);
  await wait(300); await A.sync(); await B.sync(); await A.sync(); await B.sync();
  ok(!(await roomBy(B, '108')), 'a deleted room disappears on B');
  ok(!(await roomBy(A, '108')), 'and does not come back on A');

  /* ============================================================ */
  section('Phone C restores an old backup file');
  const backup = { state: JSON.parse(await A.ev(() => JSON.stringify(state))), photos: [] };
  backup.state.rooms.forEach(r => { r.rev = 999; });           // revs from another history
  const r109 = backup.state.rooms.find(r => String(r.number) === '109');
  r109.notes = 'only in the backup';
  r109.updated = Date.now();
  const bkFile = path.join(tmp, 'backup.json'); fs.writeFileSync(bkFile, JSON.stringify(backup));
  // meanwhile the team keeps working
  await A.ev(() => { const r = state.rooms.find(r => String(r.number) === '110'); r.notes = 'new team note'; r.updated = Date.now(); save(); });
  await A.ev(() => flushSave()); await A.sync();
  const C = await phone('C');
  await C.click('#menuBtn'); await wait(300);
  const [ch4] = await Promise.all([C.waitForEvent('filechooser'), C.click('#impBackup')]);
  await ch4.setFiles(bkFile); await wait(800);
  await C.click('#doRestore'); await wait(2500);
  await C.sync(); await C.sync(); await A.sync(); await B.sync();
  ok((await roomBy(C, '110')).notes === 'new team note', 'C still gets the team’s newer work without pressing anything');
  ok((await roomBy(C, '101')).photos === 9, 'C has room 101’s photos linked');
  const cStored = await C.ev(async () => (await idbAll('photos')).length);
  ok(cStored >= 9, `and downloads the photo files (${cStored})`);
  ok(!(await roomBy(C, '108')), 'the room deleted earlier stays deleted');

  section('Get latest from team');
  await C.click('#menuBtn'); await wait(300);
  ok(await C.$('#getLatest') !== null, 'the button is in the menu');
  await C.click('#getLatest'); await wait(2500);
  ok((await roomsOf(C)).length === (await roomsOf(A)).length, 'C matches A after tapping it');

  /* ============================================================ */
  section('Offline, then back online');
  serverDown = true;
  await A.ev(() => { const r = state.rooms.find(r => String(r.number) === '111'); r.notes = 'typed offline'; r.updated = Date.now(); save(); });
  await A.ev(() => flushSave()); await A.sync();
  serverDown = false;
  await A.sync(); await B.sync();
  ok((await roomBy(B, '111')).notes === 'typed offline', 'work done with no signal arrives once back online');

  /* ============================================================ */
  section('Every phone ends up identical');
  for (const p of [A, B, C]) await p.sync();
  for (const p of [A, B, C]) await p.sync();
  const snap = async p => JSON.stringify((await roomsOf(p)).sort((x, y) => x.id < y.id ? -1 : 1));
  const [sa, sb, sc] = [await snap(A), await snap(B), await snap(C)];
  ok(sa === sb && sb === sc, 'A, B and C hold exactly the same rooms, notes, jobs and photos');

  section('No errors anywhere');
  ok(errors.length === 0, errors.length ? 'page errors: ' + errors.join(' | ') : 'no script errors on any phone');
} catch (e) {
  fail++; console.log('  FAIL  crashed: ' + (e && e.stack || e));
} finally {
  await browser.close(); server.close();
  console.log(`\n${fail ? 'FAILURES: ' + fail : 'ALL PASSED'}  (${pass} passed)`);
  process.exit(fail ? 1 : 0);
}
