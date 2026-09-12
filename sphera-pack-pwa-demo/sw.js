const CACHE = 'sphera-field-station-v8';
const ASSETS = [
  './','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icons/sphera.svg','./icons/sphera-192.png','./icons/sphera-512.png',
  './exhibits/sphere-gice/sphere-gice-melody-v2-v3.3.html',
  './exhibits/builders/spherai-voxel-64.html','./exhibits/builders/sm7-goose-cube-workbook.html',
  './exhibits/sheet_cube_gice.html','./exhibits/zooter/zooter_clean.html','./exhibits/zooter/zooter_clean.x.html',
  './exhibits/goose/octave.gice.html','./exhibits/hanzi/hanzi_gravity_sim.html','./exhibits/hanzi/sphera.v0.7.hanzi.py','./exhibits/hanzi/sphera.v0.7.hanzi.txt',
  './runtime/sphera-state.js','./exhibits/goose-crossing/index.html','./exhibits/goose-crossing/styles.css','./exhibits/goose-crossing/app.js','./exhibits/goose-crossing/bink-bonk-s3-local.html'
];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok && new URL(event.request.url).origin === location.origin) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : undefined)));
});
