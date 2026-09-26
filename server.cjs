/* ============================================================
   두마당 — multiplayer & hosting server v2
   node server.cjs   →  http://localhost:8787
   - 정적 파일 호스팅 + 온라인 대전 릴레이 (WebSocket)
   - v2: 서버 측 수 검증(바둑 엔진 탑재), 시간제한(초읽기),
         끊김 복구용 스냅샷 보관, 자리 보존(5분)
   - v2.1 (Phase 2 사이클 A): 계정·전적·주간 리더보드 HTTP API (/api/*)
         기획서: docs/design/portal-phase2-account-server.md
         WS 대전 프로토콜·정적 서빙은 무수정 — http 핸들러 선두의 /api/* 분기만 추가
   - v2.2: 계정 삭제 API — POST /api/account/delete
         기획서: docs/design/account-delete.md
         switch case 1개 + 헬퍼 2개 추가만 — 기존 엔드포인트·프로토콜 무수정
   ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

/* Node 기동용 최소 브라우저 전역 스텁 — suiji-engine v1.7.0(1485fc8)이 모듈 최상위에서
   new Image()를 요구(브라우저 전용 돌 스킨 로드)하므로, 이 가드가 없으면 node server.cjs
   기동 자체가 ReferenceError로 실패한다(HEAD 기준 선존재 문제 — 서버는 렌더러를 쓰지 않음).
   suiji-engine.js는 사이클 A 수정 금지 파일이므로 본 파일에서 추가 가드만 둔다. */
if (typeof Image === 'undefined') globalThis.Image = class { set src(v) { /* 서버 렌더링 미사용 — no-op */ } };
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

/* ============================================================
   Phase 2 — 계정·전적·주간 리더보드 API (사이클 A)
   기획서: docs/design/portal-phase2-account-server.md
   - 라우팅은 handleApi 1개로 정적 서빙·WS와 완전 분리
   - 무DB: DATA_DIR 하위 JSON (원자적 쓰기: writeFileSync tmp → renameSync)
   ============================================================ */
const DATA_DIR = process.env.DATA_DIR || './data';
/* [게이트1] 정적 서빙 차단용 DATA_DIR 절대 경로 — 기동 cwd 기준·웹루트 기준 둘 다 계산해
   어느 쪽으로 기동했든 DATA_DIR 내부 파일이 정적 서빙되지 않게 한다 (아래 createServer 분기) */
const DATA_DIR_ABS = [path.resolve(DATA_DIR), path.resolve(ROOT, DATA_DIR)];
const AUTH_SALT = process.env.AUTH_SALT || '';
if (!AUTH_SALT) {
  console.error('[치명적] AUTH_SALT 환경변수가 비어 있습니다 — 비밀번호 scrypt 페퍼는 필수입니다.');
  console.error('         발급: openssl rand -hex 32  → Railway Variables에 등록 후 기동하세요. 서버를 종료합니다.');
  process.exit(1);
}
const API_VERSION = '2.1.0';
const API_STARTED_AT = Date.now();
const CORS_ORIGINS = (process.env.CORS_ORIGIN || 'https://derek729.github.io')
  .split(',').map(s => s.trim()).filter(Boolean);
const TOKEN_TTL_DAYS = Math.max(1, parseInt(process.env.TOKEN_TTL_DAYS || '30', 10) || 30);
const TOKEN_TTL_MS = TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
const WEEKLY_TZ_OFFSET_MIN = (parseInt(process.env.WEEKLY_TZ_OFFSET_MIN, 10) || 540);   // KST = UTC+9
const RATE_ACCOUNT_PER_MIN = Math.max(1, parseInt(process.env.RATE_LIMIT_ACCOUNT_PER_MIN || '60', 10) || 60);
const RATE_IP_PER_MIN = Math.max(1, parseInt(process.env.RATE_LIMIT_IP_PER_MIN || '120', 10) || 120);
const GAME_WHITELIST = ['go', 'omok', 'alkkagi', 'kifu', 'beatcraft', 'vampire', 'pvz', 'gostop'];
const MAX_BODY_BYTES = 16 * 1024;   // 413 PAYLOAD_TOO_LARGE 기준 (§4-9)

