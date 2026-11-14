// Raf service worker: statik dosyaları önbellekle, sayfalar her zaman ağdan (çevrimdışıysa uyarı)
const CACHE = "raf-v1";
const ASSETS = ["/static/style.css", "/static/icon.svg", "/static/icon-192.png", "/static/apple-touch-icon.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (u.pathname.startsWith("/static/")) { e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request))); return; }
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;padding:40px;text-align:center;background:#fffaf4;color:#3d3a5c"><h2>📡 Sunucuya ulaşılamıyor</h2><p>Telefonda <b>Tailscale</b> açık mı?</p><button onclick="location.reload()" style="font-size:16px;padding:10px 18px;border-radius:12px;border:0;background:#d9ccff">Tekrar dene</button>',
      { headers: { "Content-Type": "text/html; charset=utf-8" } })));
  }
});
