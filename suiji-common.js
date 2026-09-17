/* ============================================================
   두마당 — shared runtime (nav, toast, sound, stats, library)
   Exposes window.Suiji
   ============================================================ */
(function () {
  'use strict';
  if (typeof window === 'undefined') return; // Node (tests) — browser-only module
  const Suiji = (window.Suiji = {});

  /* ---------------- navigation ---------------- */
  const GAMES = [
    { id: 'index',   label: '도장',    href: 'suiji-index.html',   icon: 'fa-solid fa-landmark' },
    { id: 'go',      label: '바둑',    href: 'suiji-go.html',      icon: 'fa-solid fa-yin-yang' },
    { id: 'omok',    label: '오목',    href: 'suiji-omok.html',    icon: 'fa-solid fa-hashtag' },
    { id: 'alkkagi', label: '알까기',  href: 'suiji-alkkagi.html', icon: 'fa-solid fa-baseball' },
    { id: 'kifu',    label: '기보',    href: 'suiji-kifu.html',    icon: 'fa-solid fa-book-open' },
  ];
  Suiji.nav = function (active) {
    const links = GAMES.map(g =>
      `<a class="nav-link${g.id === active ? ' active' : ''}" href="${g.href}" title="${g.label}"><i class="${g.icon}"></i>${g.label}</a>`
    ).join('');
    const tabs = GAMES.map(g =>
      `<a class="tab${g.id === active ? ' active' : ''}" href="${g.href}"><i class="${g.icon}"></i><span>${g.label}</span></a>`
    ).join('');
    document.body.insertAdjacentHTML('afterbegin',
      `<nav class="topnav">
        <a class="nav-brand" href="suiji-index.html"><span class="seal">두</span><b>두마당</b></a>
        <div class="nav-links">${links}</div>
      </nav>
      <nav class="tabbar" aria-label="게임 이동">${tabs}</nav>`);
  };

  /* ---------------- toast ---------------- */
  let toastEl = null, toastTimer = null;
  Suiji.toast = function (message, ms = 3000) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  };

  /* ---------------- audio ---------------- */
  let audioCtx = null;
  function actx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return null; }
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function noiseBurst(c, opts) {
    const now = c.currentTime;
    const bufSize = Math.floor(c.sampleRate * opts.dur);
    const buffer = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      const t = i / bufSize;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * opts.decay);
    }
    const noise = c.createBufferSource();
    noise.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = opts.type || 'bandpass';
    filter.frequency.value = opts.freq;
    filter.Q.value = opts.q || 1.2;
    const gain = c.createGain();
    gain.gain.setValueAtTime(opts.vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + opts.dur);
    noise.connect(filter); filter.connect(gain); gain.connect(c.destination);
    noise.start(now);
  }
  function tone(c, opts) {
    const now = c.currentTime;
    const osc = c.createOscillator();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.from, now);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, now + opts.dur * 0.8);
    const gain = c.createGain();
    gain.gain.setValueAtTime(opts.vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + opts.dur);
    osc.connect(gain); gain.connect(c.destination);
    osc.start(now);
    osc.stop(now + opts.dur + 0.02);
  }

  const sound = {
    get enabled() { return localStorage.getItem('suiji.sound') !== 'off'; },
    set enabled(v) { localStorage.setItem('suiji.sound', v ? 'on' : 'off'); },
    toggle() { this.enabled = !this.enabled; return this.enabled; },
    _p(fn) { if (!this.enabled) return; const c = actx(); if (c) fn(c); },
    stone(intensity = 1) {
      this._p(c => {
        noiseBurst(c, { dur: 0.08, decay: 9, freq: 1700 + Math.random() * 400, q: 1.4, vol: 0.14 * intensity });
        tone(c, { from: 280 + Math.random() * 40, to: 110, dur: 0.18, vol: 0.22 * intensity });
      });
    },
    capture(n = 1) {
      for (let i = 0; i < Math.min(n, 4); i++) {
        setTimeout(() => this.stone(0.5 - i * 0.08), i * 70);
      }
    },
    clack(intensity = 1) {
      this._p(c => {
        noiseBurst(c, { dur: 0.05, decay: 14, freq: 2400 + Math.random() * 800, q: 2.2, vol: 0.2 * intensity });
        tone(c, { from: 620 + Math.random() * 160, to: 300, dur: 0.07, vol: 0.12 * intensity, type: 'triangle' });
      });
    },
    whoosh(power = 1) {
      this._p(c => {
        noiseBurst(c, { dur: 0.16, decay: 5, freq: 700 + power * 500, q: 0.8, vol: 0.1 + power * 0.08 });
        tone(c, { from: 160, to: 90, dur: 0.12, vol: 0.06, type: 'sine' });
      });
    },
    fall() {
      this._p(c => tone(c, { from: 520, to: 130, dur: 0.5, vol: 0.16, type: 'sine' }));
    },
    win() {
      this._p(c => {
        [523, 659, 784, 1047].forEach((f, i) =>
          setTimeout(() => tone(c, { from: f, dur: 0.35, vol: 0.14, type: 'triangle' }), i * 130));
      });
    },
    lose() {
      this._p(c => {
        [392, 330, 262].forEach((f, i) =>
          setTimeout(() => tone(c, { from: f, dur: 0.4, vol: 0.13, type: 'triangle' }), i * 160));
      });
    },
    badge() {
      // 업적 잠금 해제 전용 2음 상승 jingle (2-3)
      this._p(c => {
        tone(c, { from: 880, dur: 0.15, vol: 0.12, type: 'triangle' });
        setTimeout(() => tone(c, { from: 1320, dur: 0.15, vol: 0.12, type: 'triangle' }), 150);
      });
    }
  };
  Suiji.sound = sound;

  /* ---------------- stats ---------------- */
  function readStats() {
    try { return JSON.parse(localStorage.getItem('suiji.stats.v1')) || {}; }
    catch (e) { return {}; }
  }
  Suiji.stats = {
    get(game) {
      const s = readStats()[game] || { w: 0, l: 0, d: 0 };
      return s;
    },
    record(game, outcome) {
      const all = readStats();
      const s = all[game] || { w: 0, l: 0, d: 0 };
      if (outcome === 'w') s.w++; else if (outcome === 'l') s.l++; else s.d++;
      all[game] = s;
      localStorage.setItem('suiji.stats.v1', JSON.stringify(all));
      Suiji.badges.evaluate(); // 2-3 업적 판정 훅 — 3개 게임의 모든 판종료가 이곳을 지난다
      // 포털 경제 정산 (Phase 1) — 도토리 판돈 · 경험치 · 오늘의 미션 진행
      if (window.Polaris && Polaris.settle) {
        const r = Polaris.settle(game, outcome);
        if (r.delta > 0) Suiji.toast('판돈 정산 🌰+' + r.delta + '  ·  EXP +' + r.exp + (r.levelUp ? '  ⭐ Lv.' + r.level + ' 달성!' : ''));
        else if (r.delta < 0) Suiji.toast('판돈 정산 🌰' + r.delta + '  ·  EXP +' + r.exp);
        else Suiji.toast('무승부 정산  ·  EXP +' + r.exp);
      }
    },
    text(game) {
      const s = this.get(game);
      if (s.w + s.l + s.d === 0) return '—';
      return `${s.w}W · ${s.l}L${s.d ? ` · ${s.d}D` : ''}`;
    }
  };

  /* ---------------- kifu library ---------------- */
  function readLib() {
    try { return JSON.parse(localStorage.getItem('suiji.kifu.v1')) || []; }
    catch (e) { return []; }
  }
  Suiji.kifu = {
    list() { return readLib(); },
    get(id) { return readLib().find(g => g.id === id) || null; },
    save(entry) {
      const lib = readLib();
      if (!entry.id) entry.id = 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const idx = lib.findIndex(g => g.id === entry.id);
      if (idx >= 0) lib[idx] = entry; else lib.unshift(entry);
      if (lib.length > 40) lib.length = 40; // cap storage
      localStorage.setItem('suiji.kifu.v1', JSON.stringify(lib));
      Suiji.badges.evaluate(); // 2-3 업적 판정 훅 (기보 수집가)
      return entry.id;
    },
    remove(id) {
      const lib = readLib().filter(g => g.id !== id);
      localStorage.setItem('suiji.kifu.v1', JSON.stringify(lib));
    }
  };

  /* ---------------- move grading (2-1 수 품질 판정) ---------------- */
  // 판정 문턱값 — 기보 화면 analysePly()와 동일 값을 단일 출처로 사용 (Δ 초과분 기준)
  Suiji.GRADE_THRESHOLDS = { best: 2.5, good: 8, lax: 20 };

  // game.history의 마지막 착수를 AI 근사로 채점한다. 엔진 수정 없이 '착수 이전' 국면을
  // 기보 gameAt()과 동일 방식으로 재구성한다 (※ koPoint 미복원 — 기보와 같은 알려진 근사).
  // 판정 대상이 없거나 계산이 실패하면 null — 호출부는 기존 문구를 그대로 유지한다.
  Suiji.gradeLastMove = function (game) {
    try {
      if (!game || typeof window === 'undefined' || !window.SuijiEngine || !window.SuijiEngine.GoAI) return null;
      const hist = game.history;
      if (!hist.length || hist[hist.length - 1].type !== 'move') return null;
      const last = hist[hist.length - 1];

      const g = new window.SuijiEngine.GoGame(game.size, game.ruleset, game.komi, 0);
      const prev = hist.length >= 2 ? hist[hist.length - 2] : null;
      g.board = prev && prev.boardSnapshot
        ? prev.boardSnapshot.map(r => [...r])
        : Array(game.size).fill(0).map(() => Array(game.size).fill(0));
      g.captures = prev && prev.captures ? { ...prev.captures } : { 1: 0, 2: 0 };
      g.history = hist.slice(0, hist.length - 1); // moveCount 정합 — evaluateMove의 국면 판정용
      g.currentPlayer = last.color;

      const ai = new window.SuijiEngine.GoAI(g, 2);
      // topMoves는 어차피 전 후보를 레벨2 가중으로 평가·정렬하므로 개수에 따른 비용 차가 없다 —
      // 둔 수의 정확한 delta/rank를 위해 전체 목록을 받는다 (기보 analysePly와 동일 산정)
      const cands = ai.topMoves(last.color, game.size * game.size);
      const best = cands[0];
      if (!best) return null;
      const played = cands.find(c => c.x === last.x && c.y === last.y);
      if (!played) return null; // 재구성 판에서 착수점이 후보가 아님(눈 채우기 등) — 판정 보류
      const delta = best.score - played.score;
      const rank = cands.indexOf(played) + 1;
      const T = Suiji.GRADE_THRESHOLDS;
      const grade = (rank === 1 || delta <= T.best) ? 'best'
                  : delta <= T.good ? 'good'
                  : delta <= T.lax ? 'lax' : 'bad';
      return {
        grade, delta, rank,
        best: { x: best.x, y: best.y },
        bestCoord: Suiji.coordName(best.x, best.y, game.size)
      };
    } catch (e) {
      return null; // 어떤 실패에도 기존 표시를 깨지 않는다
    }
  };

  /* ---------------- badges (2-3 업적) ---------------- */
  const BADGES_KEY = 'suiji.badges.v1';
  function readBadges() {
    try {
      const b = JSON.parse(localStorage.getItem(BADGES_KEY));
      if (b && typeof b === 'object' && b.unlocked) return b;
    } catch (e) { /* 손상된 저장소 — 새로 발급 */ }
    return { version: 1, unlocked: {} };
  }
  function writeBadges(b) {
    try { localStorage.setItem(BADGES_KEY, JSON.stringify(b)); }
    catch (e) { /* 스토리지 차단 — 업적만 조용히 비활성 (게임은 무영향) */ }
  }
  function badgeTotalW(s) {
    return ['go', 'omok', 'alkkagi'].reduce((n, g) => n + (s[g] ? s[g].w || 0 : 0), 0);
  }
  function badgeTotalGames(s) {
    return ['go', 'omok', 'alkkagi'].reduce((n, g) => {
      const t = s[g] || { w: 0, l: 0, d: 0 };
      return n + (t.w || 0) + (t.l || 0) + (t.d || 0);
    }, 0);
  }

  Suiji.badges = {
    // tier: 1=입문(잉크) · 2=중수(금) · 3=고수(홍) — 전부 기존 stats/kifu 데이터만 사용
    DEFS: [
      { id: 'first-win-any', name: '첫 승',         desc: '두마당에서 처음으로 이겼다', icon: 'fa-solid fa-flag-checkered', tier: 1, check: s => badgeTotalW(s) >= 1 },
      { id: 'first-go',      name: '흑백의 시작',   desc: '바둑 첫 승',                 icon: 'fa-solid fa-yin-yang',       tier: 1, check: s => !!(s.go && s.go.w >= 1) },
      { id: 'first-omok',    name: '다섯 줄의 승부', desc: '오목 첫 승',                icon: 'fa-solid fa-hashtag',        tier: 1, check: s => !!(s.omok && s.omok.w >= 1) },
      { id: 'first-alkkagi', name: '톡 쳤더니',     desc: '알까기 첫 승',               icon: 'fa-solid fa-baseball',       tier: 1, check: s => !!(s.alkkagi && s.alkkagi.w >= 1) },
      { id: 'win10',         name: '유단자',        desc: '누적 10승',                  icon: 'fa-solid fa-medal',          tier: 2, check: s => badgeTotalW(s) >= 10 },
      { id: 'win30',         name: '두마당 고수',   desc: '누적 30승',                  icon: 'fa-solid fa-trophy',         tier: 3, check: s => badgeTotalW(s) >= 30 },
      { id: 'games50',       name: '단골손님',      desc: '누적 50판',                  icon: 'fa-solid fa-mug-hot',        tier: 2, check: s => badgeTotalGames(s) >= 50 },
      { id: 'alkkagi5',      name: '낙법 고수',     desc: '알까기 누적 5승',            icon: 'fa-solid fa-baseball',       tier: 2, check: s => !!(s.alkkagi && s.alkkagi.w >= 5) },
      { id: 'kifu3',         name: '기보 수집가',   desc: '기보 3판 저장',              icon: 'fa-solid fa-book-open',      tier: 2, check: (s, kifuCount) => kifuCount >= 3 }
    ],
    get() {
      const store = readBadges();
      return this.DEFS.map(d => ({
        ...d,
        unlocked: !!store.unlocked[d.id],
        at: store.unlocked[d.id] || null
      }));
    },
    unlockedCount() {
      return this.get().filter(b => b.unlocked).length;
    },
    // stats+kifu를 다시 읽어 미잠금 조건 충족분을 unlock한다.
    // 새 잠금은 900ms 뒤 토스트+전용 효과음 (판종료 win/lose 사운드와 겹치지 않게 — 타이밍 규칙).
    // 여러 개가 동시 달성되면 이름을 나열해 토스트 1회로 묶는다. opts.silent로 연출 생략.
    evaluate(opts = {}) {
      let stats = {}, kifuCount = 0;
      try { stats = readStats(); } catch (e) { /* 읽기 실패 — 빈 통계 */ }
      try { kifuCount = Suiji.kifu.list().length; } catch (e) { /* 읽기 실패 */ }
      const store = readBadges();
      const fresh = [];
      for (const d of this.DEFS) {
        if (store.unlocked[d.id]) continue;
        let ok = false;
        try { ok = !!d.check(stats, kifuCount); } catch (e) { ok = false; }
        if (ok) { store.unlocked[d.id] = Date.now(); fresh.push(d); }
      }
      if (fresh.length) {
        writeBadges(store);
        if (!opts.silent) {
          const names = fresh.map(d => d.name).join(', ');
          setTimeout(() => {
            Suiji.toast(fresh.length === 1 ? `업적 달성 — ${names}` : `업적 달성 ${fresh.length}개 — ${names}`, 4000);
            Suiji.sound.badge();
          }, 900);
        }
      }
      return fresh;
    },
    // 도장 페이지용 렌더 헬퍼 — 잠금/해금 칩 가로 스크롤 스트립
    render(el) {
      if (!el) return;
      el.innerHTML = '';
      this.get().forEach(b => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `badge-chip tier-${b.tier} ${b.unlocked ? 'unlocked' : 'locked'}`;
        if (b.unlocked) {
          const d = new Date(b.at);
          chip.title = `${b.desc} · ${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
        } else {
          chip.title = b.desc;
        }
        chip.innerHTML = `<span class="badge-icon"><i class="${b.unlocked ? b.icon : 'fa-solid fa-lock'}"></i></span>` +
                         `<span class="badge-name">${b.name}</span>`;
        if (!b.unlocked) chip.addEventListener('click', () => Suiji.toast(b.desc)); // 잠금 힌트
        el.appendChild(chip);
      });
    }
  };

  /* ---------------- misc ---------------- */
  Suiji.uid = function () {
    return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };
  Suiji.coordName = function (x, y, size) {
    const letters = 'ABCDEFGHJKLMNOPQRST'.split('');
    return `${letters[x]}${size - y}`;
  };

  /* ---------------- PWA / install ---------------- */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* file:// or blocked — ignore */ });
    });
  }

  let installEvent = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e;
    window.dispatchEvent(new CustomEvent('suiji:installable'));
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    window.dispatchEvent(new CustomEvent('suiji:installed'));
  });

  Suiji.canInstall = function () { return !!installEvent; };
  Suiji.installApp = async function () {
    if (!installEvent) return false;
    installEvent.prompt();
    const choice = await installEvent.userChoice;
    installEvent = null;
    return choice && choice.outcome === 'accepted';
  };
  Suiji.isStandalone = function () {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.matchMedia('(display-mode: minimal-ui)').matches ||
           window.navigator.standalone === true;
  };
  Suiji.isIOS = function () {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  };
})();