/* ---------------- 저장 레이어 (§7) ---------------- */
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');
const WEEKLY_DIR = path.join(DATA_DIR, 'weekly');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const BACKUP_WEEKLY_DIR = path.join(BACKUP_DIR, 'weekly');
const BACKUP_KEEP = 4;   // 각 종류 최근 4세대만 보관

let accounts = [];   // [{ id, name, nameLower, passHash, createdAt, expTotal, matchesTotal }]
let tokens = [];     // [{ hash, accountId, createdAt, expiresAt }] — sha256(토큰) 해시만 저장

function atomicWriteJson(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

function readJsonOrDefault(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return def; }
}

function saveAccounts() { atomicWriteJson(ACCOUNTS_FILE, accounts); }
function saveTokens() { atomicWriteJson(TOKENS_FILE, tokens); }

function backupStamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }

function rotateBackups(dir, prefix) {
  let files;
  try { files = fs.readdirSync(dir).filter(f => f.startsWith(prefix + '.') && f.endsWith('.json')).sort(); }
  catch (e) { return; }
  while (files.length > BACKUP_KEEP) {
    try { fs.unlinkSync(path.join(dir, files.shift())); } catch (e) { break; }
  }
}

function backupFile(src, dir, prefix) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, path.join(dir, prefix + '.' + backupStamp() + '.json'));
  rotateBackups(dir, prefix);
}

function cleanExpiredTokens() {
  const now = Date.now();
  const before = tokens.length;
  tokens = tokens.filter(t => t.expiresAt > now);
  return tokens.length !== before;
}

/* KST(UTC+9) 월요일 00:00 기준 주 시작 'YYYY-MM-DD' — 서버 기준 단일 판정 (§5-2) */
function kstWeekStart(now) {
  const ms = (now instanceof Date ? now.getTime() : (typeof now === 'number' ? now : Date.now()))
    + WEEKLY_TZ_OFFSET_MIN * 60000;
  const kst = new Date(ms);
  kst.setUTCDate(kst.getUTCDate() - ((kst.getUTCDay() + 6) % 7));   // 월=0 … 일=6 만큼 되돌림
  const p = n => String(n).padStart(2, '0');
  return kst.getUTCFullYear() + '-' + p(kst.getUTCMonth() + 1) + '-' + p(kst.getUTCDate());
}

/* 주간 롤오버 — 주 전환 후 첫 접근 시 지난 주 사본 1장 + 만료 토큰 일괄 청소 (§5-3) */
let lastKnownWeek = kstWeekStart();
function checkWeeklyRollover() {
  const ws = kstWeekStart();
  if (ws === lastKnownWeek) return;
  const prev = lastKnownWeek;
  lastKnownWeek = ws;
  backupFile(path.join(WEEKLY_DIR, prev + '.json'), BACKUP_WEEKLY_DIR, prev);
  if (cleanExpiredTokens()) saveTokens();
}

/* 기동 초기화 — 디렉터리 준비 · 로드 · 자동 사본(§7-2) · 만료 토큰 청소 */
(function initStorage() {
  for (const d of [DATA_DIR, WEEKLY_DIR, BACKUP_DIR, BACKUP_WEEKLY_DIR]) fs.mkdirSync(d, { recursive: true });
  accounts = readJsonOrDefault(ACCOUNTS_FILE, []);
  if (!Array.isArray(accounts)) accounts = [];
  tokens = readJsonOrDefault(TOKENS_FILE, []);
  if (!Array.isArray(tokens)) tokens = [];
  backupFile(ACCOUNTS_FILE, BACKUP_DIR, 'accounts');
  backupFile(TOKENS_FILE, BACKUP_DIR, 'tokens');
  // 재기동으로 롤오버를 놓친 지난 주 파일 — 백업 없으면 스냅샷 1장
  const cur = kstWeekStart();
  let past;
  try { past = fs.readdirSync(WEEKLY_DIR); } catch (e) { past = []; }
  for (const f of past) {
    if (!f.endsWith('.json')) continue;
    const ws = f.slice(0, -5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ws) || ws >= cur) continue;
    let backed;
    try { backed = fs.readdirSync(BACKUP_WEEKLY_DIR).some(n => n.startsWith(ws + '.')); } catch (e) { backed = false; }
    if (!backed) backupFile(path.join(WEEKLY_DIR, f), BACKUP_WEEKLY_DIR, ws);
  }
  if (cleanExpiredTokens()) saveTokens();
})();

