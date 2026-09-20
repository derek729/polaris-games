/* ============================================================
   폴라리스 게임 포털 — 통합 런타임 (Phase 1)
   Exposes window.Polaris
   - profile : 닉네임 등 플레이어 신원 (localStorage 영속)
   - coins   : 도토리 잔액·지급·지출 (전 게임 공유 화폐)
   - daily   : 일일 보너스 (1일 1회)
   - level   : 경험치·레벨 (게임 1판마다 획득)
   - missions: 오늘의 미션 3종 (날짜 시드 로테이션, 보상 수령)
   - settle  : 판 정산 — 승/무/패 판돈 정산 + 경험치 + 미션 진행
   - shop    : 보드 테마 상점 — 코스메틱 영구 소유 (polaris.shop.v1)
   - weekly  : 주간 성적표 — settle 한 곳에서 집계, 월요일 자동 롤오버 (polaris.weekly.v1)
   - header  : 포털 상단바 렌더 (로비·게임 공용)
   ============================================================ */
(function () {
  'use strict';
  if (typeof window === 'undefined') return; // Node (tests) — browser-only module

  const P = (window.Polaris = {});
  const PROFILE_KEY = 'polaris.profile.v1';
  const WALLET_KEY = 'polaris.wallet.v1';
  const DAILY_KEY = 'polaris.daily.v1';
  const DAILY_AMOUNT = 100;

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 저장 불가 — 무시 */ }
  }
  function emit(type, detail) {
    document.dispatchEvent(new CustomEvent('polaris:' + type, { detail: detail }));
  }

  /* ---------------- 프로필 ---------------- */
  const NAME_A = ['은하', '별빛', '혜성', '달빛', '새벽', '극광', '유성', '안개'];
  const NAME_B = ['기사', '항해사', '탐험가', '장인', '학자', '방랑자', '수호자', '개척자'];

  P.profile = {
    get() {
      let p = readJSON(PROFILE_KEY, null);
      if (!p || !p.name) {
        p = {
          name: NAME_A[Math.floor(Math.random() * NAME_A.length)] + NAME_B[Math.floor(Math.random() * NAME_B.length)],
          created: new Date().toISOString()
        };
        writeJSON(PROFILE_KEY, p);
      }
      return p;
    },
    setName(name) {
      const clean = String(name || '').trim().slice(0, 12);
      if (!clean) return false;
      const p = this.get();
      p.name = clean;
      writeJSON(PROFILE_KEY, p);
      emit('profile', p);
      return true;
    }
  };

  /* ---------------- 도토리 (통합 화폐) ---------------- */
  P.coins = {
    balance() {
      const w = readJSON(WALLET_KEY, { coins: 0 });
      return Math.max(0, w.coins | 0);
    },
    add(amount, reason) {
      const n = Math.max(0, amount | 0);
      if (n === 0) return this.balance();
      const w = readJSON(WALLET_KEY, { coins: 0 });
      w.coins = (w.coins | 0) + n;
      writeJSON(WALLET_KEY, w);
      emit('coins', { coins: w.coins, delta: n, reason: reason || '' });
      return w.coins;
    },
    spend(amount) {
      const n = Math.max(0, amount | 0);
      const w = readJSON(WALLET_KEY, { coins: 0 });
      if ((w.coins | 0) < n) return false;
      w.coins = (w.coins | 0) - n;
      writeJSON(WALLET_KEY, w);
      emit('coins', { coins: w.coins, delta: -n, reason: 'spend' });
      return true;
    }
  };

  /* ---------------- 일일 보너스 ---------------- */
  P.daily = {
    claimedToday() {
      return localStorage.getItem(DAILY_KEY) === new Date().toDateString();
    },
    claim() {
      if (this.claimedToday()) return 0;
      localStorage.setItem(DAILY_KEY, new Date().toDateString());
      P.coins.add(DAILY_AMOUNT, 'daily');
      P.level.addExp(20, 'daily');
      return DAILY_AMOUNT;
    }
  };

  /* ---------------- 레벨 / 경험치 ---------------- */
  const LEVEL_KEY = 'polaris.level.v1';
  // L→L+1 승급에 필요한 경험치: 100 + 50*(L-1) — 초반 빠르게, 후반 완만
  function expForNext(level) { return 100 + (level - 1) * 50; }

  P.level = {
    _raw() { return readJSON(LEVEL_KEY, { exp: 0 }); },
    info() {
      let exp = Math.max(0, this._raw().exp | 0);
      let level = 1;
      while (exp >= expForNext(level)) { exp -= expForNext(level); level++; }
      return { level: level, exp: exp, expNext: expForNext(level) };
    },
    addExp(n, reason) {
      const r = this._raw();
      const before = this.info().level;
      r.exp = Math.max(0, (r.exp | 0) + n);
      writeJSON(LEVEL_KEY, r);
      const after = this.info();
      emit('level', after);
      if (after.level > before) {
        P.toast('⭐ 레벨 업! Lv.' + after.level + ' 달성');
        P.coins.add(after.level * 20, 'levelup');
      }
      return after;
    }
  };

  /* ---------------- 오늘의 미션 (일일 3종) ---------------- */
  const MISSION_KEY = 'polaris.missions.v1';
  const MISSION_POOL = [
    { id: 'play_go', text: '바둑 1국 대국하기', game: 'go', type: 'play', target: 1, reward: 60, exp: 15 },
    { id: 'win_go', text: '바둑 1승', game: 'go', type: 'win', target: 1, reward: 120, exp: 30 },
    { id: 'play_omok', text: '오목 1국 두기', game: 'omok', type: 'play', target: 1, reward: 60, exp: 15 },
    { id: 'win_omok', text: '오목 1승', game: 'omok', type: 'win', target: 1, reward: 120, exp: 30 },
    { id: 'play_alkkagi', text: '알까기 1판 치기', game: 'alkkagi', type: 'play', target: 1, reward: 60, exp: 15 },
    { id: 'win_alkkagi', text: '알까기 1승', game: 'alkkagi', type: 'win', target: 1, reward: 120, exp: 30 },
    { id: 'play_beatcraft', text: 'BeatCraft 1곡 플레이', game: 'beatcraft', type: 'play', target: 1, reward: 60, exp: 15 },
    { id: 'play_vs', text: '뱀파이어 키우기 1판', game: 'vs', type: 'play', target: 1, reward: 60, exp: 15 },
    { id: 'play_pvz', text: '식물 vs 좀비 1판', game: 'pvz', type: 'play', target: 1, reward: 60, exp: 15 }
  ];

  P.missions = {
    _store() {
      const today = new Date().toISOString().slice(0, 10);
      let m = readJSON(MISSION_KEY, null);
      if (!m || m.date !== today) {
        // 날짜를 시드로 풀에서 3종 로테이션
        let seed = 0;
        for (const ch of today) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
        const pool = MISSION_POOL.slice();
        const picked = [];
        while (picked.length < 3 && pool.length > 0) {
          seed = (seed * 1103515245 + 12345) >>> 0;
          picked.push(pool.splice(seed % pool.length, 1)[0]);
        }
        m = { date: today, ids: picked.map(x => x.id), progress: {}, claimed: {} };
        writeJSON(MISSION_KEY, m);
      }
      return m;
    },
    todays() {
      const m = this._store();
      return m.ids.map(id => {
        const def = MISSION_POOL.find(x => x.id === id);
        const progress = Math.min(m.progress[id] | 0, def.target);
        return {
          id: id, text: def.text, reward: def.reward, exp: def.exp,
          progress: progress, target: def.target,
          done: progress >= def.target, claimed: !!m.claimed[id]
        };
      });
    },
    _report(game, outcome) {
      const m = this._store();
      let changed = false;
      for (const id of m.ids) {
        const def = MISSION_POOL.find(x => x.id === id);
        if (!def || def.game !== game) continue;
        if (def.type === 'play' || (def.type === 'win' && outcome === 'w')) {
          if ((m.progress[id] | 0) < def.target) { m.progress[id] = (m.progress[id] | 0) + 1; changed = true; }
        }
      }
      if (changed) writeJSON(MISSION_KEY, m);
      emit('missions', m);
    },
    claim(id) {
      const m = this._store();
      if (m.claimed[id]) return 0;
      const def = MISSION_POOL.find(x => x.id === id);
      const progress = m.progress[id] | 0;
      if (!def || progress < def.target) return 0;
      m.claimed[id] = true;
      writeJSON(MISSION_KEY, m);
      P.coins.add(def.reward, 'mission');
      P.level.addExp(def.exp, 'mission');
      emit('missions', m);
      return def.reward;
    }
  };

  /* ---------------- 상점 (보드 테마 — 코스메틱 영구 소유) ---------------- */
  const SHOP_KEY = 'polaris.shop.v1';
  // 프리셋: 로비 스와치 프리뷰(vars)와 엔진 목재 팔레트(wood)가 같이 읽는 단일 출처
  // wood가 없으면(null) 엔진 내장 기본 팔레트 = 기존 출시색 — 'basic' 복귀와 동일 외형.
  // filter는 색 변환 금지(§0-6) — neon 글로우 같은 비색 효과만 잔류 (BACKLOG #27 팔레트화)
  const THEME_DEFS = [
    { id: 'classic',  name: '클래식', price: 300,
      vars: { '--board': '#e6c17a', '--board-dark': '#cfa254' },          // 스와치 프리뷰 전용 (기존 유지)
      wood: { stops: ['#f0c98a', '#e4bc7c', '#cfa45e'],                   // 목재 그라디언트 3정지
              grain: [122, 78, 34], knot: [96, 58, 22], vignette: [56, 32, 12] },
      filter: 'none' },
    { id: 'cheolmok', name: '철목',   price: 450,
      vars: { '--board': '#b07a42', '--board-dark': '#8f5c2c' },
      wood: { stops: ['#c89058', '#a8743e', '#82552a'],
              grain: [80, 44, 18], knot: [62, 34, 14], vignette: [38, 20, 8] },
      filter: 'none' },                                                   // ← 색변환 saturate/brightness 폐기
    { id: 'hanji',    name: '한지',   price: 600,
      vars: { '--board': '#efe3c2', '--board-dark': '#d8c79b' },
      wood: { stops: ['#f6ecd4', '#efe3c2', '#dcc79b'],
              grain: [168, 138, 84], knot: [140, 112, 66], vignette: [120, 96, 56] },
      filter: 'none' },                                                   // ← sepia/brightness 폐기
    { id: 'neon',     name: '네온',   price: 800,
      vars: { '--board': '#2ea88a', '--board-dark': '#1c7a63' },
      wood: { stops: ['#35b896', '#2ea88a', '#17715c'],
              grain: [10, 64, 52], knot: [8, 52, 42], vignette: [4, 32, 26] },
      filter: 'drop-shadow(0 0 14px rgba(46,168,138,.45))' }              // ← hue-rotate 폐기, 글로우만 유지
  ];

  P.shop = {
    _store() {
      // 파손/부재 폴백 — 유효한 값만 남긴다 (기존 readJSON 패턴)
      const s = readJSON(SHOP_KEY, null) || {};
      const valid = THEME_DEFS.some(d => d.id === s.active) || s.active === 'basic';
      s.owned = (Array.isArray(s.owned) ? s.owned : [])
        .filter(id => THEME_DEFS.some(d => d.id === id))
        .filter((id, i, a) => a.indexOf(id) === i); // 미정의 id·중복 제거
      s.active = valid ? s.active : 'basic'; // 미설정·무효값 → 'basic' (폴백 기본값)
      return s;
    },
    catalog() {
      // THEME_DEFS + 소유/활성 여부 — 스와치 프리뷰(vars)와 suiji 테마 훅(wood)이 같이 읽는다
      const s = this._store();
      return THEME_DEFS.map(d => ({
        id: d.id, name: d.name, price: d.price, vars: d.vars, filter: d.filter, wood: d.wood,
        owned: s.owned.indexOf(d.id) >= 0,
        active: s.active === d.id
      }));
    },
    activeId() {
      return this._store().active;
    },
    buy(id) {
      const def = THEME_DEFS.find(d => d.id === id);
      if (!def) return { ok: false, reason: 'invalid' };
      const s = this._store();
      if (s.owned.indexOf(id) >= 0) return { ok: false, reason: 'owned' }; // 재구매 방지
      if (P.coins.balance() < def.price) {
        // 잔액 부족 — spend 전 선검사로 필요/보유/부족을 안내용으로 반환
        return { ok: false, reason: 'poor', need: def.price, lack: def.price - P.coins.balance() };
      }
      if (!P.coins.spend(def.price)) { // 잔액 변동 동시성 폴백 — 기존 spend false 반환 패턴
        return { ok: false, reason: 'poor', need: def.price, lack: def.price - P.coins.balance() };
      }
      s.owned.push(id);
      s.active = id; // 구매 즉시 자동 장착
      writeJSON(SHOP_KEY, s);
      emit('shop', s); // 잔액 동기화는 spend 내부 emit('coins')가 담당
      return { ok: true, theme: def };
    },
    equip(id) {
      const s = this._store();
      if (s.owned.indexOf(id) < 0) return false; // 소유 테마만 장착
      s.active = id;
      writeJSON(SHOP_KEY, s);
      emit('shop', s);
      return true;
    },
    unequip() {
      const s = this._store();
      s.active = 'basic'; // 기본 보드 복귀 — 소유권은 유지 (환불 아님)
      writeJSON(SHOP_KEY, s);
      emit('shop', s);
      return true;
    }
  };

  /* ---------------- 주간 성적표 (월요일 기준 — settle 한 곳에서만 집계) ---------------- */
  const WEEKLY_KEY = 'polaris.weekly.v1';
  // 월요일 기준 주 시작 (YYYY-MM-DD, 로컬 기준) — ISO 주 번호 계산 없이 날짜 비교만
  function weekStartISO(now) {
    const d = new Date(now);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // 월=0 … 일=6 만큼 되돌림
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); // 로컬 날짜 (toISOString의 UTC 시프트 회피)
  }

  P.weekly = {
    _weekStartISO: weekStartISO, // 내부 헬퍼 (관례: 밑줄 = 내부) — 롤오버 판정 재사용
    _store() {
      const ws = weekStartISO(new Date());
      let s = readJSON(WEEKLY_KEY, null);
      if (!s || typeof s !== 'object') s = {};
      // 필드 정규화 (파손/부재 폴백 — 기존 readJSON 패턴)
      s.weekStart = (typeof s.weekStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.weekStart)) ? s.weekStart : ws;
      s.plays = s.plays | 0;
      s.coinsEarned = s.coinsEarned | 0;
      s.coinsSpent = s.coinsSpent | 0;
      s.exp = s.exp | 0;
      if (!s.games || typeof s.games !== 'object') s.games = {};
      if (s.weekStart !== ws) {
        if (s.weekStart < ws) {
          // 자동 롤오버 — 현재 값을 지난주 요약 스냅샷으로 보관 (1주만 보관: 비교 지표용)
          s.last = { weekStart: s.weekStart, plays: s.plays, coinsEarned: s.coinsEarned, exp: s.exp };
        }
        // 저장된 주가 미래면(시계 되돌림) 스냅샷 없이 리셋 — 음수 주 방지 (last는 기존값 유지)
        s.weekStart = ws;
        s.plays = 0; s.games = {}; s.coinsEarned = 0; s.coinsSpent = 0; s.exp = 0;
      }
      return s;
    },
    summary() {
      const s = this._store();
      writeJSON(WEEKLY_KEY, s); // 로비 재방문 시 재판정 — 롤오버 결과 즉시 반영
      return JSON.parse(JSON.stringify(s)); // 복사본 반환 — 외부 변형 차단
    },
    record(game, outcome, delta, exp) {
      // ※ P.settle에서만 호출 — 외부 직접 호출 금지 (수집 원본은 settle 한 곳: 단일 수집 원칙)
      const s = this._store();
      s.plays += 1;
      const g = s.games[game] = s.games[game] || { w: 0, l: 0, d: 0 };
      g.w = g.w | 0; g.l = g.l | 0; g.d = g.d | 0;
      if (outcome === 'w') g.w++; else if (outcome === 'l') g.l++; else g.d++;
      if (delta > 0) s.coinsEarned += delta;       // settle delta의 부호 기준 합산 (무승부 0)
      else if (delta < 0) s.coinsSpent += -delta;
      s.exp += exp | 0;
      writeJSON(WEEKLY_KEY, s);
      return JSON.parse(JSON.stringify(s));
    }
  };

  /* ---------------- 클라우드 계정·전적·주간 리더보드 (Phase 2 사이클 B) ---------------- */
  /* 서버: 두마당 API (docs/design/portal-phase2-account-server.md §4 — 구현된 server.cjs가 진실)
     - API base: window.POLARIS_API_URL → localStorage 'polaris.api.v1' → ''(=비활성)
     - 비활성 시 P.cloud 전체 no-op — 기존 localStorage 동작 100% 유지 (file:// 폴백)
     - 토큰은 'polaris.auth.v1' 단 1개 키 {name, token, expiresAt}
     - fetch 실패·403·401(토큰 만료) → 조용히 폴백(로그아웃 처리 + 로컬 동작 유지, 절대 throw 안 함)
       사용자 입력 오류(400/409/429)는 {ok:false, code, field, reason} 반환으로 전달 — UI 표시용 */
  // localStorage 스토리지 키 이름 (자격증명 아님) — 스캐너 오탐 방지 위해 명시적 네이밍
  const LS_KEY_API_BASE = 'polaris.api.v1';
  const LS_KEY_AUTH = 'polaris.auth.v1';

  function apiBase() {
    try {
      if (typeof window.POLARIS_API_URL === 'string' && window.POLARIS_API_URL.trim()) {
        return window.POLARIS_API_URL.trim().replace(/\/+$/, '');
      }
      const saved = localStorage.getItem(LS_KEY_API_BASE);
      if (typeof saved === 'string' && saved.trim()) return saved.trim().replace(/\/+$/, '');
    } catch (e) { /* localStorage 불가 환경 — 비활성 */ }
    return '';
  }

  function readAuth() { return readJSON(LS_KEY_AUTH, null); }
  function clearAuth() { try { localStorage.removeItem(LS_KEY_AUTH); } catch (e) { /* 무시 */ } }
  function emitCloud() { emit('cloud', P.cloud.state()); }

  /* 공용 fetch — 네트워크 실패는 {status:0}로 정규화(호출부가 조용히 폴백), 응답 본문 JSON 파싱 */
  function apiFetch(pathname, options) {
    return fetch(apiBase() + pathname, options).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        return { status: res.status, body: body || {} };
      });
    });
  }

  P.cloud = {
    available() { return apiBase() !== ''; },
    state() {
      const a = readAuth();
      const loggedIn = !!(a && a.token) && this.available();
      // expiresAt는 epoch 밀리초(~1.78e12) — 비트 연산자(|0)는 ToInt32 래핑으로 값을 파손하므로 Number()로 정규화
      return { available: this.available(), loggedIn: loggedIn, name: loggedIn ? (a.name || '') : '', expiresAt: loggedIn ? (Number(a.expiresAt) || 0) : 0 };
    },
    register(name, pw) {
      const self = this;
      if (!this.available()) return Promise.resolve({ ok: false, code: 'CLOUD_DISABLED' });
      return apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: String(name || ''), password: String(pw || '') })
      }).then(function (r) {
        const b = r.body;
        if (r.status === 201 && b.ok && b.token) {
          writeJSON(LS_KEY_AUTH, {
            name: (b.account && b.account.name) || String(name || '').trim(),
            token: b.token,
            expiresAt: Date.now() + (b.expiresInDays || 30) * 86400000
          });
          emitCloud();
          return { ok: true, account: b.account };
        }
        if (r.status === 0 || r.status === 403 || r.status >= 500) return { ok: false, code: 'NETWORK' };
        return { ok: false, code: b.code || 'ERROR', field: b.field, reason: b.reason };   // 400/409/429 — 입력 오류 전달
      }).catch(function () { return { ok: false, code: 'NETWORK' }; });
    },
    login(name, pw) {
      if (!this.available()) return Promise.resolve({ ok: false, code: 'CLOUD_DISABLED' });
      return apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: String(name || ''), password: String(pw || '') })
      }).then(function (r) {
        const b = r.body;
        if (r.status === 200 && b.ok && b.token) {
          writeJSON(LS_KEY_AUTH, {
            name: (b.account && b.account.name) || String(name || '').trim(),
            token: b.token,
            expiresAt: Date.now() + (b.expiresInDays || 30) * 86400000
          });
          emitCloud();
          return { ok: true, account: b.account };
        }
        if (r.status === 0 || r.status === 403 || r.status >= 500) return { ok: false, code: 'NETWORK' };
        return { ok: false, code: b.code || 'ERROR', field: b.field, reason: b.reason };   // 401 AUTH_FAILED 등 — UI 표시
      }).catch(function () { return { ok: false, code: 'NETWORK' }; });
    },
    /* 로컬 로그아웃은 항상 즉시 완료 — 서버 토큰 폐기는 fire-and-forget (네트워크 실패 무음) */
    logout() {
      const a = readAuth();
      clearAuth();
      emitCloud();
      if (a && a.token && apiBase()) {
        apiFetch('/api/auth/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + a.token } }).catch(function () {});
      }
    },
    /* 판 종료 전적 업로드 — settle 훅 전용. 실패해도 로컬 기록은 이미 저장된 뒤라 무음 폴백이 정답.
       401(토큰 만료) 시 조용히 로그아웃 처리하고 다음 판부터는 로컬 동작만 유지 */
    uploadMatch(result) {
      const a = readAuth();
      if (!apiBase() || !a || !a.token) return Promise.resolve({ ok: false, code: 'CLOUD_DISABLED' });
      return apiFetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + a.token },
        body: JSON.stringify({ game: String(result.game || ''), outcome: String(result.outcome || ''), delta: result.delta | 0, exp: result.exp | 0 })
      }).then(function (r) {
        const b = r.body;
        if (r.status === 201 && b.ok) return { ok: true, weekly: b.weekly, matchesTotal: b.matchesTotal };
        if (r.status === 401) { clearAuth(); emitCloud(); return { ok: false, code: b.code || 'TOKEN_EXPIRED', loggedOut: true }; }
        if (r.status === 0 || r.status === 403 || r.status >= 500) return { ok: false, code: 'NETWORK' };
        return { ok: false, code: b.code || 'ERROR', field: b.field, reason: b.reason };
      }).catch(function () { return { ok: false, code: 'NETWORK' }; });
    },
    /* 주간 리더보드 — 공개 조회(토큰 없이 가능)하되 토큰이 있으면 me 를 받는다.
       401(만료) 시 조용히 로그아웃 후 비인증으로 1회 재시도 — 목록은 계속 보이게 */
    leaderboard(week, game) {
      if (!this.available()) return Promise.resolve({ ok: false, code: 'CLOUD_DISABLED' });
      const qs = new URLSearchParams();
      if (week) qs.set('week', String(week));
      if (game) qs.set('game', String(game));
      qs.set('limit', '20');
      const get = function (withAuth) {
        const a = withAuth ? readAuth() : null;
        const headers = (a && a.token) ? { 'Authorization': 'Bearer ' + a.token } : {};
        return apiFetch('/api/leaderboard/weekly?' + qs.toString(), { headers: headers });
      };
      return get(true).catch(function () { return { status: 0, body: {} }; }).then(function (r) {
        if (r.status === 401) {
          clearAuth(); emitCloud();
          return get(false).catch(function () { return { status: 0, body: {} }; });
        }
        return r;
      }).then(function (r) {
        const b = r.body;
        if (r.status === 200 && b.ok) return { ok: true, weekStart: b.weekStart, metric: b.metric, entries: b.entries || [], me: b.me || null };
        if (r.status === 404 && b.code === 'WEEK_NOT_FOUND') return { ok: false, code: 'WEEK_NOT_FOUND' };
        if (r.status === 0 || r.status === 403 || r.status >= 500) return { ok: false, code: 'NETWORK' };
        return { ok: false, code: b.code || 'ERROR', field: b.field, reason: b.reason };
      });
    }
  };

  /* ---------------- 판 정산 (승/무/패 → 판돈·경험치·미션·주간 성적표) ---------------- */
  const STAKE = 50; // 기본 판돈 — 잔액 부족 시 보유 전액(올인)
  P.settle = function (game, outcome) {
    const stake = Math.min(STAKE, P.coins.balance());
    let delta = 0;
    if (outcome === 'w') { P.coins.add(stake, 'settle-win'); delta = stake; }
    else if (outcome === 'l') { P.coins.spend(stake); delta = -stake; }
    const expGain = outcome === 'w' ? 25 : outcome === 'd' ? 12 : 8;
    const before = P.level.info().level;
    P.level.addExp(expGain, 'settle');
    const after = P.level.info();
    P.missions._report(game, outcome);
    // 주간 성적표 집계 (§2-1) — settle을 호출하는 게임은 향후 자동 포함, 로비 패널 즉시 갱신용 emit
    emit('weekly', P.weekly.record(game, outcome, delta, expGain));
    if (P.cloud.available()) P.cloud.uploadMatch({ game: game, outcome: outcome, delta: delta, exp: expGain }).catch(function () {});   // 클라우드 전적 업로드 — 비동기 fire-and-forget, 게임 흐름 비차단·실패 무음
    return { delta: delta, exp: expGain, level: after.level, levelUp: after.level > before };
  };

  /* ---------------- 토스트 ---------------- */
  let toastTimer = null;
  P.toast = function (message, ms) {
    let el = document.getElementById('polaris-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'polaris-toast';
      el.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);' +
        'background:rgba(20,24,48,.95);color:#e8eaf6;border:1px solid #4fd1c5;border-radius:12px;' +
        'padding:12px 20px;font-size:14px;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.5);' +
        'font-family:inherit;transition:opacity .25s;opacity:0;pointer-events:none;';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.opacity = '0'; }, ms || 3000);
  };

  /* ---------------- 포털 상단바 ---------------- */
  /* selector 생략 시 body 첫 자식으로 삽입. 게임 페이지에서도 재사용 가능. */
  P.header = {
    mount(selector) {
      const host = selector ? document.querySelector(selector) : document.body;
      if (!host) return null;
      const profile = P.profile.get();
      const bar = document.createElement('div');
      bar.id = 'polaris-bar';
      bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;' +
        'max-width:1080px;margin:0 auto 28px;padding:12px 18px;border:1px solid #2a3154;border-radius:14px;' +
        'background:rgba(23,27,49,.8);font-size:14px;';
      bar.innerHTML =
        '<span style="color:#9aa3c7">✦ <b style="color:#e8eaf6" id="polaris-bar-name"></b></span>' +
        '<span style="display:flex;align-items:center;gap:10px">' +
        '<span id="polaris-bar-coins" title="도토리 — 전 게임 공유 화폐" style="cursor:default">🌰 <b>0</b></span>' +
        '<button id="polaris-bar-daily" style="background:#1e2440;color:#4fd1c5;border:1px solid #2a3154;' +
        'border-radius:10px;padding:7px 14px;font-size:13px;cursor:pointer;font-family:inherit">일일 보너스</button>' +
        '</span>';

      const anchor = host.firstChild;
      host.insertBefore(bar, anchor);

      const nameEl = bar.querySelector('#polaris-bar-name');
      const coinsEl = bar.querySelector('#polaris-bar-coins');
      const dailyBtn = bar.querySelector('#polaris-bar-daily');

      function renderCoins() { coinsEl.innerHTML = '🌰 <b>' + P.coins.balance() + '</b>'; }
      function renderDaily() {
        dailyBtn.textContent = P.daily.claimedToday() ? '보너스 받음 ✓' : '일일 보너스 🌰100';
        dailyBtn.disabled = P.daily.claimedToday();
        dailyBtn.style.opacity = P.daily.claimedToday() ? '.45' : '1';
      }

      nameEl.textContent = profile.name;
      renderCoins();
      renderDaily();

      dailyBtn.addEventListener('click', () => {
        const got = P.daily.claim();
        if (got > 0) {
          renderDaily();
          renderCoins();
          P.toast('일일 보너스 🌰' + got + ' 지급!');
        }
      });
      coinsEl.addEventListener('click', () => {
        const input = window.prompt('닉네임 변경 (최대 12자)', P.profile.get().name);
        if (input != null && P.profile.setName(input)) {
          nameEl.textContent = P.profile.get().name;
          P.toast('닉네임이 변경되었습니다 — ' + P.profile.get().name);
        }
      });
      document.addEventListener('polaris:coins', renderCoins);
      return bar;
    }
  };

  /* ---------------- 로비 위젯 (프로필 카드 · 미션 패널 · 상점 · 주간 성적표) ---------------- */
  const BOX_STYLE = 'background:#171b31;border:1px solid #2a3154;border-radius:16px;padding:18px 20px;';
  const GOLD = '#f5c542';

  P.widgets = {
    /* 프로필 카드: 아바타 · 닉네임 · 레벨 · 경험치 바 · 소지금 */
    profileCard(selector) {
      const host = document.querySelector(selector);
      if (!host) return null;
      const info = P.level.info();
      const profile = P.profile.get();
      const el = document.createElement('div');
      el.style.cssText = BOX_STYLE + 'display:flex;align-items:center;gap:16px;';
      el.innerHTML =
        '<div style="width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,#7c6cff,#4fd1c5);' +
        'display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:#0d1021;flex-shrink:0">' +
        profile.name.charAt(0) + '</div>' +
        '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">' +
        '<b id="pc-name" style="font-size:17px">' + profile.name + '</b>' +
        '<span style="font-size:12px;color:' + GOLD + '">Lv.' + info.level + '</span>' +
        '<span id="pc-coins" style="font-size:13px;color:#4fd1c5">🌰 ' + P.coins.balance() + '</span></div>' +
        '<div style="margin-top:8px;height:8px;border-radius:4px;background:#2a3154;overflow:hidden">' +
        '<div id="pc-expbar" style="height:100%;width:0;background:linear-gradient(90deg,#7c6cff,#4fd1c5);transition:width .4s"></div></div>' +
        '<div id="pc-expText" style="margin-top:4px;font-size:11px;color:#9aa3c7"></div></div>';

      function render() {
        const inf = P.level.info();
        el.querySelector('#pc-name').textContent = P.profile.get().name;
        el.querySelector('#pc-coins').textContent = '🌰 ' + P.coins.balance();
        el.querySelector('#pc-expbar').style.width = Math.round(inf.exp / inf.expNext * 100) + '%';
        el.querySelector('#pc-expText').textContent = 'EXP ' + inf.exp + ' / ' + inf.expNext + '  ·  다음 레벨까지 ' + (inf.expNext - inf.exp);
      }
      render();
      document.addEventListener('polaris:coins', render);
      document.addEventListener('polaris:level', render);
      document.addEventListener('polaris:profile', render);
      host.appendChild(el);
      return el;
    },

    /* 미션 패널: 오늘의 미션 3종 — 진행도 · 보상 수령 */
    missionsPanel(selector) {
      const host = document.querySelector(selector);
      if (!host) return null;
      const el = document.createElement('div');
      el.style.cssText = BOX_STYLE;
      el.innerHTML = '<div style="font-size:13px;letter-spacing:.15em;color:#9aa3c7;margin-bottom:12px">🎯 오늘의 미션</div>' +
        '<div id="mp-list" style="display:flex;flex-direction:column;gap:10px"></div>';

      function render() {
        const list = el.querySelector('#mp-list');
        list.innerHTML = '';
        for (const m of P.missions.todays()) {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:10px;font-size:13.5px;';
          const state = m.claimed ? '✓' : (m.done ? '🎁' : '○');
          const prog = m.target > 1 ? ' (' + m.progress + '/' + m.target + ')' : '';
          const btn = m.claimed
            ? '<span style="color:#9aa3c7;font-size:12px">수령 완료</span>'
            : (m.done
              ? '<button data-mid="' + m.id + '" style="background:' + GOLD + ';color:#0d1021;border:0;border-radius:8px;' +
                'padding:6px 12px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">🌰' + m.reward + ' 받기</button>'
              : '<span style="color:#9aa3c7;font-size:12px">🌰' + m.reward + '</span>');
          row.innerHTML = '<span style="color:' + (m.done ? GOLD : '#4fd1c5') + '">' + state + '</span>' +
            '<span style="flex:1;' + (m.claimed ? 'color:#9aa3c7;text-decoration:line-through' : '') + '">' + m.text + prog + '</span>' + btn;
          list.appendChild(row);
        }
        list.querySelectorAll('button[data-mid]').forEach(btn => {
          btn.addEventListener('click', () => {
            const got = P.missions.claim(btn.getAttribute('data-mid'));
            if (got > 0) P.toast('미션 보상 🌰' + got + ' 지급!');
            render();
          });
        });
      }
      render();
      document.addEventListener('polaris:missions', render);
      document.addEventListener('polaris:coins', render);
      host.appendChild(el);
      return el;
    },

    /* 보드 테마 상점: 미니 보드 스와치 프리뷰 + 버튼 3상태(구매/적용/적용 중) — §1-4 */
    shopPanel(selector) {
      const host = document.querySelector(selector);
      if (!host) return null;
      // 기본 보드(전원 소유 · 판매 안 함) — suiji-theme.css 기본 톤(#dcb268/#c1934a)과 동일
      const BASIC = { id: 'basic', name: '기본', price: 0, owned: true, vars: { '--board': '#dcb268', '--board-dark': '#c1934a' } };
      const el = document.createElement('div');
      el.style.cssText = BOX_STYLE;
      el.innerHTML =
        '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:12px">' +
        '<div style="font-size:13px;letter-spacing:.15em;color:#9aa3c7">🛒 보드 테마 상점</div>' +
        '<span id="sp-balance" style="font-size:13px;color:#4fd1c5;cursor:default">🌰 ' + P.coins.balance() + '</span></div>' +
        '<div id="sp-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px"></div>' +
        '<div style="margin-top:10px;font-size:11px;color:#9aa3c7">구매한 테마는 영구 소유 — 환불은 지원되지 않아요</div>';

      // 미니 보드 스와치: 프리셋 vars를 입힌 CSS 그라디언트 프리뷰 (외부 리소스 없음 — file:// 안전)
      function swatch(vars) {
        const a = vars['--board'], b = vars['--board-dark'];
        return '<div style="height:44px;border-radius:8px;border:1px solid rgba(0,0,0,.35);' +
          'background:linear-gradient(135deg,' + a + ' 0%,' + a + ' 52%,' + b + ' 52%,' + b + ' 100%)"></div>';
      }
      function button(t) { // 상태 버튼: 적용 중 ✓ / 적용 / 구매(잔액 부족 시 비활성)
        const css = 'width:100%;border:0;border-radius:8px;padding:6px 8px;font-size:12px;font-weight:700;font-family:inherit;';
        if (t.active) return '<button disabled style="' + css + 'background:#242b4d;color:' + GOLD + '">적용 중 ✓</button>';
        if (t.owned) return '<button data-theme="' + t.id + '" style="' + css + 'background:#242b4d;color:#4fd1c5;cursor:pointer">적용</button>';
        const lack = t.price - P.coins.balance();
        if (lack > 0) return '<button disabled title="도토리가 부족해요" style="' + css + 'background:#242b4d;color:#9aa3c7;opacity:.55">🌰' + lack + ' 부족</button>';
        return '<button data-theme="' + t.id + '" style="' + css + 'background:' + GOLD + ';color:#0d1021;cursor:pointer">🌰' + t.price + ' 구매</button>';
      }
      function render() {
        el.querySelector('#sp-balance').textContent = '🌰 ' + P.coins.balance();
        const grid = el.querySelector('#sp-grid');
        grid.innerHTML = '';
        const cards = [BASIC].concat(P.shop.catalog()); // 기본 보드를 맨 앞 — '적용 해제' 경로 (A7)
        for (const t of cards) {
          const card = document.createElement('div');
          card.style.cssText = 'background:#1e2440;border:1px solid #2a3154;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px;';
          card.innerHTML = swatch(t.vars) +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px">' +
            '<b style="font-size:13px">' + t.name + '</b>' +
            (t.id !== 'basic' && t.owned
              ? '<span style="font-size:10.5px;color:' + GOLD + ';border:1px solid ' + GOLD + ';border-radius:999px;padding:0 7px">보유 ✓</span>'
              : '') +
            '</div>' +
            '<div style="font-size:11.5px;color:#9aa3c7">' + (t.price ? '🌰 ' + t.price : '기본 보드') + '</div>' +
            button(t);
          grid.appendChild(card);
        }
        grid.querySelectorAll('button[data-theme]').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-theme');
            if (id === 'basic') { // '적용 해제' — 기본 보드 복귀, 소유권은 유지 (환불 아님)
              P.shop.unequip();
              P.toast('기본 보드로 복귀했어요 (보유 테마는 그대로 유지)');
            } else {
              const t = P.shop.catalog().find(x => x.id === id);
              if (t.owned) { // 보유 테마 적용 — 구매 경로가 노출되지 않는 이중 방어(§1-3)
                P.shop.equip(id);
                P.toast(t.name + ' 테마를 적용했어요');
              } else if (window.confirm('🪵 ' + t.name + ' 테마를 🌰' + t.price + '에 구매할까요? 구매 후 환불은 되지 않아요.')) {
                // 구매 확인 1회 — 기존 네이티브 다이얼로그 패턴(닉네임 변경 prompt와 동일)
                const res = P.shop.buy(id);
                if (res.ok) P.toast('테마 구매! 보드에 바로 적용됐어요');
                else if (res.reason === 'poor') P.toast('도토리가 부족해요 — 필요 ' + res.need + ' · 보유 ' + P.coins.balance() + ' (부족 ' + res.lack + ')');
              }
            }
            render(); // polaris:shop/polaris:coins 재구독으로도 갱신되지만 클릭 흐름은 즉시 반영
          });
        });
      }
      render();
      document.addEventListener('polaris:shop', render);
      document.addEventListener('polaris:coins', render); // 잔액·버튼 상태 실시간 동기화
      host.appendChild(el);
      return el;
    },

    /* 주간 성적표: 요약 4칸 + 지난주 비교 + 게임별 상세 리스트 — §2-4 */
    weeklyPanel(selector) {
      const host = document.querySelector(selector);
      if (!host) return null;
      const GAME_LABELS = { go: '바둑', omok: '오목', alkkagi: '알까기', kifu: '기보' };
      const el = document.createElement('div');
      el.style.cssText = BOX_STYLE;
      el.innerHTML = '<div style="font-size:13px;letter-spacing:.15em;color:#9aa3c7;margin-bottom:12px">📊 내 주간 성적표</div>' +
        '<div id="wp-body"></div>';

      function cell(label, value) {
        return '<div style="background:#1e2440;border:1px solid #2a3154;border-radius:10px;padding:8px 10px">' +
          '<div style="font-size:10.5px;color:#9aa3c7;letter-spacing:.08em">' + label + '</div>' +
          '<div style="margin-top:3px;font-size:14px;font-weight:700">' + value + '</div></div>';
      }
      function wldText(g) { // Suiji.stats.text()와 같은 W/L/D 표기 포맷 — 전적 없는 게임은 '—'
        if (!g || (g.w | 0) + (g.l | 0) + (g.d | 0) === 0) return '—';
        return (g.w | 0) + 'W · ' + (g.l | 0) + 'L' + ((g.d | 0) ? ' · ' + (g.d | 0) + 'D' : '');
      }
      function compareLine(s) { // 지난주 비교 1줄 — last 스냅샷 기준 (없으면 첫 주 안내)
        if (!s.last) return '이번 주가 첫 주예요';
        const diff = s.plays - (s.last.plays | 0);
        if (diff > 0) return '지난주보다 ' + diff + '판 더 했어요 ↑';
        if (diff < 0) return '지난주보다 ' + (-diff) + '판 덜 했어요 ↓';
        return '지난주와 같은 ' + s.plays + '판이에요';
      }
      function render() {
        const s = P.weekly.summary();
        let wins = 0, losses = 0, draws = 0;
        for (const k of Object.keys(s.games)) {
          const g = s.games[k] || {};
          wins += g.w | 0; losses += g.l | 0; draws += g.d | 0;
        }
        const body = el.querySelector('#wp-body');
        body.innerHTML =
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px">' +
          cell('이번 주', s.plays + '판') +
          cell('전적', wins + '승 ' + losses + '패' + (draws ? ' (' + draws + '무)' : '')) +
          cell('도토리', '🌰 <span style="color:' + GOLD + '">+' + (s.coinsEarned | 0) + '</span> / −' + (s.coinsSpent | 0)) +
          cell('경험치', '+' + (s.exp | 0) + ' EXP') +
          '</div>' +
          '<div style="margin-top:8px;font-size:12px;color:#9aa3c7">' + compareLine(s) + '</div>' +
          '<div id="wp-list" style="margin-top:10px;display:flex;flex-direction:column;gap:6px;font-size:13px"></div>';
        // 게임별 상세 — 알려진 4종은 항상 표시(전적 없으면 '—'), 신규 게임은 settle 경유 시 자동 추가
        const list = body.querySelector('#wp-list');
        const ids = Object.keys(GAME_LABELS).concat(Object.keys(s.games).filter(k => !GAME_LABELS[k]));
        for (const id of ids) {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;justify-content:space-between;gap:10px';
          // 게임 id는 저장 기반 값이므로 innerHTML 대신 textContent 조립으로 경화
          const nameEl = document.createElement('span');
          nameEl.style.color = '#9aa3c7';
          nameEl.textContent = GAME_LABELS[id] || id;
          const valEl = document.createElement('span');
          valEl.textContent = wldText(s.games[id]);
          row.appendChild(nameEl);
          row.appendChild(valEl);
          list.appendChild(row);
        }
      }
      render();
      document.addEventListener('polaris:weekly', render); // 신규 이벤트 — 판 종료 직후 로비 복귀 시 즉시 갱신
      document.addEventListener('polaris:coins', render);
      host.appendChild(el);
      return el;
    },

    /* 전국 주간 랭킹 — P.cloud 리더보드 표시 (상위 20 · 내 순위 강조).
       자동 폴링 금지(서버 부하 방지) — 수동 갱신 버튼만, 10초 쿨다운.
       닉네임은 서버 저장 사용자 입력이므로 textContent 조립으로만 렌더 (weeklyPanel과 같은 경화) */
    leaderboardPanel(selector) {
      const host = document.querySelector(selector);
      if (!host) return null;
      const REFRESH_COOLDOWN_MS = 10000;
      let loading = false;
      let lastFetchAt = 0;
      const el = document.createElement('div');
      el.style.cssText = BOX_STYLE;
      el.innerHTML =
        '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:12px">' +
        '<div style="font-size:13px;letter-spacing:.15em;color:#9aa3c7">🏆 전국 주간 랭킹</div>' +
        '<button id="lb-refresh" style="background:#1e2440;color:#4fd1c5;border:1px solid #2a3154;border-radius:8px;' +
        'padding:5px 12px;font-size:12px;cursor:pointer;font-family:inherit">갱신</button></div>' +
        '<div id="lb-body" style="font-size:13px;color:#9aa3c7"></div>';
      const body = el.querySelector('#lb-body');
      const refreshBtn = el.querySelector('#lb-refresh');

      function setBusy(busy) {
        loading = busy;
        refreshBtn.disabled = busy;
        refreshBtn.style.opacity = busy ? '.5' : '1';
      }
      function guidance() {
        body.textContent = P.cloud.available()
          ? '계정에 로그인하면 전국 랭킹에 참여해요'
          : '클라우드가 비활성 상태예요 — 계정에 로그인하면 전국 랭킹에 참여해요';
      }
      function row(rank, name, level, exp, wins, highlight) {
        const r = document.createElement('div');
        r.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:8px;' +
          (highlight ? 'background:#242b4d;border:1px solid ' + GOLD + ';' : '');
        const rankEl = document.createElement('b');
        rankEl.style.cssText = 'width:30px;flex-shrink:0;color:' + (rank <= 3 ? GOLD : '#9aa3c7');
        rankEl.textContent = rank + '.';
        const nameEl = document.createElement('span');
        nameEl.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
          'color:' + (highlight ? GOLD : '#e8eaf6') + (highlight ? ';font-weight:700' : '');
        nameEl.textContent = name + (highlight ? ' (나)' : '');
        const metaEl = document.createElement('span');
        metaEl.style.cssText = 'flex-shrink:0;font-size:11.5px;color:#9aa3c7';
        metaEl.textContent = (level != null ? 'Lv.' + level + ' · ' : '') + exp + ' EXP · ' + wins + '승';
        r.appendChild(rankEl); r.appendChild(nameEl); r.appendChild(metaEl);
        return r;
      }
      function renderList(res) {
        body.innerHTML = '';
        body.style.color = '#e8eaf6';
        const head = document.createElement('div');
        head.style.cssText = 'font-size:11px;color:#9aa3c7;margin-bottom:6px';
        head.textContent = '지표: EXP (이번 주: ' + res.weekStart + ')';
        body.appendChild(head);
        for (const e of res.entries) {
          const mine = !!(res.me && res.me.rank === e.rank);
          body.appendChild(row(e.rank, e.name, e.level, e.exp, e.wins, mine));
        }
        // 내 순위가 상위 20 밖이면 목록 아래에 별도 강조 행
        if (res.me && res.me.rank > res.entries.length) {
          const dots = document.createElement('div');
          dots.style.cssText = 'text-align:center;color:#9aa3c7;padding:2px 0';
          dots.textContent = '⋯';
          body.appendChild(dots);
          body.appendChild(row(res.me.rank, res.me.name, null, res.me.exp, res.me.wins, true));
        }
        if (!res.entries.length && !res.me) {
          body.style.color = '#9aa3c7';
          body.appendChild(document.createTextNode('아직 이번 주 기록이 없어요'));
        }
      }
      function load() {
        lastFetchAt = Date.now();
        setBusy(true);
        body.style.color = '#9aa3c7';
        body.textContent = '랭킹을 불러오는 중…';
        P.cloud.leaderboard().then(function (res) {
          setBusy(false);
          if (!res.ok) {
            body.style.color = '#9aa3c7';
            body.textContent = res.code === 'WEEK_NOT_FOUND' ? '아직 이번 주 기록이 없어요'
              : res.code === 'NETWORK' ? '랭킹 서버에 연결할 수 없어요'
              : '랭킹을 불러오지 못했어요';
            return;
          }
          renderList(res);
        });
      }
      refreshBtn.addEventListener('click', function () {
        if (loading || !P.cloud.state().loggedIn) return;
        if (Date.now() - lastFetchAt < REFRESH_COOLDOWN_MS) return;   // 10초 쿨다운 — 연타 방지 (자동 폴링 없음)
        load();
      });
      // 로그인/로그아웃 전환 시 1회 갱신 (폴링 아님 — 상태 변화 대응)
      document.addEventListener('polaris:cloud', function () {
        if (P.cloud.state().loggedIn) load(); else { body.style.color = '#9aa3c7'; guidance(); }
      });
      if (P.cloud.state().loggedIn) load(); else guidance();
      host.appendChild(el);
      return el;
    }
  };
})();
