/* ============================================================
   폴라리스 게임 포털 — 통합 런타임 (Phase 0)
   Exposes window.Polaris
   - profile : 닉네임 등 플레이어 신원 (localStorage 영속)
   - coins   : 도토리 잔액·지급·지출 (전 게임 공유 화폐)
   - daily   : 일일 보너스 (1일 1회)
   - header  : 포털 상단바 렌더 (로비·게임 공용)
   게임은 Polaris.coins.add/spend만 호출하면 경제에 참여한다.
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
      return DAILY_AMOUNT;
    }
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
})();
