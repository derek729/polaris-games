/* ============================================================
   폴라리스 게임 포털 — 통합 런타임 (Phase 1)
   Exposes window.Polaris
   - profile : 닉네임 등 플레이어 신원 (localStorage 영속)
   - coins   : 도토리 잔액·지급·지출 (전 게임 공유 화폐)
   - daily   : 일일 보너스 (1일 1회)
   - level   : 경험치·레벨 (게임 1판마다 획득)
   - missions: 오늘의 미션 3종 (날짜 시드 로테이션, 보상 수령)
   - settle  : 판 정산 — 승/무/패 판돈 정산 + 경험치 + 미션 진행
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

  /* ---------------- 판 정산 (승/무/패 → 판돈·경험치·미션) ---------------- */
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

  /* ---------------- 로비 위젯 (프로필 카드 · 미션 패널) ---------------- */
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
    }
  };
})();
