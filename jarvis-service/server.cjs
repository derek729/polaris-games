#!/usr/bin/env node
/* JARVIS Service v2 — 웹·앱 서비스 서버 (의존성 0)
   v2 업그레이드(2026-09-30, 업계 조사 반영):
   - 세션 메모리 (Character.AI Chat Memories·Replika 2.0 Memory 탭 방향):
     sessionId별 대화 맥락 최근 16턴 유지 → 멀티턴 기억 응답
   - GET/DELETE /api/memory — 기억 열람·초기화 (Replika Memory 탭 축소판)
   - 요약 스타일 4종 프롬프트 (Particle 방식): 기본/쉽게/5w1h/불릿
   - 포트 8790 · 0.0.0.0 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 8790;
const PUB = path.join(__dirname, 'public');
const OLLAMA = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const MODEL = process.env.JARVIS_MODEL || 'qwen2.5-coder:7b';
const OR_KEY = process.env.OPENROUTER_API_KEY || '';
const OR_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.2-3b-instruct:free';

/* ── 스킬 시스템 (OpenClaw 방식 — skills/*.md 넣으면 능력 확장) ── */
const SKILLS_DIR = path.join(__dirname, 'skills');
const SKILLS = new Map(); /* id → { id, name, description, tag, body } */

function parseSkillFile(raw, file) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (kv) meta[kv[1].trim()] = kv[2].trim();
  }
  if (!meta.name) return null;
  return {
    id: path.basename(file, '.md'),
    name: meta.name,
    description: meta.description || '',
    tag: meta.system || 'chat',
    body: m[2].trim(),
  };
}
function loadSkills() {
  try {
    for (const f of fs.readdirSync(SKILLS_DIR)) {
      if (!f.endsWith('.md')) continue;
      const s = parseSkillFile(fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8'), f);
      if (s) SKILLS.set(s.id, s);
    }
  } catch (e) { /* 폴더 없음 — 기본 프롬프트 폴백 */ }
}
loadSkills();
fs.watch(SKILLS_DIR, () => {
  SKILLS.clear();
  loadSkills(); /* 스킬 파일만 바꿔도 능력이 갱신된다 */
});

const DEFAULT_PROMPTS = {
  chat:
    '너는 자비스(JARVIS) — 주식회사 폴라리스가 만든 AI 비서다. 담백하고 친절한 한국어 존댓말로 답하며, 4문장을 넘기지 않는다. 대화 기록 속 사용자 정보를 기억하고 활용한다.',
  review:
    '너는 시니어 코드 리뷰어다. 코드를 검토해 ①치명적 결함 ②개선점 ③한 줄 총평 순서로 한국어로 간결히 답한다. 코드 전체를 다시 출력하지 않는다.',
};
/* ── 실데이터 브리핑 — data/status-brief.md를 스킬에 주입 ── */
const BRIEF_PATH = path.join(__dirname, 'data', 'status-brief.md');
let briefData = '';
function loadBrief() {
  try {
    briefData = fs.readFileSync(BRIEF_PATH, 'utf8');
  } catch (e) {
    briefData = '';
  }
}
loadBrief();
try {
  fs.watch(path.dirname(BRIEF_PATH), () => loadBrief());
} catch (e) { /* data 폴더 없음 */ }

function systemPromptFor(tag) {
  /* tag: 'chat'|'review'|'news'|'game'|'briefing'|'skill:<id>' */
  let sid_ = tag;
  if (sid_ && sid_.startsWith('skill:')) {
    const s = SKILLS.get(sid_.slice(6));
    if (s) {
      /* 브리핑 스킬엔 실데이터를 붙인다 — 창작이 아니라 실측 보고 */
      const isBrief = s.id === 'polaris-briefing' && briefData;
      return s.body + (isBrief ? '\n\n## 실측 데이터 (이 내용만 근거로 답한다 — 이 밖은 추측 금지)\n' + briefData : '');
    }
    sid_ = 'chat';
  }
  const byTag = [...SKILLS.values()].find(s => s.tag === sid_);
  if (byTag) {
    const isBrief = byTag.id === 'polaris-briefing' && briefData;
    return byTag.body + (isBrief ? '\n\n## 실측 데이터 (이 내용만 근거로 답한다 — 이 밖은 추측 금지)\n' + briefData : '');
  }
  return DEFAULT_PROMPTS[sid_ === 'review' ? 'review' : 'chat'];
}

/* Particle 방식 요약 스타일 — 뉴스 요약 프롬프트 확장 */
const SUM_STYLES = {
  basic: '',
  eli5: ' 아주 쉬운 말(중학생도 이해하는 수준)로 설명하듯 요약한다.',
  '5w1h': ' 누가·무엇을·언제·어디서·왜·어떻게(5W1H) 짚어 요약한다.',
  bullets: ' 핵심을 불릿 3개로만 요약한다. 각 불릿은 "- "로 시작한다.',
};

/* ── 세션 메모리 ───────────────────────── */
/* sessionId → { msgs: [{role, content}], at } — 세션당 최근 16턴, 세션 100개 상한(LRU) */
const SESSIONS = new Map();
const MAX_TURNS = 16;
const MAX_SESSIONS = 100;

function sessionHistory(sid) {
  if (!sid || typeof sid !== 'string' || sid.length > 64) return [];
  const s = SESSIONS.get(sid);
  return s ? s.msgs.slice(-MAX_TURNS) : [];
}
function sessionRemember(sid, user, assistant) {
  if (!sid || typeof sid !== 'string' || sid.length > 64) return;
  let s = SESSIONS.get(sid);
  if (!s) {
    if (SESSIONS.size >= MAX_SESSIONS) {
      const oldest = [...SESSIONS.entries()].sort((a, b) => a[1].at - b[1].at)[0][0];
      SESSIONS.delete(oldest);
    }
    s = { msgs: [], at: Date.now() };
    SESSIONS.set(sid, s);
  }
  s.at = Date.now();
  s.msgs.push({ role: 'user', content: user });
  if (assistant) s.msgs.push({ role: 'assistant', content: assistant });
  if (s.msgs.length > MAX_TURNS) s.msgs = s.msgs.slice(-MAX_TURNS);
}

/* ── 유틸 ─────────────────────────────── */
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > 200_000) { reject(new Error('BODY_TOO_LARGE')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function mimeOf(p) {
  const ext = path.extname(p).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json',
    '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  }[ext] || 'application/octet-stream';
}

/* ── 엔진 ─────────────────────────────── */
async function askOllama(messages, model) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const r = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({ model: model || MODEL, messages, stream: false, options: { num_predict: 400 } }),
    });
    if (!r.ok) throw new Error(`ollama ${r.status}`);
    const d = await r.json();
    const out = d?.message?.content?.trim();
    if (!out) throw new Error('empty');
    return { text: out, engine: model || MODEL };
  } finally {
    clearTimeout(timer);
  }
}
async function askOpenRouter(messages) {
  if (!OR_KEY) throw new Error('no-key');
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OR_KEY}` },
    body: JSON.stringify({ model: OR_MODEL, messages, max_tokens: 400 }),
  });
  if (!r.ok) throw new Error(`openrouter ${r.status}`);
  const d = await r.json();
  const out = d?.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error('empty');
  return { text: out, engine: 'openrouter' };
}
function fallbackReply(user) {
  const t = (user || '').toLowerCase();
  const now = new Date();
  if (/시간|몇 시/.test(t)) return `현재 ${now.getHours()}시 ${String(now.getMinutes()).padStart(2, '0')}분입니다.`;
  if (/안녕|hello|hi\b/.test(t)) return '자비스입니다. 무엇을 도와드릴까요?';
  if (/뉴스/.test(t)) return '뉴스 탭에서 최신 기사를 확인하실 수 있습니다. 기사를 누르면 제가 요약해 드립니다.';
  if (/게임/.test(t)) return '게임 탭에서 가위바위보와 숫자야구가 준비되어 있습니다. 도전해 보시죠!';
  return '로컬 엔진이 잠시 응답하지 않습니다. 곧 복구되니 다시 말씀해 주세요.';
}
async function think(messages, model) {
  try { return await askOllama(messages, model); } catch (e) { /* fall through */ }
  try { return await askOpenRouter(messages); } catch (e) { /* fall through */ }
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  return { text: fallbackReply(lastUser?.content), engine: 'fallback' };
}

/* ── 뉴스 (RSS, 10분 캐시) ─────────────── */
const FEEDS = [
  { name: '연합뉴스', url: 'https://www.yna.co.kr/RSS/news.xml' },
  { name: 'BBC 코리아', url: 'https://feeds.bbci.co.uk/korean/rss.xml' },
  { name: '한겨레 과학', url: 'https://feeds.hani.co.kr/feeds-itscience.xml' },
];
let newsCache = { at: 0, items: [] };
const dec = s => (s || '')
  .replace(/<!\[CDATA\[|\]\]>/g, '')
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .trim();
async function loadNews() {
  if (Date.now() - newsCache.at < 10 * 60_000 && newsCache.items.length) return newsCache.items;
  const results = [];
  await Promise.all(FEEDS.map(async f => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(f.url, { signal: ctrl.signal });
      const xml = await r.text();
      const items = xml.split(/<item[\s>]/).slice(1, 9);
      for (const it of items) {
        const title = dec((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
        const link = dec((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1]);
        if (title) results.push({ source: f.name, title, link });
      }
    } catch (e) { /* 피드 실패는 건너뜀 */ } finally { clearTimeout(timer); }
  }));
  if (results.length) newsCache = { at: Date.now(), items: results.slice(0, 24) };
  return newsCache.items;
}

/* ── 서버 ─────────────────────────────── */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      return res.end();
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      let ollama = false;
      try {
        const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3000) });
        const d = await r.json();
        ollama = Array.isArray(d?.models) && d.models.some(m => (m.name || '').startsWith(MODEL.split(':')[0]));
      } catch (e) { /* 오프라인 */ }
      return sendJson(res, 200, {
        ok: true, ollama, openrouter: !!OR_KEY, model: MODEL,
        engine: ollama ? 'ollama' : OR_KEY ? 'openrouter' : 'fallback',
        sessions: SESSIONS.size,
      });
    }

    /* 사용 가능한 로컬 모델 목록 (모델 스위처용) */
    if (req.method === 'GET' && url.pathname === '/api/models') {
      let models = [];
      try {
        const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3000) });
        const d = await r.json();
        models = (d?.models || []).map(m => ({ name: m.name, sizeGb: +(m.size / 1073741824).toFixed(1) }));
      } catch (e) { /* 오프라인 */ }
      return sendJson(res, 200, { models, default: MODEL });
    }

    /* 보유 스킬 목록 (skills/*.md) */
    if (req.method === 'GET' && url.pathname === '/api/skills') {
      return sendJson(res, 200, {
        skills: [...SKILLS.values()].map(s => ({ id: s.id, name: s.name, description: s.description })),
      });
    }

    /* 기억 열람·초기화 (Replika Memory 탭 축소판) */
    if (url.pathname === '/api/memory') {
      const sid = url.searchParams.get('sid');
      if (req.method === 'GET') {
        if (!sid) return sendJson(res, 400, { error: 'NO_SID' });
        const msgs = sessionHistory(sid);
        return sendJson(res, 200, {
          turns: Math.floor(msgs.length / 2),
          memory: msgs.map(m => ({ role: m.role, content: m.content.slice(0, 160) })),
        });
      }
      if (req.method === 'DELETE') {
        SESSIONS.delete(sid);
        return sendJson(res, 200, { ok: true, cleared: true });
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/chat') {
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch (e) {
        return sendJson(res, 400, { error: 'BAD_JSON' });
      }
      const { system, prompt, sid, style } = body;
      if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 20_000) {
        return sendJson(res, 400, { error: 'FIELD_INVALID' });
      }

      let sysPrompt = systemPromptFor(system);
      if (style && SUM_STYLES[style]) sysPrompt += SUM_STYLES[style];

      /* 멀티턴: 세션 기억 + 이번 발화 */
      const history = system === 'review' ? [] : sessionHistory(sid);
      const messages = [
        { role: 'system', content: sysPrompt },
        ...history,
        { role: 'user', content: prompt },
      ];

      const out = await think(messages, typeof body.model === 'string' ? body.model.slice(0, 80) : '');
      if (system !== 'review' && out.engine !== 'fallback') {
        sessionRemember(sid, prompt, out.text);
      }
      return sendJson(res, 200, { reply: out.text, engine: out.engine });
    }

    if (req.method === 'GET' && url.pathname === '/api/news') {
      const items = await loadNews();
      return sendJson(res, 200, { items });
    }

    /* 정적 서빙 */
    let p = url.pathname === '/' ? '/index.html' : url.pathname;
    p = path.normalize(p).replace(/^(\.\.[/\\])+/, '');
    const file = path.join(PUB, p);
    if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': mimeOf(file), 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  } catch (e) {
    sendJson(res, 500, { error: 'INTERNAL', detail: String(e && e.message || e).slice(0, 120) });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[jarvis-service v3] http://0.0.0.0:${PORT} — 세션 메모리·스킬(${SKILLS.size}종)·브리핑 실데이터 활성`);
});

