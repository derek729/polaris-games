/* ============================================================
   두마당 — 3D board renderer (Three.js)
   BoardRenderer3D: drop-in replacement for BoardRenderer.
   Same public interface (pixelToGrid / setHover / setDead /
   animateStoneDrop / fadeOutStones / showHint / destroy /
   setupCanvas / generateWoodTexture) so every game can swap
   between 2D and 3D at runtime.

   Premium look: lens stones with clearcoat gloss, wood board
   with carved grid, soft shadows, orbit camera (drag = rotate,
   wheel/pinch = zoom, click = place).
   ============================================================ */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  const CELL = 1;            // world unit per grid line
  const MARGIN = 0.9;        // wooden border around the grid (cells)
  const THICK = 0.55;        // board slab thickness
  const STONE_R = 0.47;

  class BoardRenderer3D {
    constructor(canvas, game, opts = {}) {
      if (!window.THREE) throw new Error('THREE not loaded');
      this.canvas = canvas;
      this.game = game;
      this.opts = opts;
      this.deadSet = null;
      this.hintMark = null;
      this.fading = [];
      this.drops = new Map();
      this.stoneMeshes = new Map();
      this.hoverPos = null;
      this.stopped = false;
      this.woodTexture = null;   // compat: pages assign this freely

      this._initScene();
      this._initBoard();
      this._initLights();
      this._initInput();

      this._animate = this._animate.bind(this);
      this._raf = requestAnimationFrame(this._animate);
    }

    destroy() {
      this.stopped = true;
      cancelAnimationFrame(this._raf);
      this._detachInput();
      this.renderer.dispose();
    }

    /* ---------- scene ---------- */
    _initScene() {
      const w = this.canvas.clientWidth || 600;
      const h = this.canvas.clientHeight || w;
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(w, h, false);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      // cinematic colour pipeline
      if (THREE.sRGBEncoding) this.renderer.outputEncoding = THREE.sRGBEncoding;
      if (THREE.ACESFilmicToneMapping) {
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
      }

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 300);

      const n = this.game.size;
      this.orbit = {
        theta: -0.32, phi: 0.78,
        radius: n * 2.35,
        target: new THREE.Vector3(0, 0, 0)
      };
      this._applyCamera();

      // soft floor shadow catcher
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(n * 16, n * 16),
        new THREE.ShadowMaterial({ opacity: 0.36 })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -THICK - 0.02;
      floor.receiveShadow = true;
      this.scene.add(floor);
    }

    _initLights() {
      this.scene.add(new THREE.AmbientLight(0xfff1dc, 0.34));
      const hemi = new THREE.HemisphereLight(0xfff4e0, 0x1a120c, 0.4);
      this.scene.add(hemi);
      const n = this.game.size;
      const dir = new THREE.DirectionalLight(0xffe9c4, 0.85);
      dir.position.set(n * 0.5, n * 0.95, n * 0.42);
      dir.castShadow = true;
      dir.shadow.mapSize.set(2048, 2048);
      const d = n * 0.9;
      dir.shadow.camera.left = -d; dir.shadow.camera.right = d;
      dir.shadow.camera.top = d; dir.shadow.camera.bottom = -d;
      dir.shadow.bias = -0.0004;
      this.scene.add(dir);
      const rim = new THREE.DirectionalLight(0xd9a441, 0.16);
      rim.position.set(-n * 0.6, n * 0.4, -n * 0.5);
      this.scene.add(rim);
    }

    _initBoard() {
      const n = this.game.size;
      const W = (n - 1) + MARGIN * 2;      // board width in cells
      this.boardW = W;
      const group = new THREE.Group();
      this.boardGroup = group;

      // top face: wood + grid + hoshi + coords baked into a texture
      const tex = this._makeTopTexture();
      const sideMat = new THREE.MeshStandardMaterial({ color: 0x8a5c2e, roughness: 0.72 });
      const edgeMat = new THREE.MeshStandardMaterial({ color: 0x6f4620, roughness: 0.78 });
      const topMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62 });
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(W, THICK, W),
        [sideMat, sideMat, topMat, edgeMat, sideMat, sideMat]
      );
      box.position.y = -THICK / 2;
      box.receiveShadow = true;
      box.castShadow = true;
      group.add(box);

      // carved groove border on top (drawn as a square on the texture-safe layer)
      const groove = new THREE.Mesh(
        new THREE.RingGeometry((n - 1) / 2 + 0.34, (n - 1) / 2 + 0.40, 4, 1, Math.PI / 4),
        new THREE.MeshBasicMaterial({ color: 0x3a2510, transparent: true, opacity: 0.0 })
      );
      groove.rotation.x = -Math.PI / 2;
      groove.position.y = 0.002;
      group.add(groove);

      // legs (go boards stand on four feet)
      if (this.opts.legs) {
        const legGeo = new THREE.CylinderGeometry(0.34, 0.52, THICK + 1.1, 4, 1);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x5f3c1a, roughness: 0.8 });
        const off = W / 2 - 0.9;
        for (const [lx, lz] of [[-off, -off], [off, -off], [-off, off], [off, off]]) {
          const leg = new THREE.Mesh(legGeo, legMat);
          leg.position.set(lx, -(THICK + 1.1) / 2 + 0.05, lz);
          leg.rotation.y = Math.PI / 4;
          leg.castShadow = true;
          group.add(leg);
        }
      }

      // hover ghost + last-move ring + hint ring containers
      this.ghostMesh = this._makeStone(1);
      this.ghostMesh.visible = false;
      group.add(this.ghostMesh);

      this.lastRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.3, 0.045, 10, 40),
        new THREE.MeshBasicMaterial({ color: 0xe2542e })
      );
      this.lastRing.rotation.x = -Math.PI / 2;
      this.lastRing.visible = false;
      group.add(this.lastRing);

      this.hintRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.52, 0.05, 10, 44),
        new THREE.MeshBasicMaterial({ color: 0xe2542e, transparent: true, opacity: 0.9 })
      );
      this.hintRing.rotation.x = -Math.PI / 2;
      this.hintRing.visible = false;
      group.add(this.hintRing);

      this.overlayGroup = new THREE.Group(); // subclasses may draw extra 3D overlays
      group.add(this.overlayGroup);

      this.stonesGroup = new THREE.Group();
      group.add(this.stonesGroup);

      this.scene.add(group);
    }

    _makeTopTexture() {
      const n = this.game.size;
      const S = 1024;
      const cv = document.createElement('canvas');
      cv.width = S; cv.height = S;
      const g = cv.getContext('2d');
      // wood base — reuse the suite's wood painter for a consistent look
      if (window.SuijiEngine && SuijiEngine.makeWoodTexture) {
        g.drawImage(SuijiEngine.makeWoodTexture(S, S, 1), 0, 0);
      } else {
        g.fillStyle = '#d6a466'; g.fillRect(0, 0, S, S);
      }
      const W = this.boardW;
      const c0 = (n - 1) / 2;
      const toPx = (v) => (((v - c0) / W) + 0.5) * S;
      // grid
      g.strokeStyle = 'rgba(40, 24, 8, 0.8)';
      g.lineWidth = S / W * 0.022;
      for (let i = 0; i < n; i++) {
        const p = toPx(i);
        g.beginPath(); g.moveTo(toPx(0), p); g.lineTo(toPx(n - 1), p); g.stroke();
        g.beginPath(); g.moveTo(p, toPx(0)); g.lineTo(p, toPx(n - 1)); g.stroke();
      }
      g.lineWidth = S / W * 0.04;
      g.strokeRect(toPx(0), toPx(0), toPx(n - 1) - toPx(0), toPx(n - 1) - toPx(0));
      // hoshi
      const hoshi = n === 9 ? [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]] :
                    n === 13 ? [[3, 3], [3, 9], [9, 3], [9, 9], [6, 6]] :
                    n === 15 ? [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]] :
                    [[3, 3], [3, 9], [3, 15], [9, 3], [9, 9], [9, 15], [15, 3], [15, 9], [15, 15]];
      g.fillStyle = 'rgba(35, 20, 6, 0.9)';
      for (const [hx, hy] of hoshi) {
        g.beginPath();
        g.arc(toPx(hx), toPx(hy), S / W * 0.09, 0, Math.PI * 2);
        g.fill();
      }
      // coordinates
      const letters = 'ABCDEFGHJKLMNOPQRST'.split('');
      g.fillStyle = 'rgba(55, 34, 12, 0.55)';
      g.font = `600 ${Math.max(11, S / W * 0.3)}px "Spline Sans", sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let i = 0; i < n; i++) {
        const p = toPx(i);
        g.fillText(letters[i], p, toPx(-0.55));
        g.fillText(letters[i], p, toPx(n - 1 + 0.55));
        g.fillText(String(n - i), toPx(-0.55), p);
        g.fillText(String(n - i), toPx(n - 1 + 0.55), p);
      }
      const tex = new THREE.CanvasTexture(cv);
      tex.anisotropy = 8;
      if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
      return tex;
    }

    /* ---------- stones ---------- */
    _makeStone(color) {
      const geo = this._stoneGeo || (this._stoneGeo = new THREE.SphereGeometry(STONE_R, 36, 24));
      const mat = color === 1
        ? new THREE.MeshPhysicalMaterial({ color: 0x15151a, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.18 })
        : new THREE.MeshPhysicalMaterial({ color: 0xf3ecda, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.3 });
      const m = new THREE.Mesh(geo, mat);
      m.scale.set(1, 0.52, 1);
      m.castShadow = true;
      return m;
    }

    _world(x, y) {
      const n = this.game.size;
      return {
        x: (x - (n - 1) / 2) * CELL,
        z: (y - (n - 1) / 2) * CELL
      };
    }

    _syncStones() {
      const n = this.game.size;
      const now = performance.now();
      // remove stale meshes
      for (const [key, mesh] of this.stoneMeshes) {
        const x = Math.floor(key / n), y = key % n;
        if (this.game.board[x][y] === 0) {
          this.stonesGroup.remove(mesh);
          this.stoneMeshes.delete(key);
        }
      }
      // add / update
      for (let x = 0; x < n; x++) {
        for (let y = 0; y < n; y++) {
          const v = this.game.board[x][y];
          if (v === 0) continue;
          const key = x * n + y;
          let m = this.stoneMeshes.get(key);
          if (!m) {
            m = this._makeStone(v);
            const { x: wx, z: wz } = this._world(x, y);
            m.position.set(wx, 0, wz);
            this.stonesGroup.add(m);
            this.stoneMeshes.set(key, m);
          }
          const dead = this.deadSet && this.deadSet.has(key);
          m.material.opacity = dead ? 0.32 : 1;
          m.material.transparent = dead;
          if (dead) m.scale.set(1, 0.4, 1);
          // drop animation
          const drop = this.drops.get(`${x},${y}`);
          if (drop) {
            const t = (now - drop.start) / 340;
            if (t >= 1) { this.drops.delete(`${x},${y}`); m.position.y = 0; }
            else {
              const ease = 1 - Math.pow(1 - t, 3);
              m.position.y = (1 - ease) * 1.4;
              const squash = 1 + Math.sin(t * Math.PI) * 0.18;
              m.scale.set(1, 0.52 * (2 - squash), 1);
            }
          }
        }
      }
      // fading captures
      this.fading = this.fading.filter(f => {
        const t = (now - f.start) / 420;
        if (t >= 1) { this.stonesGroup.remove(f.mesh); return false; }
        f.mesh.position.y = t * 0.5;
        f.mesh.material.opacity = (1 - t) * 0.9;
        f.mesh.scale.set(1 + t * 0.4, 0.52 * (1 - t * 0.3), 1 + t * 0.4);
        return true;
      });
    }

    /* ---------- input: orbit + raycast picking ---------- */
    _initInput() {
      this._down = null;
      this.canvas.style.touchAction = 'none';
      this._onDown = (e) => {
        const p = this._pt(e);
        this._down = { x: p.x, y: p.y, moved: false };
      };
      this._onMove = (e) => {
        const p = this._pt(e);
        if (this._down) {
          const dx = p.x - this._down.x, dy = p.y - this._down.y;
          if (Math.hypot(dx, dy) > 6) this._down.moved = true;
          if (this._down.moved) {
            this.orbit.theta -= dx * 0.006;
            this.orbit.phi = Math.min(1.32, Math.max(0.18, this.orbit.phi - dy * 0.005));
            this._down.x = p.x; this._down.y = p.y;
          }
        }
        // hover ghost
        const grid = this.pixelToGrid(p.x, p.y);
        this.setHover(grid);
      };
      this._onUp = () => { this._down = null; };
      // NOTE: picking is wired by the host page (document-level capture listener),
      // which proved more reliable than instance-level listeners across embedders.
      this._onWheel = (e) => {
        e.preventDefault();
        const n = this.game.size;
        this.orbit.radius = Math.min(n * 2.6, Math.max(n * 0.75, this.orbit.radius + e.deltaY * 0.01 * n * 0.05));
      };
      this.canvas.addEventListener('pointerdown', this._onDown);
      this.canvas.addEventListener('pointermove', this._onMove);
      window.addEventListener('pointerup', this._onUp);
      this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
    }

    _detachInput() {
      this.canvas.removeEventListener('pointerdown', this._onDown);
      this.canvas.removeEventListener('pointermove', this._onMove);
      window.removeEventListener('pointerup', this._onUp);
      this.canvas.removeEventListener('wheel', this._onWheel);
    }

    _pt(e) {
      const r = this.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    _applyCamera() {
      const { theta, phi, radius, target } = this.orbit;
      this.camera.position.set(
        target.x + radius * Math.sin(phi) * Math.sin(theta),
        target.y + radius * Math.cos(phi),
        target.z + radius * Math.sin(phi) * Math.cos(theta)
      );
      this.camera.lookAt(target);
    }

    /* ---------- public interface (mirrors BoardRenderer) ---------- */
    pixelToGrid(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - r.left) / r.width) * 2 - 1,
        -((clientY - r.top) / r.height) * 2 + 1
      );
      this.camera.updateMatrixWorld();       // raycast는 최신 카메라 행렬 필요
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, this.camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const hit = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, hit)) return null;
      const n = this.game.size;
      const gx = Math.round(hit.x / CELL + (n - 1) / 2);
      const gy = Math.round(hit.z / CELL + (n - 1) / 2);
      if (gx < 0 || gx >= n || gy < 0 || gy >= n) return null;
      const { x: wx, z: wz } = this._world(gx, gy);
      if (Math.hypot(hit.x - wx, hit.z - wz) > 0.62) return null;
      return { x: gx, y: gy };
    }

    setHover(pos) {
      this.hoverPos = pos;
      if (!pos || this.game.gameOver || this.game.scoringMode) { this.ghostMesh.visible = false; return; }
      if (this.game.board[pos.x][pos.y] !== 0) { this.ghostMesh.visible = false; return; }
      if (this.game.canPlace && !this.game.canPlace(pos.x, pos.y, this.game.currentPlayer)) { this.ghostMesh.visible = false; return; }
      const { x, z } = this._world(pos.x, pos.y);
      this.ghostMesh.position.set(x, 0, z);
      this.ghostMesh.material = this.game.currentPlayer === 1 ? this._ghostB || (this._ghostB = new THREE.MeshBasicMaterial({ color: 0x111118, transparent: true, opacity: 0.4 }))
                                                              : this._ghostW || (this._ghostW = new THREE.MeshBasicMaterial({ color: 0xfff6e0, transparent: true, opacity: 0.55 }));
      this.ghostMesh.visible = true;
    }

    setDead(set) { this.deadSet = set; }

    animateStoneDrop(x, y) {
      this.drops.set(`${x},${y}`, { start: performance.now() });
    }

    fadeOutStones(list) {
      const n = this.game.size;
      for (const s of list) {
        const key = s.x * n + s.y;
        const mesh = this.stoneMeshes.get(key);
        if (!mesh) continue;
        this.stoneMeshes.delete(key);
        this.stonesGroup.remove(mesh);
        const clone = this._makeStone(s.color);
        const { x, z } = this._world(s.x, s.y);
        clone.position.set(x, 0, z);
        clone.material.transparent = true;
        this.stonesGroup.add(clone);
        this.fading.push({ mesh: clone, start: performance.now() });
      }
    }

    showHint(x, y, ms = 2600) {
      this.hintMark = { x, y, until: performance.now() + ms };
    }

    setupCanvas() {
      const w = this.canvas.clientWidth || 600;
      const h = this.canvas.clientHeight || w;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this._applyCamera();
    }

    generateWoodTexture() { /* 3D bakes wood into the board texture — nothing to do */ }

    /* ---------- loop ---------- */
    _animate() {
      if (this.stopped) return;
      const now = performance.now();
      this._syncStones();
      this._applyCamera();

      // last move marker
      const lm = this.game.lastMove;
      if (lm) {
        const { x, z } = this._world(lm.x, lm.y);
        this.lastRing.position.set(x, 0.5, z);
        this.lastRing.visible = true;
      } else this.lastRing.visible = false;

      // hint ring
      if (this.hintMark) {
        if (now > this.hintMark.until) this.hintMark.visible = false, this.hintMark = null;
        else {
          const pulse = (Math.sin(now * 0.006) + 1) / 2;
          const { x, z } = this._world(this.hintMark.x, this.hintMark.y);
          this.hintRing.position.set(x, 0.56, z);
          this.hintRing.scale.setScalar(1 + pulse * 0.15);
          this.hintRing.material.opacity = 0.6 + pulse * 0.4;
          this.hintRing.visible = true;
        }
      } else this.hintRing.visible = false;

      // subclass overlay hook (win lines, kifu markers…)
      this.overlayGroup.clear();
      if (typeof this.drawOverlay3D === 'function') this.drawOverlay3D();

      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(this._animate);
    }

    /* helpers for page overlays */
    ring3D(x, y, color, radius = 0.5, tube = 0.05) {
      const { x: wx, z: wz } = this._world(x, y);
      const m = new THREE.Mesh(
        new THREE.TorusGeometry(radius, tube, 10, 40),
        new THREE.MeshBasicMaterial({ color })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(wx, 0.55, wz);
      return m;
    }

    bar3D(x1, y1, x2, y2, color, thick = 0.09) {
      const a = this._world(x1, y1), b = this._world(x2, y2);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const geo = new THREE.CylinderGeometry(thick, thick, len, 10);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 }));
      m.position.set((a.x + b.x) / 2, 0.6, (a.z + b.z) / 2);
      m.rotation.z = Math.PI / 2;
      m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      return m;
    }

    label3D(x, y, text, color = '#faf2dc', bg = '#a52828') {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 96;
      const g = cv.getContext('2d');
      g.fillStyle = bg; g.beginPath(); g.arc(48, 48, 44, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,244,224,0.9)'; g.lineWidth = 5; g.stroke();
      g.fillStyle = color; g.font = '700 52px "JetBrains Mono", monospace';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, 48, 51);
      const tex = new THREE.CanvasTexture(cv);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.72, 0.72),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true })
      );
      const { x: wx, z: wz } = this._world(x, y);
      m.position.set(wx, 0.85, wz);
      m.rotation.x = -Math.PI / 2.6;
      return m;
    }
  }

  window.Suiji3D = { BoardRenderer3D, available: !!window.THREE };
})();
