/* درسك AR — Service Worker: cache-first للواجهة، وطلبات Supabase شبكة فقط (لا كاش)
   مهم: عند أي تغيير في ملفات الواجهة ارفع رقم CACHE (v2, v3...) حتى يحذف
   المتصفح النسخة القديمة — وإلا يبقى يخدم نسخة قديمة من الكاش إلى الأبد. */
const CACHE = 'darsak-ar-v6';
const SHELL = [
  '/', '/index.html', '/styles.css', '/app.js', '/supabase-config.js',
  '/lib/image-to-glb.js', '/lib/qrcode-generator.min.js', '/manifest.webmanifest',
  '/public/darsak-ar-icon.png', '/public/favicon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // طلبات Supabase (نطاق آخر): شبكة فقط — لا تُحفظ في الكاش أبدًا
  // (بيانات الدروس والزيارات يجب أن تكون حديثة دائمًا)
  if (url.origin !== self.location.origin) {
    e.respondWith(fetch(e.request));
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
