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
      return entry.id;
    },
    remove(id) {
      const lib = readLib().filter(g => g.id !== id);
      localStorage.setItem('suiji.kifu.v1', JSON.stringify(lib));
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
