// Face Check-in backend — JSON-file store, open CORS.

const http = require('http');
const fs = require('fs');

const PORT = parseInt(process.env.PORT || '8000', 10);
const DATA_FILE = process.env.DATA_FILE || '/data/db.json';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin1234';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'face-admin-' + ADMIN_PASS; // static, single admin

let db = { users: [], attendance: [], nextUserId: 1, nextAttId: 1 };
try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch {}

function save() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DATA_FILE);
}

// day bucket in Bangkok time (UTC+7)
function dateKeyOf(ts) {
  return new Date(ts + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

if (process.argv[2] === '--selftest') {
  const assert = require('assert');
  assert.equal(dateKeyOf(Date.parse('2024-01-01T18:00:00Z')), '2024-01-02');
  assert.equal(dateKeyOf(Date.parse('2024-01-01T16:59:00Z')), '2024-01-01');
  console.log('selftest ok');
  process.exit(0);
}

function send(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
  });
  res.end(obj === undefined ? '' : JSON.stringify(obj));
}

function body(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 5e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
  });
}

const isAdmin = (req) => (req.headers['x-admin-token'] || '') === ADMIN_TOKEN;

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204);
  const p = (new URL(req.url, 'http://x').pathname).replace(/\/+$/, '') || '/';
  const m = req.method;
  let mm;
  try {
    if (m === 'POST' && p === '/login') {
      const { username, password } = await body(req);
      if (username === ADMIN_USER && password === ADMIN_PASS) return send(res, 200, { token: ADMIN_TOKEN });
      return send(res, 401, { error: 'invalid' });
    }
    if (m === 'GET' && p === '/users') return send(res, 200, db.users);
    if (m === 'POST' && p === '/users') {
      const { name, descriptors, type } = await body(req);
      if (!name || !Array.isArray(descriptors)) return send(res, 400, { error: 'bad' });
      const rec = { id: db.nextUserId++, name: String(name).trim(), type: type || 'นักเรียน/อาจารย์', descriptors, createdAt: Date.now() };
      db.users.push(rec); save();
      return send(res, 200, rec);
    }
    if (m === 'DELETE' && (mm = p.match(/^\/users\/(\d+)$/))) {
      if (!isAdmin(req)) return send(res, 403, { error: 'forbidden' });
      const id = +mm[1];
      db.users = db.users.filter((u) => u.id !== id);
      db.attendance = db.attendance.filter((a) => a.userId !== id);
      save(); return send(res, 200, { ok: true });
    }
    if (m === 'POST' && p === '/checkin') {
      const { userId, name, type, ts = Date.now() } = await body(req);
      const dateKey = dateKeyOf(ts);
      const existing = db.attendance.find((a) => a.userId === userId && a.dateKey === dateKey);
      if (existing) return send(res, 200, { record: existing, isNew: false });
      const rec = { id: db.nextAttId++, userId, name, type: type || '', reason: '', ts, dateKey };
      db.attendance.push(rec); save();
      return send(res, 200, { record: rec, isNew: true });
    }
    if (m === 'GET' && p === '/attendance') {
      if (!isAdmin(req)) return send(res, 403, { error: 'forbidden' });
      return send(res, 200, [...db.attendance].sort((a, b) => b.ts - a.ts));
    }
    if (m === 'PATCH' && (mm = p.match(/^\/attendance\/(\d+)$/))) {
      if (!isAdmin(req)) return send(res, 403, { error: 'forbidden' });
      const rec = db.attendance.find((a) => a.id === +mm[1]);
      if (!rec) return send(res, 404, { error: 'notfound' });
      const { reason } = await body(req);
      rec.reason = (reason || '').trim(); save();
      return send(res, 200, rec);
    }
    if (m === 'POST' && p === '/attendance/clear') {
      if (!isAdmin(req)) return send(res, 403, { error: 'forbidden' });
      db.attendance = []; save();
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'not found' });
  } catch (e) {
    return send(res, 500, { error: String(e) });
  }
});

server.listen(PORT, () => console.log('face-api on :' + PORT));