/* ---------------- 인증 (§3) ---------------- */
function sha256Hex(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }

/* scrypt$16384$8$1$<saltHex>$<hashHex> — 파일 내 평문 비번 부재를 QA로 검증 가능한 단일 문자열 (§3-2) */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password + AUTH_SALT, salt, 64);   // N=16384, r=8, p=1 (기본값)
  return 'scrypt$16384$8$1$' + salt.toString('hex') + '$' + hash.toString('hex');
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  try {
    const hash = crypto.scryptSync(password + AUTH_SALT, Buffer.from(parts[4], 'hex'),
      parts[5].length / 2, { N: parseInt(parts[1], 10), r: parseInt(parts[2], 10), p: parseInt(parts[3], 10) });
    return crypto.timingSafeEqual(hash, Buffer.from(parts[5], 'hex'));
  } catch (e) { return false; }
}

/* Phase 1 P.level.info()와 동일 규칙 — expForNext = 100 + 50*(L-1) 누적 차감 (§4-8) */
function levelFromExpTotal(expTotal) {
  let level = 1, exp = expTotal | 0;
  while (exp >= 100 + (level - 1) * 50) { exp -= 100 + (level - 1) * 50; level++; }
  return level;
}

/* 토큰 발급 — 원문은 응답 1회뿐, 저장은 sha256 해시. 계정당 최대 3세션(초과분 최근참 폐기) (§3-3) */
function issueToken(accountId) {
  const now = Date.now();
  const raw = crypto.randomBytes(32).toString('hex');
  tokens.push({ hash: sha256Hex(raw), accountId, createdAt: now, expiresAt: now + TOKEN_TTL_MS });
  const mine = tokens.filter(t => t.accountId === accountId).sort((a, b) => a.createdAt - b.createdAt);
  while (mine.length > 3) {
    const oldest = mine.shift();
    tokens = tokens.filter(t => t.hash !== oldest.hash);
  }
  saveTokens();
  return raw;
}

/* Bearer 헤더 단일 방식 — 부재/불일치 AUTH_REQUIRED, 만료 TOKEN_EXPIRED (§4 공통 규칙) */
function authenticate(req) {
  const m = /^Bearer\s+(\S+)$/.exec(req.headers.authorization || '');
  if (!m || !/^[0-9a-f]{64}$/.test(m[1])) return { error: 'AUTH_REQUIRED' };
  const hash = sha256Hex(m[1]);
  const t = tokens.find(t => t.hash === hash);
  if (!t) return { error: 'AUTH_REQUIRED' };
  if (t.expiresAt <= Date.now()) {
    tokens = tokens.filter(x => x.hash !== hash);
    saveTokens();
    return { error: 'TOKEN_EXPIRED' };
  }
  const account = accounts.find(a => a.id === t.accountId);
  if (!account) return { error: 'AUTH_REQUIRED' };
  return { account, tokenHash: hash };
}

/* ---------------- 레이트 리미트 — in-memory 분 카운터 (§5-5) ---------------- */
const rateCounters = new Map();
/* [게이트2] 레이트리밋용 클라이언트 IP — Railway 프록시 전제: 프록시 뒤에서는 socket.remoteAddress가
   프록시 주소로 수렴해 모든 유저가 같은 IP가 되므로, X-Forwarded-For 첫 항목을 사용자 IP로 사용한다.
   주의: 헤더 위조 시 레이트리밋만 우회 가능(인증 자체는 토큰) — 헤더가 없으면 기존 socket.remoteAddress.
   IP 형식(IPv4/IPv6, 최대 45자) 검증을 통과한 값만 키로 쓴다 — 위조 임의 문자열로 rateCounters
   Map 키가 무한 생성되는 것을 막고, 불일치 시 안전한 socket IP로 폴백한다. */
function clientIp(req) {
  const first = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (/^[0-9a-fA-F.:]{1,45}$/.test(first)) return first;
  return req.socket.remoteAddress || 'unknown';
}
function allowRate(key, maxPerMin) {
  const now = Date.now();
  let c = rateCounters.get(key);
  if (!c || now - c.winStart >= 60000) { c = { winStart: now, count: 0 }; rateCounters.set(key, c); }
  c.count += 1;
  if (rateCounters.size > 4096) {
    for (const [k, v] of rateCounters) if (now - v.winStart >= 60000) rateCounters.delete(k);
  }
  return c.count <= maxPerMin;
}