/* ── 텔레그램 채널 (OpenClaw 방식 — TELEGRAM_BOT_TOKEN 있으면 자동 가동) ──
   BotFather에서 봇 생성 → 토큰을 환경변수로 주면 폰·PC 어디서든 채팅으로 자비스와 대화 */
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
let tgOffset = 0;
async function tgSend(chatId, text) {
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000) }),
  }).catch(() => {});
}
async function tgLoop() {
  console.log('[telegram] 토큰 없음 — 채널 대기 (TELEGRAM_BOT_TOKEN 환경변수로 활성)');
  while (true) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/getUpdates?timeout=25&offset=${tgOffset}`);
      const d = await r.json();
      for (const u of d.result || []) {
        tgOffset = u.update_id + 1;
        const msg = u.message;
        if (!msg?.text) continue;
        const memId = 'tg' + msg.chat.id;
        const messages = [
          { role: 'system', content: systemPromptFor('chat') },
          ...sessionHistory(memId),
          { role: 'user', content: msg.text.slice(0, 2000) },
        ];
        const out = await think(messages);
        if (out.engine !== 'fallback') sessionRemember(memId, msg.text, out.text);
        await tgSend(msg.chat.id, out.text);
      }
    } catch (e) {
      await new Promise(r2 => setTimeout(r2, 5000));
    }
  }
}
if (TG_TOKEN) {
  console.log('[telegram] 채널 가동 — long polling 시작');
  tgLoop();
}
