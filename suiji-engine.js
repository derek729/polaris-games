/* ============================================================
   두마당 — shared Go engine
   GoGame (rules + scoring), GoAI, BoardRenderer, SGF I/O.
   Exposes window.SuijiEngine
   ============================================================ */
(function () {
  'use strict';

  /* ============================================
     AI 생성 픽셀아트 바둑돌 스킨
     로드 성공 시 돌 렌더링에 사용, 실패 시 기존 그라디언트로 그림
     ============================================ */
  const SUIJI_STONE_SPRITES = { black: new Image(), white: new Image() };
  SUIJI_STONE_SPRITES.black.src = 'game-assets/suiji/stone-black.png';
  SUIJI_STONE_SPRITES.white.src = 'game-assets/suiji/stone-white.png';

  /* ============================================
     착수 효과음 (hit.wav — 파일 없으면 조용히 무시)
     ============================================ */
  let lastStoneSfx = 0;
  function playStoneSfx() {
    try {
      // 페이지 공통 사운드 설정(suiji-common)이 꺼져 있으면 무시
      if (typeof window !== 'undefined' && window.Suiji && window.Suiji.sound && !window.Suiji.sound.enabled) return;
      // SGF 재생 등 짧은 시간 안에 여러 수가 놓일 때 연타 방지
      const now = Date.now();
      if (now - lastStoneSfx < 80) return;
      lastStoneSfx = now;
      const audio = new Audio('game-assets/sfx/hit.wav');
      audio.volume = 0.35;
      audio.playbackRate = 1.6;
      const p = audio.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* 사운드 미지원 환경 */ }
  }

  /* ============================================
     GO GAME LOGIC
     ============================================ */
  class GoGame {
    constructor(size = 19, ruleset = 'korean', komi = 6.5, handicap = 0) {
      this.size = size;
      this.ruleset = ruleset;
      this.komi = komi;
      this.handicap = handicap;
      this.reset();
    }

    reset() {
      this.board = Array(this.size).fill(0).map(() => Array(this.size).fill(0));
      this.currentPlayer = this.handicap >= 2 ? 2 : 1; // with handicap, White opens
      this.history = [];
      this.captures = { 1: 0, 2: 0 };
      this.koPoint = null;
      this.lastMove = null;
      this.consecutivePasses = 0;
      this.gameOver = false;
      this.winner = null;
      this.resignedBy = null;
      this.scoringMode = false;
      this.finalScore = null;
      this.startTime = Date.now();
    }

    handicapPoints(n) {
      const s = this.size;
      const low = s >= 13 ? 3 : 2;
      const high = s - 1 - low;
      const mid = (s - 1) / 2;
      const TL = [low, low], TR = [high, low], BL = [low, high], BR = [high, high];
      const C = [mid, mid], L = [low, mid], R = [high, mid], T = [mid, low], B = [mid, high];
      switch (n) {
        case 2: return [TR, BL];
        case 3: return [TR, BL, TL];
        case 4: return [TL, TR, BL, BR];
        case 5: return [TL, TR, BL, BR, C];
        case 6: return [TL, TR, BL, BR, L, R];
        case 7: return [TL, TR, BL, BR, L, R, C];
        case 8: return [TL, TR, BL, BR, L, R, T, B];
        case 9: return [TL, TR, BL, BR, L, R, T, B, C];
        default: return [];
      }
    }

    setupHandicap() {
      if (this.handicap < 2) return;
      for (const [x, y] of this.handicapPoints(this.handicap)) {
        this.board[x][y] = 1;
      }
      this.history.push({
        type: 'setup', color: 1,
        boardSnapshot: this.board.map(r => [...r]),
        captures: { 1: 0, 2: 0 }
      });
    }

    neighbors(x, y) {
      const r = [];
      if (x > 0) r.push([x - 1, y]);
      if (x < this.size - 1) r.push([x + 1, y]);
      if (y > 0) r.push([x, y - 1]);
      if (y < this.size - 1) r.push([x, y + 1]);
      return r;
    }

    findGroup(x, y, board) {
      if (!board) board = this.board;
      const color = board[x][y];
      if (color === 0) return null;
      const stones = [];
      const liberties = new Set();
      const visited = new Set();
      const stack = [[x, y]];
      while (stack.length) {
        const [cx, cy] = stack.pop();
        const key = cx * this.size + cy;
        if (visited.has(key)) continue;
        visited.add(key);
        stones.push([cx, cy]);
        for (const [nx, ny] of this.neighbors(cx, cy)) {
          if (board[nx][ny] === 0) liberties.add(nx * this.size + ny);
          else if (board[nx][ny] === color) stack.push([nx, ny]);
        }
      }
      return { stones, liberties: liberties.size, color };
    }

    tryPlace(x, y, color, board) {
      if (!board) board = this.board;
      if (board[x][y] !== 0) return { valid: false, reason: 'occupied' };
      const newBoard = board.map(r => [...r]);
      newBoard[x][y] = color;
      const opp = color === 1 ? 2 : 1;
      const captured = [];
      for (const [nx, ny] of this.neighbors(x, y)) {
        if (newBoard[nx][ny] === opp) {
          const grp = this.findGroup(nx, ny, newBoard);
          if (grp.liberties === 0) {
            for (const [sx, sy] of grp.stones) {
              if (newBoard[sx][sy] !== 0) {
                newBoard[sx][sy] = 0;
                captured.push([sx, sy]);
              }
            }
          }
        }
      }
      const ownGrp = this.findGroup(x, y, newBoard);
      if (ownGrp.liberties === 0) return { valid: false, reason: 'suicide' };
      return { valid: true, newBoard, captured, ownLiberties: ownGrp.liberties };
    }

    canPlace(x, y, color) {
      if (this.gameOver || this.scoringMode) return false;
      if (this.board[x][y] !== 0) return false;
      if (this.koPoint && this.koPoint[0] === x && this.koPoint[1] === y && this.currentPlayer === color) return false;
      const r = this.tryPlace(x, y, color);
      return r.valid;
    }

    place(x, y) {
      if (this.gameOver || this.scoringMode) return { valid: false };
      const color = this.currentPlayer;
      if (this.koPoint && this.koPoint[0] === x && this.koPoint[1] === y) return { valid: false, reason: 'ko' };
      const result = this.tryPlace(x, y, color);
      if (!result.valid) return result;

      this.board = result.newBoard;
      this.captures[color] += result.captured.length;

      if (result.captured.length === 1 && result.ownLiberties === 1) {
        const ownGrp = this.findGroup(x, y);
        if (ownGrp.stones.length === 1) this.koPoint = result.captured[0];
        else this.koPoint = null;
      } else {
        this.koPoint = null;
      }

      this.lastMove = { x, y, color };
      this.consecutivePasses = 0;
      this.history.push({
        type: 'move', x, y, color,
        captured: result.captured,
        boardSnapshot: this.board.map(r => [...r]),
        captures: { ...this.captures }
      });
      this.currentPlayer = color === 1 ? 2 : 1;
      playStoneSfx(); // 실제 착수에만 재생 (무르기/호버/패스는 소리 없음)
      return { valid: true, captured: result.captured };
    }

    pass() {
      if (this.gameOver || this.scoringMode) return;
      const color = this.currentPlayer;
      this.consecutivePasses++;
      this.history.push({
        type: 'pass', color,
        boardSnapshot: this.board.map(r => [...r]),
        captures: { ...this.captures }
      });
      this.lastMove = null;
      this.koPoint = null;
      if (this.consecutivePasses >= 2) {
        this.scoringMode = true;
      } else {
        this.currentPlayer = color === 1 ? 2 : 1;
      }
    }

    resign() {
      this.gameOver = true;
      const color = this.currentPlayer;
      this.winner = color === 1 ? 2 : 1;
      this.resignedBy = color;
      this.history.push({
        type: 'resign', color,
        boardSnapshot: this.board.map(r => [...r]),
        captures: { ...this.captures }
      });
    }

    popMoves(count = 2) {
      for (let i = 0; i < count && this.history.length > 0; i++) this.history.pop();
      this.consecutivePasses = 0;
      this.koPoint = null;
      this.scoringMode = false;
      const last = this.history[this.history.length - 1];
      if (last) {
        this.board = last.boardSnapshot.map(r => [...r]);
        this.captures = { ...last.captures };
        this.currentPlayer = last.color === 1 ? 2 : 1;
        this.lastMove = last.type === 'move' ? { x: last.x, y: last.y, color: last.color } : null;
      } else {
        this.board = Array(this.size).fill(0).map(() => Array(this.size).fill(0));
        this.captures = { 1: 0, 2: 0 };
        this.currentPlayer = this.handicap >= 2 ? 2 : 1;
        this.lastMove = null;
      }
    }

    resumePlay() {
      if (!this.scoringMode) return;
      this.history.pop();
      this.history.pop();
      this.scoringMode = false;
      this.consecutivePasses = 0;
      this.koPoint = null;
      this.finalScore = null;
      const last = this.history[this.history.length - 1];
      if (last) {
        this.board = last.boardSnapshot.map(r => [...r]);
        this.captures = { ...last.captures };
        this.currentPlayer = last.color === 1 ? 2 : 1;
        this.lastMove = last.type === 'move' ? { x: last.x, y: last.y, color: last.color } : null;
      } else {
        this.board = Array(this.size).fill(0).map(() => Array(this.size).fill(0));
        this.captures = { 1: 0, 2: 0 };
        this.currentPlayer = this.handicap >= 2 ? 2 : 1;
        this.lastMove = null;
      }
    }

    calculateTerritory(board) {
      if (!board) board = this.board;
      const influence = Array(this.size).fill(0).map(() => Array(this.size).fill(0));
      const decay = 0.42;
      for (let x = 0; x < this.size; x++) {
        for (let y = 0; y < this.size; y++) {
          if (board[x][y] !== 0) {
            const sign = board[x][y] === 1 ? 1 : -1;
            for (let dx = -4; dx <= 4; dx++) {
              for (let dy = -4; dy <= 4; dy++) {
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && nx < this.size && ny >= 0 && ny < this.size) {
                  const dist = Math.abs(dx) + Math.abs(dy);
                  if (dist > 0 && dist <= 4) influence[nx][ny] += sign * Math.pow(decay, dist);
                }
              }
            }
          }
        }
      }
      let bT = 0, wT = 0, bS = 0, wS = 0;
      for (let x = 0; x < this.size; x++) {
        for (let y = 0; y < this.size; y++) {
          if (board[x][y] === 1) bS++;
          else if (board[x][y] === 2) wS++;
          else {
            if (influence[x][y] > 0.15) bT++;
            else if (influence[x][y] < -0.15) wT++;
          }
        }
      }
      return {
        influence, blackTerritory: bT, whiteTerritory: wT,
        blackStones: bS, whiteStones: wS,
        blackArea: bS + bT, whiteArea: wS + wT + this.komi
      };
    }

    computeFinalScore(deadList) {
      const n = this.size;
      const board = this.board.map(r => [...r]);
      const dead = new Set((deadList || []).map(([x, y]) => x * n + y));
      let deadB = 0, deadW = 0;
      dead.forEach(k => {
        const x = Math.floor(k / n), y = k % n;
        const v = board[x][y];
        if (v === 1) deadB++; else if (v === 2) deadW++;
        board[x][y] = 0;
      });

      const visited = new Set();
      let bT = 0, wT = 0, dame = 0;
      for (let x = 0; x < n; x++) {
        for (let y = 0; y < n; y++) {
          if (board[x][y] !== 0) continue;
          const k0 = x * n + y;
          if (visited.has(k0)) continue;
          const stack = [[x, y]];
          visited.add(k0);
          let sz = 0, tB = false, tW = false;
          while (stack.length) {
            const [cx, cy] = stack.pop();
            sz++;
            for (const [nx, ny] of this.neighbors(cx, cy)) {
              const v = board[nx][ny];
              if (v === 0) {
                const nk = nx * n + ny;
                if (!visited.has(nk)) { visited.add(nk); stack.push([nx, ny]); }
              } else if (v === 1) tB = true;
              else tW = true;
            }
          }
          if (tB && !tW) bT += sz;
          else if (tW && !tB) wT += sz;
          else dame += sz;
        }
      }

      let aliveB = 0, aliveW = 0;
      for (let x = 0; x < n; x++) {
        for (let y = 0; y < n; y++) {
          if (board[x][y] === 1) aliveB++;
          else if (board[x][y] === 2) aliveW++;
        }
      }

      const prisonerB = this.captures[1] + deadW;
      const prisonerW = this.captures[2] + deadB;

      let bScore, wScore;
      if (this.ruleset === 'korean') {
        bScore = bT + prisonerB;
        wScore = wT + prisonerW + this.komi;
      } else {
        bScore = aliveB + bT;
        wScore = aliveW + wT + this.komi;
      }
      const winner = bScore > wScore ? 1 : (wScore > bScore ? 2 : 0);
      return {
        bTerr: bT, wTerr: wT, dame, deadB, deadW,
        aliveB, aliveW, prisonerB, prisonerW,
        bScore, wScore, winner,
        margin: Math.abs(bScore - wScore)
      };
    }

    finalize(deadList) {
      this.finalScore = this.computeFinalScore(deadList);
      this.gameOver = true;
      this.scoringMode = false;
      this.winner = this.finalScore.winner;
      return this.finalScore;
    }
  }

  /* ============================================
     AI
     ============================================ */
  class GoAI {
    constructor(game, level = 2) {
      this.game = game;
      this.level = level;
    }
    setLevel(level) { this.level = level; }

    isOwnEye(x, y, color) {
      let orthoOwn = 0, orthoTotal = 0;
      for (const [nx, ny] of this.game.neighbors(x, y)) {
        orthoTotal++;
        if (this.game.board[nx][ny] === color) orthoOwn++;
      }
      if (orthoTotal === 0 || orthoOwn < orthoTotal) return false;
      const diags = [[x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1], [x + 1, y + 1]];
      let diagOpp = 0, diagEdge = 0;
      for (const [dx, dy] of diags) {
        if (dx < 0 || dx >= this.game.size || dy < 0 || dy >= this.game.size) diagEdge++;
        else if (this.game.board[dx][dy] !== color && this.game.board[dx][dy] !== 0) diagOpp++;
      }
      if (diagOpp === 0) return true;
      return diagEdge > 0 && diagOpp === 0;
    }

    getCandidates() {
      const cands = [];
      const player = this.game.currentPlayer;
      for (let x = 0; x < this.game.size; x++) {
        for (let y = 0; y < this.game.size; y++) {
          if (this.game.board[x][y] !== 0) continue;
          if (this.game.koPoint && this.game.koPoint[0] === x && this.game.koPoint[1] === y) continue;
          const r = this.game.tryPlace(x, y, player);
          if (r.valid && !this.isOwnEye(x, y, player)) cands.push({ x, y, ...r });
        }
      }
      return cands;
    }

    // Evaluate a candidate for `color` (works for either side — used by hint & kifu analysis)
    evaluateMove(move, color) {
      const opp = color === 1 ? 2 : 1;
      const size = this.game.size;
      let score = 0;
      let intent = '';
      let intentType = '';

      if (move.captured.length > 0) {
        score += move.captured.length * 38;
        intent = move.captured.length > 1
          ? `Captured ${move.captured.length} stones in a decisive exchange`
          : `Captured one stone, gaining material advantage`;
        intentType = 'capture';
      }

      const distEdge = Math.min(move.x, move.y, size - 1 - move.x, size - 1 - move.y);
      if (distEdge === 0) score -= 4;

      let saved = 0;
      for (const [nx, ny] of this.game.neighbors(move.x, move.y)) {
        if (this.game.board[nx][ny] === color) {
          const g = this.game.findGroup(nx, ny);
          if (g.liberties === 1) saved += g.stones.length;
        }
      }
      if (saved > 0) {
        score += saved * 26;
        if (!intent) {
          intent = saved > 2
            ? `Rescued a group of ${saved} stones from capture`
            : `Defended stones under immediate threat`;
          intentType = 'defense';
        }
      }

      let atari = 0;
      for (const [nx, ny] of this.game.neighbors(move.x, move.y)) {
        if (move.newBoard[nx][ny] === opp) {
          const g = this.game.findGroup(nx, ny, move.newBoard);
          if (g.liberties === 1) atari += g.stones.length;
        }
      }
      if (atari > 0) {
        score += atari * 14;
        if (!intent) {
          intent = `Put opponent into atari, applying pressure`;
          intentType = 'attack';
        }
      }

      if (move.ownLiberties === 1) score -= 12;
      if (move.ownLiberties >= 3) score += 4;

      let nearOwn = 0, nearOpp = 0;
      for (const [nx, ny] of this.game.neighbors(move.x, move.y)) {
        if (this.game.board[nx][ny] === color) nearOwn++;
        else if (this.game.board[nx][ny] === opp) nearOpp++;
      }

      const moveCount = this.game.history.length;

      if (moveCount < 8) {
        const hoshi = size === 9 ? [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]] :
                      size === 13 ? [[3, 3], [3, 9], [9, 3], [9, 9], [6, 6]] :
                      [[3, 3], [3, 9], [3, 15], [9, 3], [9, 9], [9, 15], [15, 3], [15, 9], [15, 15]];
        for (const [hx, hy] of hoshi) {
          if (Math.abs(move.x - hx) <= 1 && Math.abs(move.y - hy) <= 1) {
            score += 14;
            if (!intent) {
              const cc = size >= 13 ? 3 : 2;
              const cornerType = (move.x <= cc && move.y <= cc) ? 'upper-left' :
                                 (move.x >= size - 1 - cc && move.y <= cc) ? 'upper-right' :
                                 (move.x <= cc && move.y >= size - 1 - cc) ? 'lower-left' : 'lower-right';
              const nearCenter = Math.abs(move.x - (size - 1) / 2) <= 1 && Math.abs(move.y - (size - 1) / 2) <= 1;
              intent = nearCenter ? `Taking the tengen — the center point` :
                       `Securing the ${cornerType} corner — a traditional opening`;
              intentType = nearCenter ? 'center' : 'corner';
            }
          }
        }
      } else if (moveCount < 20) {
        if (distEdge >= 2 && distEdge <= 3) {
          score += 4;
          if (!intent && nearOwn >= 1) {
            intent = `Extending along the side to build framework`;
            intentType = 'extension';
          }
        }
      }

      if (nearOwn >= 2) {
        score += 4;
        if (!intent) { intent = `Connecting stones into a unified formation`; intentType = 'connect'; }
      }

      if (this.level >= 2) {
        const tBefore = this.game.calculateTerritory();
        const tAfter = this.game.calculateTerritory(move.newBoard);
        const ownBefore = color === 1 ? tBefore.blackArea : tBefore.whiteArea;
        const ownAfter = color === 1 ? tAfter.blackArea : tAfter.whiteArea;
        const oppBefore = color === 1 ? tBefore.whiteArea : tBefore.blackArea;
        const oppAfter = color === 1 ? tAfter.whiteArea : tAfter.blackArea;
        const ownGain = ownAfter - ownBefore;
        const oppLoss = oppBefore - oppAfter;

        score += ownGain * 2 + oppLoss * 1.5;

        if (!intent) {
          if (oppLoss > 1.5) {
            intent = `Invasion — reducing opponent's sphere of influence`;
            intentType = 'invasion';
          } else if (ownGain > 1.5) {
            intent = `Expanding influence across the board`;
            intentType = 'expansion';
          }
        }
      }

      if (nearOpp >= 1 && this.level >= 2 && !intent) {
        if (distEdge >= 2) {
          intent = `Approaching opponent's position to apply pressure`;
          intentType = 'approach';
        }
      }

      if (this.isOwnEye(move.x, move.y, color)) score -= 200;

      const randomness = this.level === 1 ? 26 : this.level === 2 ? 8 : 3;
      score += (Math.random() - 0.5) * randomness;

      if (this.level === 3) {
        let oppBestCapture = 0;
        const R = 2;
        const x0 = Math.max(0, move.x - R), x1 = Math.min(size - 1, move.x + R);
        const y0 = Math.max(0, move.y - R), y1 = Math.min(size - 1, move.y + R);
        for (let ox = x0; ox <= x1; ox++) {
          for (let oy = y0; oy <= y1; oy++) {
            if (move.newBoard[ox][oy] !== 0) continue;
            const oRes = this.game.tryPlace(ox, oy, opp, move.newBoard);
            if (oRes.valid && oRes.captured.length > oppBestCapture) {
              oppBestCapture = oRes.captured.length;
            }
          }
        }
        score -= oppBestCapture * 22;
      }

      if (!intent) {
        if (nearOwn >= 1) { intent = `Strengthening the local position`; intentType = 'strengthen'; }
        else if (nearOpp >= 1) { intent = `Engaging the opponent's stones`; intentType = 'engage'; }
        else if (distEdge <= 1) { intent = `Securing the edge territory`; intentType = 'edge'; }
        else { intent = `Building thickness in the center`; intentType = 'thickness'; }
      }

      return { score, intent, intentType };
    }

    selectMove() {
      const cands = this.getCandidates();
      if (cands.length === 0) return { pass: true, intent: 'The board is full — no legal moves remain.' };

      const evaluated = cands.map(c => ({ ...c, ...this.evaluateMove(c, this.game.currentPlayer) }));
      evaluated.sort((a, b) => b.score - a.score);

      const color = this.game.currentPlayer;
      const best = evaluated[0];
      const totalPts = this.game.size * this.game.size;
      const lastEntry = this.game.history[this.game.history.length - 1];
      const oppPassed = lastEntry && lastEntry.type === 'pass';
      const late = this.game.history.length > totalPts * 0.5;

      if (late || oppPassed) {
        const tBefore = this.game.calculateTerritory();
        const tAfter = this.game.calculateTerritory(best.newBoard);
        const ownB = color === 1 ? tBefore.blackArea : tBefore.whiteArea;
        const ownA = color === 1 ? tAfter.blackArea : tAfter.whiteArea;
        const oppB = color === 1 ? tBefore.whiteArea : tBefore.blackArea;
        const oppA = color === 1 ? tAfter.whiteArea : tAfter.blackArea;
        const swing = (ownA - ownB) + (oppB - oppA);

        if (swing < 1.5 && ownA > oppA) {
          return { pass: true, intent: 'The AI passed — no profitable move remains for it.' };
        }
        if (oppPassed && swing < 1.5) {
          return { pass: true, intent: 'The AI answered the pass with a pass — the count begins.' };
        }
      }

      if (this.game.history.length > totalPts * 1.1) {
        return { pass: true, intent: 'The game has run long — the AI passes.' };
      }

      if (this.level === 1 && Math.random() < 0.5) {
        const topN = Math.min(6, evaluated.length);
        const choice = evaluated[Math.floor(Math.random() * topN)];
        return { move: { x: choice.x, y: choice.y }, intent: choice.intent, intentType: choice.intentType };
      }

      return { move: { x: best.x, y: best.y }, intent: best.intent, intentType: best.intentType };
    }

    // Top-N candidates for a colour, without noise — used by hint & kifu analysis
    topMoves(color, n = 3) {
      const cands = [];
      const size = this.game.size;
      for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
          if (this.game.board[x][y] !== 0) continue;
          if (this.game.koPoint && this.game.koPoint[0] === x && this.game.koPoint[1] === y) continue;
          const r = this.game.tryPlace(x, y, color);
          if (r.valid && !this.isOwnEye(x, y, color)) cands.push({ x, y, ...r });
        }
      }
      if (cands.length === 0) return [];
      const prevLevel = this.level;
      this.level = 2;
      const evaluated = cands.map(c => ({ ...c, ...this.evaluateMove(c, color) }));
      this.level = prevLevel;
      evaluated.sort((a, b) => b.score - a.score);
      return evaluated.slice(0, n);
    }
  }

  /* ============================================
     WOOD TEXTURE
     ============================================ */
  // 테마 팔레트 — suiji-common.js 테마 훅이 SuijiEngine.setWoodPalette()로 설정한다 (BACKLOG #27).
  // null이면 내장 기본 팔레트(기존 출시색)를 쓴다 — 완전 하위호환 (기획서 §0-2)
  let woodPalette = null;

  // wood: { stops: ['#..','#..','#..'], grain: [r,g,b], knot: [r,g,b], vignette: [r,g,b] }
  // palette 미지정(명시 인자 null + 전역 null)이면 기존 하드코딩 값 그대로 — 팔레트 도입 이전과
  // 같은 Math.random 수열에 대해 픽셀 단위로 동일한 색 문자열이 나온다 (기획서 §0-2)
  function makeWoodTexture(w, h, scale = 2, palette = null) {
    const p = palette || woodPalette; // 명시 인자 > 전역 테마 > 내장 기본 순
    const stops    = p ? p.stops    : ['#e2b075', '#d6a466', '#c08a4a']; // 그라디언트 3정지
    const grain    = p ? p.grain    : [100, 55, 18];  // 결선(세로 무늬) 기준 RGB
    const knot     = p ? p.knot     : [80, 45, 15];   // 결눈(올림무늬) 기준 RGB
    const vignette = p ? p.vignette : [50, 28, 10];   // 테두리 음영 RGB
    // 결선 난수 폭 — 기존 절대 폭(+50/+30/+18)을 기준색 비율로 스케일해 밝은 테마(한지)에서도 결이 자연스럽게 (기획서 §2).
    // 팔레트 미지정 시 기존 절대 폭 그대로 — 하위호환 유지
    const grainJitter = p ? [grain[0] * 0.5, grain[1] * (30 / 55), grain[2]] : [50, 30, 18];
    // 결눈 3정지 색 — 기존 3색(80,45,15 / 110,70,28 / 120,75,30)을 기준색 대비 비율 계수로 환산 (기획서 §2)
    const knotMid = p ? [knot[0] * 1.375, knot[1] * (70 / 45), knot[2] * (28 / 15)] : [110, 70, 28];
    const knotEnd = p ? [knot[0] * 1.5,   knot[1] * (75 / 45), knot[2] * 2]        : [120, 75, 30];

    const off = document.createElement('canvas');
    off.width = w * scale;
    off.height = h * scale;
    const ctx = off.getContext('2d');
    ctx.scale(scale, scale);

    const baseGrad = ctx.createLinearGradient(0, 0, w, h);
    baseGrad.addColorStop(0, stops[0]);
    baseGrad.addColorStop(0.5, stops[1]);
    baseGrad.addColorStop(1, stops[2]);
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 90; i++) {
      const opacity = 0.04 + Math.random() * 0.14;
      const r = grain[0] + Math.random() * grainJitter[0];
      const g = grain[1] + Math.random() * grainJitter[1];
      const b = grain[2] + Math.random() * grainJitter[2];
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
      ctx.lineWidth = 0.4 + Math.random() * 1.6;
      const startX = Math.random() * w;
      const amp = 4 + Math.random() * 16;
      const freq = 0.004 + Math.random() * 0.014;
      const phase = Math.random() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(startX, -2);
      for (let y = -2; y <= h + 2; y += 3) {
        const x = startX + Math.sin(y * freq + phase) * amp + Math.sin(y * freq * 0.3 + phase) * amp * 0.5;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    for (let i = 0; i < 4; i++) {
      const cx = Math.random() * w;
      const cy = Math.random() * h;
      const r = 8 + Math.random() * 18;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${knot[0]}, ${knot[1]}, ${knot[2]}, 0.32)`);
      g.addColorStop(0.4, `rgba(${knotMid[0]}, ${knotMid[1]}, ${knotMid[2]}, 0.18)`);
      g.addColorStop(1, `rgba(${knotEnd[0]}, ${knotEnd[1]}, ${knotEnd[2]}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(${knot[0]}, ${knot[1]}, ${knot[2]}, 0.1)`;
      for (let rr = 2; rr < r; rr += 2) {
        ctx.lineWidth = 0.3;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    for (let i = 0; i < 40; i++) {
      ctx.strokeStyle = `rgba(${100 + Math.random() * 40}, ${60 + Math.random() * 30}, ${20 + Math.random() * 20}, ${0.025 + Math.random() * 0.05})`;
      ctx.lineWidth = 0.3 + Math.random() * 0.6;
      const y = Math.random() * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 4) {
        ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 1.2);
      }
      ctx.stroke();
    }

    const vig = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(${vignette[0]}, ${vignette[1]}, ${vignette[2]}, 0.32)`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    const shine = ctx.createLinearGradient(0, 0, 0, h * 0.4);
    shine.addColorStop(0, 'rgba(255, 240, 200, 0.12)');
    shine.addColorStop(1, 'rgba(255, 240, 200, 0)');
    ctx.fillStyle = shine;
    ctx.fillRect(0, 0, w, h * 0.4);

    return off;
  }

  /* ============================================
     BOARD RENDERER
     ============================================ */
  class BoardRenderer {
    constructor(canvas, game) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.game = game;
      this.hoverPos = null;
      this.lastMovePulse = 0;
      this.animatingStones = new Map();
      this.fadingStones = [];
      this.hintMark = null;
      this.deadSet = null;
      this.woodTexture = null;
      this.dpr = 1;
      this.stopped = false;

      this.setupCanvas();
      this.woodTexture = makeWoodTexture(this.displayWidth, this.displayHeight);

      this.animate = this.animate.bind(this);
      requestAnimationFrame(this.animate);
    }

    destroy() { this.stopped = true; }

    setupCanvas() {
      this.dpr = window.devicePixelRatio || 1;
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = rect.width * this.dpr;
      this.canvas.height = rect.height * this.dpr;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.displayWidth = rect.width;
      this.displayHeight = rect.height;
      this.padding = this.displayWidth * 0.07;
      this.cellSize = (this.displayWidth - 2 * this.padding) / (this.game.size - 1);
      this.stoneRadius = this.cellSize * 0.46;
      this.buildSprites();
    }

    buildSprites() {
      const r = this.stoneRadius;
      const d = this.dpr;
      const S = Math.ceil((r + 2) * 2);
      const make = (color) => {
        const c = document.createElement('canvas');
        c.width = Math.max(4, Math.ceil(S * d));
        c.height = c.width;
        const g = c.getContext('2d');
        g.scale(d, d);
        const cx = S / 2, cy = S / 2;
        if (color === 1) {
          const grad = g.createRadialGradient(cx - r * 0.32, cy - r * 0.32, 0, cx, cy, r);
          grad.addColorStop(0, '#5a5a64');
          grad.addColorStop(0.28, '#2a2a30');
          grad.addColorStop(0.7, '#0c0c10');
          grad.addColorStop(1, '#000000');
          g.fillStyle = grad;
          g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
          g.strokeStyle = 'rgba(255, 255, 255, 0.75)'; g.lineWidth = 1.3; g.stroke();
          const hl = g.createRadialGradient(cx - r * 0.38, cy - r * 0.42, 0, cx - r * 0.38, cy - r * 0.42, r * 0.6);
          hl.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
          hl.addColorStop(0.4, 'rgba(255, 255, 255, 0.1)');
          hl.addColorStop(1, 'rgba(255, 255, 255, 0)');
          g.fillStyle = hl;
          g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(255, 255, 255, 0.55)';
          g.beginPath(); g.arc(cx - r * 0.42, cy - r * 0.46, r * 0.08, 0, Math.PI * 2); g.fill();
        } else {
          const grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.45, '#f6f0dc');
          grad.addColorStop(0.85, '#dfd4b8');
          grad.addColorStop(1, '#b8a888');
          g.fillStyle = grad;
          g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
          g.strokeStyle = 'rgba(120, 95, 60, 0.35)'; g.lineWidth = 0.6; g.stroke();
          const hl = g.createRadialGradient(cx - r * 0.35, cy - r * 0.42, 0, cx - r * 0.35, cy - r * 0.42, r * 0.55);
          hl.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
          hl.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
          hl.addColorStop(1, 'rgba(255, 255, 255, 0)');
          g.fillStyle = hl;
          g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
        }
        return c;
      };
      this.spriteBlack = make(1);
      this.spriteWhite = make(2);
      this.spriteSize = S;
    }

    // Draw a stone at an arbitrary pixel position (reused by other games)
    stoneAt(ctx, px, py, color, opacity = 1, radius = null) {
      const r = radius || this.stoneRadius;
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = `rgba(40, 22, 6, ${0.42 * opacity})`;
      ctx.beginPath();
      ctx.ellipse(px + 1.5, py + 3, r * 1.04, r * 0.96, 0, 0, Math.PI * 2);
      ctx.fill();
      const img = SUIJI_STONE_SPRITES[color === 1 ? 'black' : 'white'];
      if (img.complete && img.naturalWidth > 0) {
        // AI 생성 스킨 — 돌 반경에 맞춰 2r x 2r로 중앙 정렬
        ctx.drawImage(img, px - r, py - r, r * 2, r * 2);
      } else {
        const half = (this.spriteSize * (r / this.stoneRadius)) / 2;
        ctx.drawImage(color === 1 ? this.spriteBlack : this.spriteWhite, px - half, py - half, half * 2, half * 2);
      }
      ctx.restore();
    }

    drawWoodBackground() {
      if (this.woodTexture) this.ctx.drawImage(this.woodTexture, 0, 0, this.displayWidth, this.displayHeight);
      else { this.ctx.fillStyle = '#d8aa6e'; this.ctx.fillRect(0, 0, this.displayWidth, this.displayHeight); }
    }

    drawGrid() {
      const ctx = this.ctx;
      ctx.strokeStyle = 'rgba(35, 22, 8, 0.78)';
      ctx.lineWidth = 1;
      ctx.lineCap = 'round';

      for (let i = 0; i < this.game.size; i++) {
        const p = i / (this.game.size - 1);
        const pos = this.padding + p * (this.displayWidth - 2 * this.padding);
        ctx.beginPath();
        ctx.moveTo(this.padding, pos);
        ctx.lineTo(this.displayWidth - this.padding, pos);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pos, this.padding);
        ctx.lineTo(pos, this.displayHeight - this.padding);
        ctx.stroke();
      }

      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(35, 22, 8, 0.9)';
      ctx.strokeRect(
        this.padding, this.padding,
        this.displayWidth - 2 * this.padding,
        this.displayHeight - 2 * this.padding
      );

      const hoshi = this.game.size === 9 ? [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]] :
                    this.game.size === 13 ? [[3, 3], [3, 9], [9, 3], [9, 9], [6, 6]] :
                    this.game.size === 15 ? [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]] :
                    [[3, 3], [3, 9], [3, 15], [9, 3], [9, 9], [9, 15], [15, 3], [15, 9], [15, 15]];
      ctx.fillStyle = 'rgba(35, 22, 8, 0.88)';
      for (const [hx, hy] of hoshi) {
        const px = this.padding + hx * this.cellSize;
        const py = this.padding + hy * this.cellSize;
        ctx.beginPath();
        ctx.arc(px, py, Math.min(3.2, this.cellSize * 0.11), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(60, 40, 18, 0.45)';
      ctx.font = `${Math.max(9, this.cellSize * 0.24)}px "Spline Sans"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const letters = 'ABCDEFGHJKLMNOPQRST'.split('');
      for (let i = 0; i < this.game.size; i++) {
        const px = this.padding + i * this.cellSize;
        ctx.fillText(letters[i], px, this.padding * 0.42);
        ctx.fillText(letters[i], px, this.displayHeight - this.padding * 0.42);
        const py = this.padding + i * this.cellSize;
        ctx.fillText((this.game.size - i).toString(), this.padding * 0.42, py);
        ctx.fillText((this.game.size - i).toString(), this.displayWidth - this.padding * 0.42, py);
      }
    }

    drawStone(x, y, color, opacity = 1, scale = 1) {
      const px = this.padding + x * this.cellSize;
      const py = this.padding + y * this.cellSize;
      this.stoneAt(this.ctx, px, py, color, opacity, Math.max(1, this.stoneRadius * scale));
    }

    drawDeadMark(x, y) {
      const ctx = this.ctx;
      const px = this.padding + x * this.cellSize;
      const py = this.padding + y * this.cellSize;
      const s = this.stoneRadius * 0.55;
      ctx.save();
      ctx.strokeStyle = 'rgba(165, 40, 40, 0.95)';
      ctx.lineWidth = Math.max(2, this.cellSize * 0.09);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px - s, py - s); ctx.lineTo(px + s, py + s);
      ctx.moveTo(px + s, py - s); ctx.lineTo(px - s, py + s);
      ctx.stroke();
      ctx.restore();
    }

    drawLastMoveMarker() {
      if (!this.game.lastMove) return;
      const ctx = this.ctx;
      const { x, y, color } = this.game.lastMove;
      const px = this.padding + x * this.cellSize;
      const py = this.padding + y * this.cellSize;
      const pulse = (Math.sin(this.lastMovePulse * 0.06) + 1) / 2;
      const r = Math.max(1, this.stoneRadius * 0.32);
      ctx.save();
      if (color === 1) ctx.strokeStyle = `rgba(255, 255, 255, ${0.7 + pulse * 0.3})`;
      else ctx.strokeStyle = `rgba(30, 18, 6, ${0.7 + pulse * 0.3})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, r + pulse * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    drawHoverGhost() {
      if (!this.hoverPos || this.game.gameOver || this.game.scoringMode) return;
      const { x, y } = this.hoverPos;
      if (this.game.board[x][y] !== 0) return;
      if (this.game.canPlace && !this.game.canPlace(x, y, this.game.currentPlayer)) return;
      this.drawStone(x, y, this.game.currentPlayer, 0.42, 0.92);
    }

    getDropScale(key) {
      const anim = this.animatingStones.get(key);
      if (!anim) return 1;
      const elapsed = performance.now() - anim.startTime;
      const dur = 320;
      if (elapsed >= dur) {
        this.animatingStones.delete(key);
        return 1;
      }
      const t = elapsed / dur;
      if (t < 0.35) {
        const tt = t / 0.35;
        return 0.3 + tt * 0.9;
      } else if (t < 0.55) {
        const tt = (t - 0.35) / 0.2;
        return 1.2 - tt * 0.25;
      } else if (t < 0.75) {
        const tt = (t - 0.55) / 0.2;
        return 0.95 + tt * 0.08;
      } else {
        const tt = (t - 0.75) / 0.25;
        return 1.03 - tt * 0.03;
      }
    }

    animateStoneDrop(x, y, color) {
      this.animatingStones.set(`${x},${y}`, { startTime: performance.now(), color });
    }

    // Stones captured on the last move — pop & fade away
    fadeOutStones(stones) {
      const now = performance.now();
      for (const s of stones) this.fadingStones.push({ ...s, start: now });
    }

    showHint(x, y, ms = 2600) {
      this.hintMark = { x, y, until: performance.now() + ms };
    }

    animate() {
      if (this.stopped) return;
      this.lastMovePulse++;
      this.render();
      requestAnimationFrame(this.animate);
    }

    render() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);
      this.drawWoodBackground();
      this.drawGrid();

      const n = this.game.size;
      for (let x = 0; x < n; x++) {
        for (let y = 0; y < n; y++) {
          if (this.game.board[x][y] !== 0) {
            const scale = this.getDropScale(`${x},${y}`);
            const dead = this.deadSet && this.deadSet.has(x * n + y);
            this.drawStone(x, y, this.game.board[x][y], dead ? 0.3 : 1, scale);
            if (dead) this.drawDeadMark(x, y);
          }
        }
      }

      // Captured stones fading out
      if (this.fadingStones.length) {
        const now = performance.now();
        this.fadingStones = this.fadingStones.filter(f => {
          const t = (now - f.start) / 420;
          if (t >= 1) return false;
          const px = this.padding + f.x * this.cellSize;
          const py = this.padding + f.y * this.cellSize;
          this.stoneAt(ctx, px, py, f.color, (1 - t) * 0.85, this.stoneRadius * (1 + t * 0.55));
          return true;
        });
      }

      this.drawLastMoveMarker();
      this.drawHoverGhost();

      // Hint ring
      if (this.hintMark) {
        if (performance.now() > this.hintMark.until) this.hintMark = null;
        else {
          const { x, y } = this.hintMark;
          const px = this.padding + x * this.cellSize;
          const py = this.padding + y * this.cellSize;
          const pulse = (Math.sin(this.lastMovePulse * 0.15) + 1) / 2;
          ctx.save();
          ctx.strokeStyle = `rgba(165, 40, 40, ${0.65 + pulse * 0.35})`;
          ctx.lineWidth = 2.5;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.arc(px, py, this.stoneRadius * (1.05 + pulse * 0.12), 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    pixelToGrid(px, py) {
      const x = Math.round((px - this.padding) / this.cellSize);
      const y = Math.round((py - this.padding) / this.cellSize);
      if (x < 0 || x >= this.game.size || y < 0 || y >= this.game.size) return null;
      const dx = px - (this.padding + x * this.cellSize);
      const dy = py - (this.padding + y * this.cellSize);
      if (Math.sqrt(dx * dx + dy * dy) > this.cellSize * 0.5) return null;
      return { x, y };
    }

    setHover(pos) { this.hoverPos = pos; }
    setDead(set) { this.deadSet = set; }
  }

  /* ============================================
     BOARD PACKING (for autosave / storage)
     ============================================ */
  function packBoard(board) {
    let s = '';
    for (const row of board) for (const v of row) s += v;
    return s;
  }
  function unpackBoard(str, size) {
    const board = [];
    for (let x = 0; x < size; x++) {
      const row = [];
      for (let y = 0; y < size; y++) row.push(parseInt(str[x * size + y]) || 0);
      board.push(row);
    }
    return board;
  }

  /* ============================================
     SGF I/O
     ============================================ */
  const SGF_LETTERS = 'abcdefghijklmnopqrs';
  const SGF = {
    build(game, meta = {}) {
      const L = SGF_LETTERS;
      const pos = (x, y) => L[x] + L[y];
      let s = `(;GM[1]FF[4]CA[UTF-8]AP[두마당]SZ[${game.size}]KM[${game.komi}]` +
              `RU[${game.ruleset === 'korean' ? 'Korean' : 'Chinese'}]` +
              `PB[${meta.black || 'You'}]PW[${meta.white || '두마당 AI'}]` +
              `DT[${new Date().toISOString().slice(0, 10)}]`;
      if (game.resignedBy) {
        s += `RE[${game.winner === 1 ? 'B' : 'W'}+R]`;
      } else if (game.finalScore) {
        const f = game.finalScore;
        s += game.winner === 0 ? `RE[0]` : `RE[${game.winner === 1 ? 'B' : 'W'}+${f.margin.toFixed(1)}]`;
      }
      if (game.handicap >= 2) {
        s += `HA[${game.handicap}]AB` + game.handicapPoints(game.handicap).map(([x, y]) => `[${pos(x, y)}]`).join('');
      }
      for (const m of game.history) {
        if (m.type === 'move') s += `;${m.color === 1 ? 'B' : 'W'}[${pos(m.x, m.y)}]`;
        else if (m.type === 'pass') s += `;${m.color === 1 ? 'B' : 'W'}[]`;
        // setup & resign entries are represented by HA/AB and RE
      }
      s += ')';
      return s;
    },

    parse(text) {
      const out = { size: 19, komi: 6.5, ruleset: 'korean', handicap: 0, players: {}, moves: [], setup: { black: [], white: [] } };
      const szm = text.match(/SZ\[(\d+)\]/); if (szm) out.size = parseInt(szm[1]);
      const kmm = text.match(/KM\[([\d.]+)\]/); if (kmm) out.komi = parseFloat(kmm[1]);
      const rum = text.match(/RU\[(\w+)\]/); if (rum) out.ruleset = /japanese|korean/i.test(rum[1]) ? 'korean' : (/chinese|cn/i.test(rum[1]) ? 'chinese' : 'korean');
      const pbm = text.match(/PB\[([^\]]*)\]/); if (pbm) out.players.b = pbm[1];
      const pwm = text.match(/PW\[([^\]]*)\]/); if (pwm) out.players.w = pwm[1];
      const ham = text.match(/HA\[(\d+)\]/); if (ham) out.handicap = parseInt(ham[1]);

      const propRe = /([A-Z]{1,2})((?:\[[^\]]*\])+)/g;
      let m;
      while ((m = propRe.exec(text)) !== null) {
        const key = m[1];
        const vals = [];
        const valRe = /\[([^\]]*)\]/g;
        let v;
        while ((v = valRe.exec(m[2])) !== null) vals.push(v[1]);
        if (key === 'AB' || key === 'AW') {
          for (const val of vals) {
            if (val.length >= 2) {
              const x = SGF_LETTERS.indexOf(val[0]), y = SGF_LETTERS.indexOf(val[1]);
              if (x >= 0 && y >= 0) out.setup[key === 'AB' ? 'black' : 'white'].push([x, y]);
            }
          }
        }
      }

      const moveRe = /;([BW])\[([^\]]*)\]/g;
      while ((m = moveRe.exec(text)) !== null) {
        const color = m[1] === 'B' ? 1 : 2;
        if (m[2].length >= 2) {
          const x = SGF_LETTERS.indexOf(m[2][0]), y = SGF_LETTERS.indexOf(m[2][1]);
          if (x >= 0 && y >= 0 && x < out.size && y < out.size) out.moves.push({ color, x, y, pass: false });
        } else {
          out.moves.push({ color, x: null, y: null, pass: true });
        }
      }
      return out;
    },

    // Rebuild a playable GoGame from parsed SGF data
    toGame(parsed) {
      const game = new GoGame(parsed.size, parsed.ruleset, parsed.komi, 0);
      for (const [x, y] of parsed.setup.black) game.board[x][y] = 1;
      for (const [x, y] of parsed.setup.white) game.board[x][y] = 2;
      if (parsed.setup.black.length) {
        game.history.push({ type: 'setup', color: 1, boardSnapshot: game.board.map(r => [...r]), captures: { 1: 0, 2: 0 } });
        game.currentPlayer = 2;
      }
      for (const mv of parsed.moves) {
        if (mv.pass) { game.pass(); }
        else {
          const color = game.currentPlayer;
          const r = game.place(mv.x, mv.y);
          if (!r.valid && color === mv.color && game.board[mv.x][mv.y] === 0) {
            // tolerate minor ko/turn mismatches by forcing the recorded colour
            game.currentPlayer = mv.color;
            game.place(mv.x, mv.y);
          }
        }
        if (game.scoringMode) break;
      }
      if (game.scoringMode) { game.scoringMode = false; game.gameOver = true; } // game ended by double pass
      return game;
    }
  };

  // setter만 노출해 외부에서 내부 팔레트 상태를 직접 변조하지 않게 한다 (기획서 §2 힌트)
  (typeof window !== 'undefined' ? window : globalThis).SuijiEngine = {
    GoGame, GoAI, BoardRenderer, SGF, packBoard, unpackBoard, makeWoodTexture,
    setWoodPalette(p) { woodPalette = p || null; } // null이면 내장 기본 팔레트(기존 출시색)로 복귀
  };
})();