/* ---------------- 주간 버킷 저장 (§5-2) ---------------- */
const weeklyCache = new Map();   // weekStart -> bucket
function weeklyPath(ws) { return path.join(WEEKLY_DIR, ws + '.json'); }

function loadWeek(ws) {
  if (weeklyCache.has(ws)) return weeklyCache.get(ws);
  const raw = readJsonOrDefault(weeklyPath(ws), null);
  const week = (raw && raw.weekStart === ws && raw.players && typeof raw.players === 'object' && !Array.isArray(raw.players))
    ? raw : { weekStart: ws, players: {} };
  weeklyCache.set(ws, week);
  return week;
}

function saveWeek(ws) {
  const week = weeklyCache.get(ws);
  if (week) atomicWriteJson(weeklyPath(ws), week);
}

/* ---------------- HTTP 공용 헬퍼 ---------------- */
function sendJson(res, status, obj, headers) {
  if (res.headersSent) return;   // 이중 응답 방어
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers || {}));
  res.end(JSON.stringify(obj));
}

function sendErr(res, status, code, extra, headers) {
  sendJson(res, status, Object.assign({ ok: false, code: code }, extra || {}), headers);
}

function fail500(res, e) {
  console.error('[api] internal error:', e);
  try { if (!res.headersSent) sendErr(res, 500, 'INTERNAL'); } catch (e2) { /* 응답 불가 상태 */ }
}

/* POST 본문 읽기 + JSON 파싱 + 비동기 구간 예외 포착 — 파싱 실패 시 이미 400으로 응답하고 null 전달 */
function withBody(req, res, h, handler) {
  readBody(req, (err, raw) => {
    try {
      if (err) return sendErr(res, 413, 'PAYLOAD_TOO_LARGE', {}, h);
      return handler(parseJsonBody(raw, res, h));
    } catch (e) { fail500(res, e); }
  });
}

/* CORS (§8-2) — 등록 Origin만 통과(헤더 부여), 미등록/Origin:null(file://) 403, 무헤더(같은 origin/curl) 통과 */
function resolveCors(req) {
  const origin = req.headers.origin;
  if (origin === undefined) return { ok: true, headers: {} };
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  if (origin === 'null') return { ok: false };
  const host = req.headers.host || '';
  const sameOrigin = host !== '' && (origin === 'https://' + host || origin === 'http://' + host);
  if (!sameOrigin && !CORS_ORIGINS.includes(origin)) return { ok: false };
  headers['Access-Control-Allow-Origin'] = origin;
  return { ok: true, headers };
}

function readBody(req, cb) {
  const chunks = [];
  let size = 0, settled = false;
  req.on('data', c => {
    if (settled) return;
    size += c.length;
    if (size > MAX_BODY_BYTES) { settled = true; return cb({ tooLarge: true }); }
    chunks.push(c);
  });
  req.on('end', () => { if (!settled) { settled = true; cb(null, Buffer.concat(chunks).toString('utf8')); } });
  req.on('error', () => { if (!settled) { settled = true; cb({ stream: true }); } });
}

/* JSON 본문 파싱 — 실패 시 400 BAD_JSON으로 응답하고 undefined 반환 (핸들러는 undefined면 즉시 종료) */
function parseJsonBody(raw, res, headers) {
  if (raw.length === 0) { sendErr(res, 400, 'BAD_JSON', {}, headers); return undefined; }
  try { return JSON.parse(raw); }
  catch (e) { sendErr(res, 400, 'BAD_JSON', {}, headers); return undefined; }
}

function publicAccount(a) {
  return { id: a.id, name: a.name, level: levelFromExpTotal(a.expTotal), expTotal: a.expTotal | 0, matchesTotal: a.matchesTotal | 0 };
}

