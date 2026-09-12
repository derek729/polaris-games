/* ============================================================
   두마당 — online multiplayer client v2
   방 코드 · 초대 링크 · 자동 재접속(끊김 복구) · 시간제한 선택
   핵심 수는 net.move()로 전송 — 서버가 차례/착수/소유권 검증 후 릴레이
   Requires the relay server:  node server.cjs
   Exposes Suiji.net
   ============================================================ */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  const Suiji = window.Suiji;

  const PANEL_CSS = `
  .net-panel .net-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
  .net-panel .net-code-row { display:flex; gap:8px; align-items:center; margin-top:10px; }
  .net-panel .net-tc-row { display:flex; gap:8px; align-items:center; justify-content:space-between; margin-top:10px; font-size:12px; color:var(--ink-3); font-weight:600; }
  .net-panel input.net-code {
    flex:1; min-width:0; font-family:'JetBrains Mono',monospace; font-size:16px; font-weight:700;
    letter-spacing:0.3em; text-transform:uppercase; text-align:center;
    color:var(--ink); background:var(--paper-dark); border:1px solid var(--line);
    border-radius:8px; padding:9px 6px; outline:none;
  }
  .net-panel input.net-code:focus { border-color:var(--accent); }
  .net-panel .net-status { margin-top:10px; font-size:12.5px; color:var(--ink-2); line-height:1.6; min-height:20px; }
  .net-panel .net-status b.code { font-family:'JetBrains Mono',monospace; font-size:15px; letter-spacing:0.25em; color:var(--accent); }
  .net-panel .net-dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--ok); margin-right:6px; animation:liveBlink 1.6s ease-in-out infinite; }
  .net-panel .net-dot.wait { background:var(--gold); }
  .net-panel .net-dot.off { background:var(--ink-light); animation:none; }
  .net-panel .net-error { color:var(--accent); font-weight:600; }
  `;

  function wsUrl() {
    const secure = location.protocol === 'https:';
    return (secure ? 'wss://' : 'ws://') + location.host + '/ws';
  }

  const net = {
    ws: null,
    active: false,        // 매칭되어 대국 진행 중
    waiting: false,       // 방 생성 후 상대 대기 중
    reconnecting: false,  // 소켓 끊김 → 자동 재접속 시도 중
    userLeft: false,
    code: null,
    color: 0,
    game: null,
    attempts: 0,
    cb: null,
    els: null
  };

  let els = null;   // 패널 요소 캐시 (v2에서 선언 누락됐던 버그 수정)

  function sendRaw(obj) {
    if (net.ws && net.ws.readyState === 1) ws_send(net.ws, obj);
  }
  function ws_send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }

  /* ---------------- public API ---------------- */
  Suiji.net = {
    get active() { return net.active; },
    get code() { return net.code; },
    get color() { return net.color; },
    get reconnecting() { return net.reconnecting; },
    /** 서버 검증을 거치는 핵심 수 (착수/패스/항복/발사/정산) */
    move(data) { sendRaw({ t: 'move', data }); },
    /** 호스트: 대국 설정 + 시계 시작 (게스트에게 k:cfg로 릴레이됨) */
    init(data) { sendRaw({ t: 'init', data }); },
    /** 호스트: 끊김 복구용 상태 스냅샷 저장 */
    sendSync(data) { sendRaw({ t: 'sync', data }); },
    /** 일반 앱 메시지 릴레이 */
    send(data) { sendRaw({ t: 'msg', data }); },
    /** 재대국: 서버 상태 초기화 */
    resetServer() { sendRaw({ t: 'reset' }); },
    leave() {
      net.userLeft = true;
      net.reconnecting = false;
      sendRaw({ t: 'leave' });
      net.active = false; net.waiting = false; net.code = null; net.color = 0;
    },
    getTc() {
      if (!net.els || !net.els.tcSelect) return null;
      const v = net.els.tcSelect.value;
      if (!v) return null;
      const parts = v.split(':').map(Number);
      return { main: parts[0], byo: parts[1] };
    }
  };

  /* ---------------- socket lifecycle ---------------- */
  function connect(onReady) {
    let ws;
    try { ws = new WebSocket(wsUrl()); }
    catch (e) { onFail(); return; }
    net.ws = ws;
    let opened = false;
    ws.onopen = () => { opened = true; net.attempts = 0; net.reconnecting = false; onReady(); };
    ws.onclose = () => {
      if (opened && (net.active || net.waiting) && !net.userLeft) scheduleReconnect();
    };
    ws.onerror = () => { if (!opened) onFail(); };
    ws.onmessage = onMessage;
  }

  function onFail() {
    if (net.active || net.waiting) scheduleReconnect();
    else setStatus('off', '서버에 연결할 수 없습니다 — <span class="net-error">node server.cjs</span> 실행 필요');
  }

  function scheduleReconnect() {
    if (net.userLeft || net.reconnecting) return;
    net.reconnecting = true;
    net.attempts += 1;
    setStatus('wait', `연결 끊김 — 재접속 시도 중… <b class="code">${net.code || ''}</b> (${net.attempts}/30)`);
    if (net.attempts > 30) {
      net.reconnecting = false;
      const wasActive = net.active;
      net.active = false; net.waiting = false;
      if (net.cb && net.cb.onPeerLeft) net.cb.onPeerLeft(true, wasActive);
      return;
    }
    setTimeout(() => {
      if (net.userLeft) { net.reconnecting = false; return; }
      connect(() => {
        net.reconnecting = false;
        sendRaw({ t: 'join', code: net.code });
      });
    }, 1000);
  }

  /* ---------------- incoming messages ---------------- */
  function onMessage(e) {
    let m;
    try { m = JSON.parse(e.data); } catch (err) { return; }
    const cb = net.cb || {};
    switch (m.t) {
      case 'created':
        net.code = m.code; net.color = 1; net.waiting = true; net.attempts = 0;
        setStatus('wait', `방 생성 완료 — 코드 <b class="code">${m.code}</b><br>친구가 코드를 입력하거나 초대 링크로 접속하면 시작됩니다`);
        showWaiting(true);
        break;
      case 'joined':
        net.code = m.code; net.color = 2;
        net.active = true; net.waiting = false; net.attempts = 0; net.reconnecting = false;
        setStatus('on', `온라인 대전 중 · 방 <b class="code">${net.code}</b> · 나: 백`);
        showWaiting(false); setPlaying();
        if (cb.onStart) cb.onStart(2, false, !!m.snapshot);
        break;
      case 'peer':
        net.active = true; net.waiting = false;
        setStatus('on', `온라인 대전 중 · 방 <b class="code">${net.code}</b> · 나: ${net.color === 1 ? '흑' : '백'}`);
        showWaiting(false); setPlaying();
        if (cb.onPeerBack) cb.onPeerBack();
        if (cb.onStart) cb.onStart(1, true, !!m.snapshotExists);
        break;
      case 'clock':
        if (cb.onClock) cb.onClock(m.d);
        break;
      case 'timeout':
        if (cb.onTimeout) cb.onTimeout(m.color);
        break;
      case 'msg':
        if (net.active && cb.onRemote) cb.onRemote(m.data);
        break;
      case 'rematch':
        if (net.active && cb.onRematch) cb.onRematch();
        break;
      case 'peerLeft':
        if (cb.onPeerLeft) cb.onPeerLeft(false, !!m.rejoinable);
        if (net.color === 1 && m.rejoinable) {
          setStatus('wait', `상대 연결 끊김 — 같은 코드 <b class="code">${net.code}</b>로 재접속하면 대국이 이어집니다`);
          showWaiting(true);
        }
        break;
      case 'error':
        setStatus('off', `<span class="net-error">${m.msg || '오류'}</span>`);
        showWaiting(false);
        if (cb.onError) cb.onError(m.msg);
        break;
      case 'left':
        resetPanel();
        break;
    }
  }

  /* ---------------- panel UI ---------------- */
  function setStatus(dot, html) {
    if (!els) return;
    els.status.innerHTML = `<span class="net-dot ${dot}"></span><span>${html}</span>`;
  }
  function showWaiting(on) {
    els.leaveBtn.hidden = !on;
    els.createBtn.hidden = on;
    els.joinBtn.hidden = on;
    els.copyBtn.hidden = !on || !net.code;
  }
  function setPlaying() {
    showWaiting(false);
    els.leaveBtn.hidden = false;
  }
  function resetPanel() {
    net.active = false; net.waiting = false; net.code = null; net.color = 0;
    setStatus('off', '온라인 상대와 연결하려면 방을 만들거나 코드로 참가하세요');
    showWaiting(false);
    els.codeInput.value = '';
  }

  Suiji.net.createPanel = function (mount, opts) {
    if (!document.getElementById('suiji-net-css')) {
      const st = document.createElement('style');
      st.id = 'suiji-net-css';
      st.textContent = PANEL_CSS;
      document.head.appendChild(st);
    }
    net.game = opts.game;
    net.cb = opts;
    net.userLeft = false;

    const tcOptions = opts.timeControls || [[null, '시간 제한 없음']];
    mount.classList.add('net-panel');
    mount.innerHTML = `
      <div class="net-tc-row" hidden>
        <span>시간 제한</span>
        <select class="info-select net-tc">
          ${tcOptions.map(([v, label]) => `<option value="${v ? v.main + ':' + v.byo : ''}">${label}</option>`).join('')}
        </select>
      </div>
      <div class="net-code-row">
        <input class="net-code" maxlength="4" placeholder="CODE" aria-label="방 코드">
      </div>
      <div class="net-actions">
        <button class="btn primary net-create"><i class="fa-solid fa-plus"></i> 방 만들기</button>
        <button class="btn net-join"><i class="fa-solid fa-right-to-bracket"></i> 참가</button>
        <button class="btn net-copy" hidden title="초대 링크 복사"><i class="fa-solid fa-link"></i> 링크 복사</button>
        <button class="btn net-leave" hidden><i class="fa-solid fa-door-open"></i> 나가기</button>
      </div>
      <div class="net-status"><span class="net-dot off"></span><span>온라인 상대와 연결하려면 방을 만들거나 코드로 참가하세요</span></div>
    `;
    els = {
      tcRow: mount.querySelector('.net-tc-row'),
      tcSelect: mount.querySelector('.net-tc'),
      codeInput: mount.querySelector('.net-code'),
      createBtn: mount.querySelector('.net-create'),
      joinBtn: mount.querySelector('.net-join'),
      copyBtn: mount.querySelector('.net-copy'),
      leaveBtn: mount.querySelector('.net-leave'),
      status: mount.querySelector('.net-status')
    };
    net.els = els;

    // 코드 입력 Enter 처리만 로컬 리스너 (input 전용)
    els.codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });

    function doJoin() {
      const code = els.codeInput.value.trim().toUpperCase();
      if (code.length !== 4) { Suiji.toast('4자리 방 코드를 입력하세요'); return; }
      net.userLeft = false;
      net.attempts = 0;
      connect(() => {
        setStatus('wait', '방에 접속하는 중…');
        sendRaw({ t: 'join', code });
      });
    }
    Suiji.net._doJoin = doJoin;

    if (!Suiji.net._delegation) {
      Suiji.net._delegation = true;
      document.addEventListener('click', (e) => {
        const btn = e.target.closest ? e.target.closest('.net-create, .net-join, .net-leave, .net-copy') : null;
        if (!btn) return;
        if (btn.classList.contains('net-create')) {
          net.userLeft = false;
          net.attempts = 0;
          connect(() => {
            setStatus('wait', '방을 만드는 중…');
            sendRaw({ t: 'create', game: net.game });
            showWaiting(true);
          });
        } else if (btn.classList.contains('net-join')) {
          if (Suiji.net._doJoin) Suiji.net._doJoin();
        } else if (btn.classList.contains('net-leave')) {
          Suiji.net.leave();
          resetPanel();
          if (net.cb && net.cb.onLeave) net.cb.onLeave();
        } else if (btn.classList.contains('net-copy')) {
          const link = location.origin === 'null' ? null : location.origin + location.pathname + '?room=' + net.code;
          if (link && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(link).then(() => Suiji.toast('초대 링크가 복사되었습니다'));
          } else {
            Suiji.toast(`방 코드: ${net.code} — 친구에게 알려주세요`);
          }
        }
      }, true);
    }

    // 초대 링크 자동 참가
    const roomParam = new URLSearchParams(location.search).get('room');
    if (roomParam) {
      els.codeInput.value = roomParam.toUpperCase();
      setTimeout(doJoin, 400);
      history.replaceState(null, '', location.pathname);
    }
  };
})();
