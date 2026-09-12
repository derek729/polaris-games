/* ============================================================
   두마당 — multiplayer & hosting server v2
   node server.cjs   →  http://localhost:8787
   - 정적 파일 호스팅 + 온라인 대전 릴레이 (WebSocket)
   - v2: 서버 측 수 검증(바둑 엔진 탑재), 시간제한(초읽기),
         끊김 복구용 스냅샷 보관, 자리 보존(5분)
   ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

require('./suiji-engine.js');
const { GoGame } = globalThis.SuijiEngine;

const PORT = process.env.PORT || 8787;
const ROOT = __dirname;
const SEAT_HOLD_MS = 5 * 60 * 1000;   // 끊긴 자리 보존 시간
const TICK_MS = 500;

/* ---------------- static file hosting ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

/* ---------------- rooms ---------------- */
const rooms = new Map(); // code -> room
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genCode() {
  let code = '';
  do { code = Array.from({ length: 4 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join(''); }
  while (rooms.has(code));
  return code;
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function broadcastRoom(room, obj) {
  for (const p of room.players) if (p) send(p, obj);
}

function bothPresent(room) { return !!(room.players[0] && room.players[1]); }

function peerOf(ws) {
  const room = rooms.get(ws._room);
  if (!room) return null;
  const idx = ws._color === 1 ? 0 : 1;
  return room.players[idx === 0 ? 1 : 0] || null;
}

function leaveRoom(ws, notify = true) {
  const room = rooms.get(ws._room);
  if (!room) return;
  const idx = ws._color === 1 ? 0 : 1;
  if (room.players[idx] === ws) {
    room.players[idx] = null;
    const peer = room.players[idx === 0 ? 1 : 0];
    if (peer && notify) send(peer, { t: 'peerLeft', rejoinable: true });
    if (!room.players[0] && !room.players[1]) room.expiry = Date.now() + SEAT_HOLD_MS;
  }
  ws._room = null;
}

/* ---------------- server-side game state & validation ---------------- */
function mkClock(tc) { return { main: tc.main, period: tc.byo, inByo: false }; }

function initServerState(room, data) {
  data = data || {};
  if (room.game === 'go') {
    const ruleset = data.ruleset === 'chinese' ? 'chinese' : 'korean';
    const komi = (typeof data.komi === 'number') ? data.komi : (ruleset === 'chinese' ? 7.5 : 6.5);
    const g = new GoGame(data.size || 19, ruleset, komi, data.handicap || 0);
    g.setupHandicap();
    room.server = { kind: 'go', g };
  } else if (room.game === 'omok') {
    room.server = { kind: 'omok', board: Array.from({ length: 15 }, () => Array(15).fill(0)), turn: 1, over: false };
  } else {
    room.server = { kind: 'alkkagi', turn: 1 };
  }
  room.tc = data.tc || null;
  const firstTurn = room.server.kind === 'go' ? room.server.g.currentPlayer : 1;
  room.clock = room.tc ? { turn: firstTurn, running: true, p: { 1: mkClock(room.tc), 2: mkClock(room.tc) } } : null;
}

function omokFive(board, x, y, c) {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (const [dx, dy] of dirs) {
    let cnt = 1;
    for (const s of [1, -1]) {
      let i = 1;
      while (true) {
        const nx = x + dx * i * s, ny = y + dy * i * s;
        if (nx < 0 || nx >= 15 || ny < 0 || ny >= 15 || board[nx][ny] !== c) break;
        cnt++; i++;
      }
    }
    if (cnt >= 5) return true;
  }
  return false;
}

function validateMove(room, ws, data) {
  const st = room.server;
  const color = ws._color;
  if (!st) return { ok: true };   // no server state (e.g. legacy client) → relay only
  if (st.kind === 'go') {
    const g = st.g;
    if (g.gameOver) return { ok: false, msg: '이미 종료된 대국입니다' };
    if (g.scoringMode) return { ok: false, msg: '집계 중에는 수를 둘 수 없습니다' };
    if (g.currentPlayer !== color) return { ok: false, msg: '차례가 아닙니다' };
    if (data.t === 'move') {
      const r = g.place(data.x, data.y);
      if (!r.valid) return { ok: false, msg: '둘 수 없는 수입니다' };
    } else if (data.t === 'pass') {
      g.pass();
    } else if (data.t === 'resign') {
      g.resign();
    } else return { ok: false, msg: '알 수 없는 수' };
    return { ok: true };
  }
  if (st.kind === 'omok') {
    if (st.over) return { ok: false, msg: '이미 종료된 대국입니다' };
    if (st.turn !== color) return { ok: false, msg: '차례가 아닙니다' };
    const x = data.x | 0, y = data.y | 0;
    if (x < 0 || x >= 15 || y < 0 || y >= 15) return { ok: false, msg: '범위 밖' };
    if (st.board[x][y] !== 0) return { ok: false, msg: '이미 놓인 곳입니다' };
    st.board[x][y] = color;
    if (omokFive(st.board, x, y, color)) { st.over = true; data.win = color; }
    else st.turn = 3 - color;
    return { ok: true };
  }
  if (st.kind === 'alkkagi') {
    if (data.k === 'shot') {
      const stoneColor = (data.id | 0) < 5 ? 1 : 2;
      if (stoneColor !== color) return { ok: false, msg: '내 돌이 아닙니다' };
      const sp = Math.hypot(data.vx || 0, data.vy || 0);
      if (!(sp > 0) || sp > 40) return { ok: false, msg: '허용 범위를 벗어난 발사' };
    } else if (data.k === 'result') {
      if (typeof data.next === 'number') st.turn = data.next;
    } else return { ok: false, msg: '알 수 없는 동작' };
    return { ok: true };
  }
  return { ok: true };
}

/* ---------------- clocks (주시 + 초읽기) ---------------- */
function broadcastClock(room) {
  if (!room.clock) return;
  const p1 = room.clock.p[1], p2 = room.clock.p[2];
  broadcastRoom(room, {
    t: 'clock',
    d: {
      turn: room.clock.turn,
      1: { main: Math.ceil(p1.main), byo: p1.inByo, period: Math.max(0, Math.ceil(p1.period)) },
      2: { main: Math.ceil(p2.main), byo: p2.inByo, period: Math.max(0, Math.ceil(p2.period)) }
    }
  });
}

function clockMove(room, color) {
  if (!room.clock || !room.clock.running) return;
  const p = room.clock.p[color];
  if (p.inByo) p.period = room.tc.byo;   // 초읽기 리셋
  room.clock.turn = color === 1 ? 2 : 1;
  broadcastClock(room);
}

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    // 만료된 빈 방 정리
    if (!room.players[0] && !room.players[1] && room.expiry && now > room.expiry) {
      rooms.delete(room.code);
      continue;
    }
    if (!room.clock || !room.clock.running) continue;
    if (!bothPresent(room)) continue;   // 한쪽이 끊기면 시간 정지 (복구 대기)
    const p = room.clock.p[room.clock.turn];
    if (p.main > 0) {
      p.main = Math.max(0, p.main - TICK_MS / 1000);
      if (p.main === 0) { p.inByo = true; p.period = room.tc.byo; }
    } else {
      p.period -= TICK_MS / 1000;
      if (p.period <= 0) {
        room.clock.running = false;
        broadcastRoom(room, { t: 'timeout', color: room.clock.turn });
        broadcastClock(room);
        continue;
      }
    }
    broadcastClock(room);
  }
}, TICK_MS);