/* ---------------- API 라우팅 — switch 1개의 순수 함수 (§4) ---------------- */
function handleApi(req, res) {
  try {
    const cors = resolveCors(req);
    if (!cors.ok) return sendErr(res, 403, 'FORBIDDEN_ORIGIN');
    const h = cors.headers;
    if (req.method === 'OPTIONS') { res.writeHead(204, h); res.end(); return; }
    let pathname = '/', query = new URLSearchParams();
    try { const u = new URL(req.url, 'http://localhost'); pathname = u.pathname; query = u.searchParams; } catch (e) {}
    switch (req.method + ' ' + pathname) {
      case 'GET /api/health':
        return apiHealth(res, h);
      case 'POST /api/auth/register':
        return withBody(req, res, h, body => apiRegister(req, res, h, body));
      case 'POST /api/auth/login':
        return withBody(req, res, h, body => apiLogin(req, res, h, body));
      case 'POST /api/auth/logout':
        // 본문 없이 호출 가능해야 한다(§4-5) — 파싱 없이 인증만 수행
        return readBody(req, (err) => {
          try {
            if (err) return sendErr(res, 413, 'PAYLOAD_TOO_LARGE', {}, h);
            const auth = authenticate(req);
            if (auth.error) return sendErr(res, 401, auth.error, {}, h);
            tokens = tokens.filter(t => t.hash !== auth.tokenHash);
            saveTokens();
            return sendJson(res, 200, { ok: true }, h);
          } catch (e) { fail500(res, e); }
        });
      case 'POST /api/account/delete':
        // 계정 삭제 (account-delete.md §1) — 기존 POST /api/matches와 동일 순서:
        // 본문 수신(413)/파싱(BAD_JSON) → handler 선두에서 authenticate(401) → 계정 카운터(429) → 재확인·삭제
        return withBody(req, res, h, body => {
          const auth = authenticate(req);
          if (auth.error) return sendErr(res, 401, auth.error, {}, h);
          return apiAccountDelete(req, res, h, body, auth);
        });
      case 'GET /api/me': {
        const auth = authenticate(req);
        if (auth.error) return sendErr(res, 401, auth.error, {}, h);
        return apiMe(res, h, auth.account);
      }
      case 'POST /api/matches':
        return withBody(req, res, h, body => {
          const auth = authenticate(req);
          if (auth.error) return sendErr(res, 401, auth.error, {}, h);
          return apiMatches(req, res, h, body, auth.account);
        });
      case 'GET /api/leaderboard/weekly':
        return apiLeaderboard(req, res, h, query);
      default:
        return sendErr(res, 404, 'NOT_FOUND', {}, h);
    }
  } catch (e) {
    fail500(res, e);
  }
}

function apiHealth(res, h) {
  sendJson(res, 200, {
    ok: true, service: 'dumadang', version: API_VERSION,
    uptimeSec: Math.floor((Date.now() - API_STARTED_AT) / 1000), accounts: accounts.length
  }, h);
}

/* 2~12자(코드포인트 기준)·제어문자 금지·비번 6~128자 (§3-1) */
function validateAccountFields(body) {
  if (typeof body.name !== 'string') return { field: 'name', reason: '닉네임을 입력하세요' };
  const name = body.name.trim();
  const len = Array.from(name).length;
  if (len < 2 || len > 12) return { field: 'name', reason: '닉네임은 2~12자여야 합니다' };
  if (/[\u0000-\u001f\u007f]/.test(name)) return { field: 'name', reason: '제어문자는 사용할 수 없습니다' };
  if (typeof body.password !== 'string' || body.password.length < 6 || body.password.length > 128) {
    return { field: 'password', reason: '비밀번호는 6~128자여야 합니다' };
  }
  return null;
}

function apiRegister(req, res, h, body) {
  if (body === undefined) return;   // parseJsonBody가 이미 400 BAD_JSON으로 응답
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return sendErr(res, 400, 'BAD_JSON', {}, h);
  const ip = clientIp(req);
  if (!allowRate('ip:' + ip, RATE_IP_PER_MIN)) return sendErr(res, 429, 'RATE_LIMITED', {}, h);
  const bad = validateAccountFields(body);
  if (bad) return sendErr(res, 400, 'FIELD_INVALID', { field: bad.field, reason: bad.reason }, h);
  const name = body.name.trim();
  const nameLower = name.toLowerCase();
  if (accounts.some(a => a.nameLower === nameLower)) {
    return sendErr(res, 409, 'NAME_TAKEN', { field: 'name', reason: '이미 사용 중인 닉네임입니다' }, h);
  }
  let id;
  do { id = 'u_' + crypto.randomBytes(4).toString('hex'); } while (accounts.some(a => a.id === id));
  const account = {
    id, name, nameLower,
    passHash: hashPassword(body.password),
    createdAt: Date.now(), expTotal: 0, matchesTotal: 0
  };
  accounts.push(account);
  saveAccounts();
  const token = issueToken(account.id);
  sendJson(res, 201, { ok: true, token, expiresInDays: TOKEN_TTL_DAYS, account: publicAccount(account) }, h);
}

