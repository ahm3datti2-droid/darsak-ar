/* درسك AR — Service Worker: cache-first للواجهة، وطلبات Supabase شبكة فقط (لا كاش)
   مهم: عند أي تغيير في ملفات الواجهة ارفع رقم CACHE (v2, v3...) حتى يحذف
   المتصفح النسخة القديمة — وإلا يبقى يخدم نسخة قديمة من الكاش إلى الأبد. */
const CACHE = 'darsak-ar-v16';
const SHELL = [
  '/', '/index.html', '/styles.css', '/app.js', '/supabase-config.js',
  '/lib/image-to-glb.js', '/lib/qrcode-generator.min.js', '/lib/curriculum.js', '/manifest.webmanifest',
  '/public/darsak-ar-icon.png', '/public/favicon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    // الدروس المنزّلة دون نت لها كاش منفصل (darsak-lessons-v1) — لا يُحذف أبدًا عند تحديث الواجهة
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && !k.startsWith('darsak-lessons')).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // طلبات نطاق آخر (نماذج .glb من modelviewer.dev وملفات Supabase):
  // تُخدم من كاش الدروس المنزّلة إن وُجدت (للعمل دون نت)، وإلا من الشبكة — ولا تُحفظ هنا أبدًا
  // (طلبات API إلى supabase.co ليست في كاش الدروس، فتبقى شبكة فقط دائمًا)
  if (url.origin !== self.location.origin) {
    e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request)));
    return;
  }
  // الواجهة والملفات الثابتة: cache-first ثم الشبكة
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (res.ok && e.request.method === 'GET') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