/* ---------------- WebSocket relay ---------------- */
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws._room = null;
  ws._color = 0;

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;

    switch (m.t) {
      case 'create': {
        if (ws._room) leaveRoom(ws, false);
        const code = genCode();
        rooms.set(code, {
          code, game: String(m.game || 'omok'),
          players: [ws, null],
          snapshot: null, expiry: 0,
          server: null, tc: null, clock: null
        });
        ws._room = code; ws._color = 1;
        send(ws, { t: 'created', code, color: 1, game: rooms.get(code).game });
        break;
      }
      case 'join': {
        const code = String(m.code || '').toUpperCase().trim();
        const room = rooms.get(code);
        if (!room) { send(ws, { t: 'error', msg: '방 코드를 찾을 수 없습니다' }); break; }
        if (room.players[1]) { send(ws, { t: 'error', msg: '방이 가득 찼습니다' }); break; }
        if (ws._room) leaveRoom(ws, false);
        room.players[1] = ws;
        room.expiry = 0;
        ws._room = code; ws._color = 2;
        send(ws, { t: 'joined', code, color: 2, game: room.game, snapshot: room.snapshot });
        const host = room.players[0];
        if (host) send(host, { t: 'peer', joined: true, code, game: room.game, snapshotExists: !!room.snapshot });
        break;
      }
      case 'init': {
        // host: 대국 설정 + (최초 1회) 서버 측 상태 생성 + 시계 시작
        const room = rooms.get(ws._room);
        if (!room || ws._color !== 1) break;
        if (!room.server) initServerState(room, m.data);
        if (room.clock) room.clock.running = bothPresent(room);
        const peer = peerOf(ws);
        if (peer) send(peer, { t: 'msg', data: { k: 'cfg', ...(m.data || {}) } });
        broadcastClock(room);
        break;
      }
      case 'move': {
        // 서버 검증 후 릴레이
        const room = rooms.get(ws._room);
        if (!room) break;
        const v = validateMove(room, ws, m.data || {});
        if (!v.ok) { send(ws, { t: 'error', msg: v.msg }); break; }
        clockMove(room, ws._color);
        const peer = peerOf(ws);
        if (peer) send(peer, { t: 'msg', data: m.data });
        break;
      }
      case 'sync': {
        // 끊김 복구용 상태 스냅샷 (호스트만 전송)
        const room = rooms.get(ws._room);
        if (room && ws._color === 1 && m.data && typeof m.data === 'object') {
          room.snapshot = m.data;
        }
        break;
      }
      case 'msg': {
        const peer = peerOf(ws);
        if (peer && typeof m.data === 'object') send(peer, { t: 'msg', data: m.data });
        break;
      }
      case 'rematch': {
        const peer = peerOf(ws);
        send(peer, { t: 'rematch' });
        break;
      }
      case 'reset': {
        // 재대국: 서버 상태·시계 초기화 (다음 init에서 재생성)
        const room = rooms.get(ws._room);
        if (room) { room.server = null; room.snapshot = null; room.tc = null; room.clock = null; }
        break;
      }
      case 'leave': {
        leaveRoom(ws);
        send(ws, { t: 'left' });
        break;
      }
    }
  });

  ws.on('close', () => leaveRoom(ws));
  ws.on('error', () => leaveRoom(ws));
});

// heartbeat
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, () => {
  console.log('');
  console.log('  두마당 (DuMadang) — 보드게임 서버 v2');
  console.log('  ▸ 게임 & 온라인 대전:  http://localhost:' + PORT);
  console.log('  ▸ 시간제한 · 수 검증 · 끊김 복구 활성');
  console.log('');
});