/* 로그인 실패는 닉네임 부재·비번 불일치 모두 같은 코드 AUTH_FAILED — 계정 존재 여부 탐지 방지 (§4-4) */
function apiLogin(req, res, h, body) {
  if (body === undefined) return;   // parseJsonBody가 이미 400 BAD_JSON으로 응답
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return sendErr(res, 400, 'BAD_JSON', {}, h);
  const ip = clientIp(req);
  if (!allowRate('ip:' + ip, RATE_IP_PER_MIN)) return sendErr(res, 429, 'RATE_LIMITED', {}, h);
  const account = (typeof body.name === 'string')
    ? accounts.find(a => a.nameLower === body.name.trim().toLowerCase()) : null;
  const passOk = !!account && typeof body.password === 'string' && verifyPassword(body.password, account.passHash);
  if (!account || !passOk) return sendErr(res, 401, 'AUTH_FAILED', {}, h);
  const token = issueToken(account.id);
  sendJson(res, 200, { ok: true, token, expiresInDays: TOKEN_TTL_DAYS, account: publicAccount(account) }, h);
}

/* 계정 삭제 하드 정리 — WEEKLY_DIR의 모든 주 파일에서 해당 계정 전적 제거 (account-delete.md §1-3·§2).
   loadWeek/saveWeek(weeklyCache) 경유 — 리더보드는 버킷에서 즉시 소실되고 남은 항목으로 재정렬된다 */
function purgeWeeklyEntries(accountId) {
  let files;
  try { files = fs.readdirSync(WEEKLY_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)); }
  catch (e) { return; }   // 버킷 디렉터리 부재·판독 실패 — 제거할 전적이 없는 것과 같다
  for (const f of files) {
    const ws = f.slice(0, -5);
    const week = loadWeek(ws);
    if (week.players[accountId] === undefined) continue;
    delete week.players[accountId];
    saveWeek(ws);
  }
}

/* 계정 삭제 — authenticate 통과 후 호출됨 (본인 확인 = 유효 토큰 + 비밀번호 재확인 2단계, §4).
   하드 삭제: accounts 제거 + 해당 계정 토큰 전부 폐기 + 전 주 파일 전적 제거 → 기존 원자적
   저장 헬퍼(saveAccounts/saveTokens/주간 저장)로 기록. 롤백 가능성은 백업 4세대가 담당 (§1-4) */
function apiAccountDelete(req, res, h, body, auth) {
  const account = auth.account;
  // 레이트리밋 — 계정 카운터 재사용 (§1 에러코드: 429 RATE_LIMITED). 재확인 비번 대입 시도도 같은 카운터로 지연
  if (!allowRate('acct:' + account.id, RATE_ACCOUNT_PER_MIN)) return sendErr(res, 429, 'RATE_LIMITED', {}, h);
  if (body === undefined) return;   // parseJsonBody가 이미 400 BAD_JSON으로 응답
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return sendErr(res, 400, 'BAD_JSON', {}, h);
  if (typeof body.password !== 'string' || body.password.length === 0) {
    return sendErr(res, 400, 'FIELD_INVALID', { field: 'password', reason: '비밀번호를 다시 입력해 주세요' }, h);
  }
  if (!verifyPassword(body.password, account.passHash)) return sendErr(res, 401, 'AUTH_FAILED', {}, h);
  accounts = accounts.filter(a => a.id !== account.id);
  tokens = tokens.filter(t => t.accountId !== account.id);
  saveAccounts();
  saveTokens();
  purgeWeeklyEntries(account.id);
  sendJson(res, 200, { ok: true }, h);
}

