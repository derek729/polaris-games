/* ============================================================
   폴라리스 게임 센터 (POLARIS GAMES) — Service Worker
   Cache-first offline support for the whole game suite.
   Bump CACHE_VERSION whenever suite files change.
   ============================================================ */
const CACHE_VERSION = 'polaris-v19';
const PRECACHE = [
  // 통합 포털 + 아케이드 게임
  'index.html',
  'polaris-common.js',
  'vampire-survivors.html',
  'plants-vs-zombies.html',
  'beatcraft.html',
  'atelier-studio/index.html',
  // 두마당 보드게임 스위트
  'suiji-index.html',
  'suiji-go.html',
  'suiji-omok.html',
  'suiji-alkkagi.html',
  'suiji-kifu.html',
  'suiji-theme.css?v=15',
  'suiji-common.js?v=15',
  'suiji-engine.js?v=15',
  'suiji-net.js?v=15',
  'suiji-3d.js?v=15',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-64.png',
  // AI 생성 에셋 — 스프라이트
  'game-assets/beatcraft/note-blue.png',
  'game-assets/beatcraft/note-pink.png',
  'game-assets/beatcraft/star-perfect.png',
  'game-assets/pvz/plant-cherry.png',
  'game-assets/pvz/plant-peashooter.png',
  'game-assets/pvz/plant-repeater.png',
  'game-assets/pvz/plant-snowpea.png',
  'game-assets/pvz/plant-sunflower.png',
  'game-assets/pvz/plant-wallnut.png',
  'game-assets/pvz/zombie-basic.png',
  'game-assets/pvz/zombie-bucket.png',
  'game-assets/pvz/zombie-cone.png',
  'game-assets/pvz/zombie-flag.png',
  'game-assets/suiji/stone-black.png',
  'game-assets/suiji/stone-white.png',
  'game-assets/vampire-survivors/enemy-alchemist.png',
  'game-assets/vampire-survivors/enemy-bat.png',
  'game-assets/vampire-survivors/enemy-hunter.png',
  'game-assets/vampire-survivors/enemy-mage.png',
  'game-assets/vampire-survivors/enemy-nun.png',
  'game-assets/vampire-survivors/enemy-paladin.png',
  'game-assets/vampire-survivors/enemy-pig.png',
  'game-assets/vampire-survivors/enemy-snail.png',
  'game-assets/vampire-survivors/enemy-warrior.png',
  'game-assets/vampire-survivors/boss-reaper.png',
  'game-assets/vampire-survivors/boss-shroomking.png',
  'game-assets/vampire-survivors/boss-slimeking.png',
  'game-assets/vampire-survivors/item-chest.png',
  'game-assets/vampire-survivors/item-gem.png',
  'game-assets/vampire-survivors/item-potion.png',
  // AI 생성 에셋 — 사운드
  'game-assets/sfx/coin.wav',
  'game-assets/sfx/explosion.wav',
  'game-assets/sfx/gameover.wav',
  'game-assets/sfx/hit.wav',
  'game-assets/sfx/jump.wav',
  'game-assets/sfx/laser.wav',
  'game-assets/sfx/powerup.wav',
  'game-assets/sfx/select.wav',
  'game-assets/bgm/vs-theme.wav',
  'game-assets/bgm/pvz-theme.wav',
  'game-assets/bgm/suiji-theme.wav'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // tolerate individual failures so one missing file can't break the install
    await Promise.allSettled(PRECACHE.map(url => cache.add(new Request(url, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // App navigations: network-first, fall back to cache (then to the hub page)
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_VERSION);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match(req);
        return cached || caches.match('index.html');
      }
    })());
    return;
  }

  // Everything else: network-first, fall back to cache when offline
  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && (fresh.ok || fresh.type === 'opaque')) {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (e) {
      const cached = await caches.match(req);
      if (cached) return cached;
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});