function apiMe(res, h, account) {
  checkWeeklyRollover();
  const ws = kstWeekStart();
  const p = loadWeek(ws).players[account.id];
  const weekly = p
    ? { weekStart: ws, plays: p.plays | 0, w: p.w | 0, l: p.l | 0, d: p.d | 0, coinsEarned: p.coinsEarned | 0, coinsSpent: p.coinsSpent | 0, exp: p.exp | 0 }
    : { weekStart: ws, plays: 0, w: 0, l: 0, d: 0, coinsEarned: 0, coinsSpent: 0, exp: 0 };
  sendJson(res, 200, { ok: true, account: publicAccount(account), weekly }, h);
}

/* 전적 업로드 — 토큰 인증·필드 화이트리스트·수치 상한·1요청 1판 (§5) */
function apiMatches(req, res, h, body, account) {
  const ip = clientIp(req);
  if (!allowRate('ip:' + ip, RATE_IP_PER_MIN) || !allowRate('acct:' + account.id, RATE_ACCOUNT_PER_MIN)) {
    return sendErr(res, 429, 'RATE_LIMITED', {}, h);
  }
  checkWeeklyRollover();
  if (body === undefined) return;   // parseJsonBody가 이미 400 BAD_JSON으로 응답
  if (body === null || typeof body !== 'object') return sendErr(res, 400, 'FIELD_INVALID', { field: 'body', reason: 'JSON 객체가 필요합니다' }, h);
  if (Array.isArray(body)) return sendErr(res, 400, 'FIELD_INVALID', { field: 'body', reason: '배치 업로드는 허용되지 않습니다 (1요청 1판)' }, h);
  for (const k of Object.keys(body)) {
    if (k !== 'game' && k !== 'outcome' && k !== 'delta' && k !== 'exp') {
      return sendErr(res, 400, 'FIELD_INVALID', { field: k, reason: '허용되지 않는 필드입니다' }, h);
    }
  }
  if (typeof body.game !== 'string' || !GAME_WHITELIST.includes(body.game)) {
    return sendErr(res, 400, 'FIELD_INVALID', { field: 'game', reason: '지원하지 않는 게임입니다' }, h);
  }
  if (body.outcome !== 'w' && body.outcome !== 'l' && body.outcome !== 'd') {
    return sendErr(res, 400, 'FIELD_INVALID', { field: 'outcome', reason: 'w | l | d 중 하나여야 합니다' }, h);
  }
  if (!Number.isInteger(body.delta) || Math.abs(body.delta) > 1000) {
    return sendErr(res, 400, 'FIELD_INVALID', { field: 'delta', reason: '정수이고 절댓값 1000 이하여야 합니다' }, h);
  }
  if (!Number.isInteger(body.exp) || body.exp < 0 || body.exp > 100) {
    return sendErr(res, 400, 'FIELD_INVALID', { field: 'exp', reason: '0 이상 100 이하 정수여야 합니다' }, h);
  }
  // 서버 수신 시각(KST)으로 주간 버킷 배정 — 클라이언트 타임스탬프는 받지 않는다 (§5-2)
  const ws = kstWeekStart();
  const week = loadWeek(ws);
  let p = week.players[account.id];
  if (!p) p = week.players[account.id] = { name: account.name, plays: 0, w: 0, l: 0, d: 0, coinsEarned: 0, coinsSpent: 0, exp: 0, games: {} };
  p.name = account.name;
  p.plays += 1;
  if (!p.games || typeof p.games !== 'object') p.games = {};
  const g = p.games[body.game] = p.games[body.game] || { plays: 0, w: 0, l: 0, d: 0, coinsEarned: 0, coinsSpent: 0, exp: 0 };
  g.plays += 1;
  p[body.outcome] += 1;
  g[body.outcome] += 1;
  if (body.delta > 0) { p.coinsEarned += body.delta; g.coinsEarned += body.delta; }
  else if (body.delta < 0) { p.coinsSpent -= body.delta; g.coinsSpent -= body.delta; }
  p.exp += body.exp;
  g.exp += body.exp;
  saveWeek(ws);
  account.expTotal += body.exp;
  account.matchesTotal += 1;
  saveAccounts();
  sendJson(res, 201, {
    ok: true,
    weekly: { weekStart: ws, plays: p.plays, w: p.w, l: p.l, d: p.d, coinsEarned: p.coinsEarned, coinsSpent: p.coinsSpent, exp: p.exp },
    matchesTotal: account.matchesTotal
  }, h);
}

/* 주간 리더보드 — exp 내림차순 → wins → coinsEarned → 가입 순 tiebreak, game 필터는 per-game 버킷 (§4-8) */
function apiLeaderboard(req, res, h, query) {
  checkWeeklyRollover();
  let auth = null;
  if (req.headers.authorization !== undefined) {
    auth = authenticate(req);
    if (auth.error) return sendErr(res, 401, auth.error, {}, h);
  }
  const weekParam = query.get('week');
  let ws;
  if (weekParam === null || weekParam === '') {
    ws = kstWeekStart();
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekParam)) return sendErr(res, 400, 'FIELD_INVALID', { field: 'week', reason: 'YYYY-MM-DD 형식이어야 합니다' }, h);
    ws = weekParam;
  }
  const game = query.get('game');
  if (game !== null && game !== '' && !GAME_WHITELIST.includes(game)) {
    return sendErr(res, 400, 'FIELD_INVALID', { field: 'game', reason: '지원하지 않는 게임입니다' }, h);
  }
  let limit = 20;
  if (query.get('limit') !== null) {
    limit = Number(query.get('limit'));
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return sendErr(res, 400, 'FIELD_INVALID', { field: 'limit', reason: '1~100이어야 합니다' }, h);
  }
  if (!fs.existsSync(weeklyPath(ws))) return sendErr(res, 404, 'WEEK_NOT_FOUND', {}, h);
  const week = loadWeek(ws);
  const list = [];
  for (const [accountId, entry] of Object.entries(week.players)) {
    let s;
    if (!game) {
      s = { plays: entry.plays | 0, wins: entry.w | 0, exp: entry.exp | 0, coinsEarned: entry.coinsEarned | 0 };
    } else {
      const gb = entry.games && entry.games[game];
      if (!gb) continue;   // 해당 게임 기록 없음 — 전체 합산에만 포함
      s = { plays: gb.plays | 0, wins: gb.w | 0, exp: gb.exp | 0, coinsEarned: gb.coinsEarned | 0 };
    }
    const acc = accounts.find(a => a.id === accountId);
    list.push(Object.assign({ accountId, name: (entry.name || (acc && acc.name) || '?'), level: levelFromExpTotal(acc ? acc.expTotal : 0), createdAt: acc ? acc.createdAt : 0 }, s));
  }
  list.sort((a, b) => b.exp - a.exp || b.wins - a.wins || b.coinsEarned - a.coinsEarned || a.createdAt - b.createdAt);
  const entries = list.slice(0, limit).map((e, i) => ({
    rank: i + 1, name: e.name, level: e.level, plays: e.plays, wins: e.wins, exp: e.exp, coinsEarned: e.coinsEarned
  }));
  const payload = { ok: true, weekStart: ws, metric: 'exp', entries };
  if (auth) {
    const idx = list.findIndex(e => e.accountId === auth.account.id);
    if (idx >= 0) {
      const e = list[idx];
      payload.me = { rank: idx + 1, name: e.name, plays: e.plays, wins: e.wins, exp: e.exp, coinsEarned: e.coinsEarned };
    }
  }
  sendJson(res, 200, payload, h);
}

const server = http.createServer((req, res) => {
  // Phase 2 API 분기 — 정적 서빙·WS보다 먼저 (/api/* 는 정적 파일 경로와 절대 충돌하지 않는다)
  const rawPath = (req.url || '/').split('?')[0];
  if (rawPath === '/api' || rawPath.startsWith('/api/')) { handleApi(req, res); return; }
  let urlPath;
  try {
    urlPath = decodeURIComponent(rawPath); // malformed %(예: GET /%)에서 URIError — 미포착 시 프로세스 크래시(DoS)
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  if (urlPath.includes('\0')) { res.writeHead(400); res.end(); return; } // %00 NUL 바이트 — fs.readFile에서 동기 throw → 크래시
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  // [게이트1] DATA_DIR 내부 파일은 웹루트 하위에 있어도 절대 정적 서빙하지 않는다 —
  // GET /data/accounts.json 류의 계정·토큰 파일 유출 차단 (DATA_DIR_ABS는 DATA_DIR 정의 옆에서 계산)
  if (DATA_DIR_ABS.some(d => filePath === d || filePath.startsWith(d + path.sep))) { res.writeHead(403); res.end(); return; }
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
