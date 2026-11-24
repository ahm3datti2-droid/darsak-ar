/**
 * درسك AR — Cloudflare Worker API (بدون أي اعتماديات مدفوعة)
 * D1: teachers / lessons / items — R2: FILES (الملفات المرفوعة)
 * المسارات:
 *   POST /api/auth/signup  {email,password,name}  → {token, teacher}
 *   POST /api/auth/login   {email,password}        → {token, teacher}
 *   GET  /api/lessons                      → دروس المعلّم (مع token) أو كل الدروس العامة
 *   POST /api/lessons                     → إنشاء درس (مع token)
 *   GET  /api/lessons/:id                 → درس + عناصره (عام، ويزيد views)
 *   PUT  /api/lessons/:id                 → تعديل (مع token، مالك الدرس)
 *   DELETE /api/lessons/:id               → حذف (مع token، مالك الدرس)
 *   POST /api/lessons/:id/items           → إضافة عنصر (مع token)
 *   PUT  /api/lessons/:id/items/:itemId   → تعديل عنصر
 *   DELETE /api/lessons/:id/items/:itemId → حذف عنصر
 *   POST /api/upload?filename=...&type=image|model|audio → رفع ملف إلى R2 (حد 15MB)
 */

const MAX_BYTES = 15 * 1024 * 1024; // 15MB
const ALLOWED = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  model: ['model/gltf-binary', 'model/gltf+json', 'application/octet-stream'],
  audio: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg'],
};
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'model/gltf-binary': 'glb', 'model/gltf+json': 'gltf', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'application/octet-stream': 'glb' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });
}
function err(message, status = 400) { return json({ ok: false, error: message }, status); }
function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// رمز دخول بسيط: base64(teacherId + '.' + expiry + '.' + hmac-ish sha256)
async function makeToken(env, teacherId) {
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 يومًا
  const sig = await sha256(teacherId + '.' + exp + '.' + (env.JWT_SECRET || 'darsak-ar'));
  return btoa(teacherId + '.' + exp + '.' + sig);
}
async function authTeacher(request, env) {
  const h = request.headers.get('Authorization') || '';
  const token = h.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    const [teacherId, exp, sig] = atob(token).split('.');
    if (Date.now() > Number(exp)) return null;
    const expect = await sha256(teacherId + '.' + exp + '.' + (env.JWT_SECRET || 'darsak-ar'));
    if (sig !== expect) return null;
    return await env.DB.prepare('SELECT id, email, name FROM teachers WHERE id = ?').bind(teacherId).first();
  } catch { return null; }
}
function publicUrl(env, key) {
  const base = (env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  return base ? `${base}/${key}` : `/files/${key}`;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean); // ['api','lessons', id, ...]
    try {
      if (parts[0] !== 'api') return err('المسار غير موجود', 404);

      // ---------- Auth ----------
      if (parts[1] === 'auth' && parts[2] === 'signup' && request.method === 'POST') {
        const { email, password, name } = await request.json().catch(() => ({}));
        if (!email || !password || password.length < 6) return err('أدخل بريدًا صحيحًا وكلمة سر 6 أحرف على الأقل');
        const exists = await env.DB.prepare('SELECT id FROM teachers WHERE email = ?').bind(email.toLowerCase()).first();
        if (exists) return err('هذا البريد مسجّل من قبل — جرّب تسجيل الدخول');
        const id = uid('tch');
        await env.DB.prepare('INSERT INTO teachers (id, email, password_hash, name) VALUES (?, ?, ?, ?)')
          .bind(id, email.toLowerCase(), await sha256(password), name || '').run();
        const token = await makeToken(env, id);
        return json({ ok: true, token, teacher: { id, email: email.toLowerCase(), name: name || '' } });
      }
      if (parts[1] === 'auth' && parts[2] === 'login' && request.method === 'POST') {
        const { email, password } = await request.json().catch(() => ({}));
        const row = await env.DB.prepare('SELECT * FROM teachers WHERE email = ?').bind((email || '').toLowerCase()).first();
        if (!row || row.password_hash !== await sha256(password || '')) return err('البريد أو كلمة السر غير صحيحة', 401);
        const token = await makeToken(env, row.id);
        return json({ ok: true, token, teacher: { id: row.id, email: row.email, name: row.name } });
      }

      // ---------- Upload ----------
      if (parts[1] === 'upload' && request.method === 'POST') {
        const teacher = await authTeacher(request, env);
        if (!teacher) return err('سجّل الدخول أولًا', 401);
        const type = url.searchParams.get('type') || 'image';
        const filename = (url.searchParams.get('filename') || 'file').replace(/[^A-Za-z0-9._-]/g, '_');
        const buf = await request.arrayBuffer();
        if (buf.byteLength > MAX_BYTES) return err('الملف أكبر من 15MB — صغّر الملف وحاول مجددًا', 413);
        if (buf.byteLength === 0) return err('الملف فارغ');
        const mime = request.headers.get('Content-Type') || '';
        if (ALLOWED[type] && !ALLOWED[type].includes(mime) && type !== 'model') return err('نوع الملف غير مسموح');
        const ext = EXT[mime] || filename.split('.').pop() || 'bin';
        const key = `${type}/${teacher.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        await env.FILES.put(key, buf, { httpMetadata: { contentType: mime } });
        return json({ ok: true, url: publicUrl(env, key), key });
      }

      // ---------- Lessons ----------
      if (parts[1] === 'lessons') {
        const lessonId = parts[2];

        // GET /api/lessons — دروس المعلّم (مع token) أو قائمة عامة مختصرة
        if (!lessonId && request.method === 'GET') {
          const teacher = await authTeacher(request, env);
          const rows = teacher
            ? await env.DB.prepare('SELECT * FROM lessons WHERE teacher_id = ? ORDER BY created_at DESC').bind(teacher.id).all()
            : await env.DB.prepare('SELECT id, title, subject, grade, description, views, created_at FROM lessons ORDER BY created_at DESC LIMIT 50').all();
          return json({ ok: true, lessons: rows.results || [] });
        }
        // POST /api/lessons
        if (!lessonId && request.method === 'POST') {
          const teacher = await authTeacher(request, env);
          if (!teacher) return err('سجّل الدخول أولًا', 401);
          const { title, subject, grade, description } = await request.json().catch(() => ({}));
          if (!title) return err('عنوان الدرس مطلوب');
          const id = uid('les');
          await env.DB.prepare('INSERT INTO lessons (id, teacher_id, title, subject, grade, description) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(id, teacher.id, title, subject || '', grade || '', description || '').run();
          return json({ ok: true, lesson: { id, teacher_id: teacher.id, title, subject, grade, description, views: 0 } }, 201);
        }
        if (!lessonId) return err('المسار غير موجود', 404);

        // GET /api/lessons/:id — عام + زيادة المشاهدات
        if (request.method === 'GET' && parts.length === 3) {
          const lesson = await env.DB.prepare('SELECT * FROM lessons WHERE id = ?').bind(lessonId).first();
          if (!lesson) return err('الدرس غير موجود', 404);
          await env.DB.prepare('UPDATE lessons SET views = views + 1 WHERE id = ?').bind(lessonId).run();
          const items = await env.DB.prepare('SELECT * FROM items WHERE lesson_id = ? ORDER BY sort_order ASC').bind(lessonId).all();
          return json({ ok: true, lesson: { ...lesson, views: (lesson.views || 0) + 1 }, items: items.results || [] });
        }
        // PUT / DELETE lesson — مالك الدرس فقط
        if ((request.method === 'PUT' || request.method === 'DELETE') && parts.length === 3) {
          const teacher = await authTeacher(request, env);
          if (!teacher) return err('سجّل الدخول أولًا', 401);
          const lesson = await env.DB.prepare('SELECT * FROM lessons WHERE id = ?').bind(lessonId).first();
          if (!lesson) return err('الدرس غير موجود', 404);
          if (lesson.teacher_id !== teacher.id) return err('هذا الدرس ليس لك', 403);
          if (request.method === 'DELETE') {
            await env.DB.prepare('DELETE FROM items WHERE lesson_id = ?').bind(lessonId).run();
            await env.DB.prepare('DELETE FROM lessons WHERE id = ?').bind(lessonId).run();
            return json({ ok: true });
          }
          const { title, subject, grade, description } = await request.json().catch(() => ({}));
          await env.DB.prepare('UPDATE lessons SET title = ?, subject = ?, grade = ?, description = ? WHERE id = ?')
            .bind(title ?? lesson.title, subject ?? lesson.subject, grade ?? lesson.grade, description ?? lesson.description, lessonId).run();
          return json({ ok: true });
        }

        // ---------- Items ----------
        if (parts[3] === 'items') {
          const itemId = parts[4];
          const teacher = await authTeacher(request, env);
          if (!teacher) return err('سجّل الدخول أولًا', 401);
          const lesson = await env.DB.prepare('SELECT * FROM lessons WHERE id = ?').bind(lessonId).first();
          if (!lesson || lesson.teacher_id !== teacher.id) return err('هذا الدرس ليس لك', 403);

          if (request.method === 'POST' && !itemId) {
            const b = await request.json().catch(() => ({}));
            if (!b.title && !b.file_url && !b.glb_url) return err('أضف عنوانًا أو ملفًا للعنصر');
            const id = uid('itm');
            const max = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM items WHERE lesson_id = ?').bind(lessonId).first();
            await env.DB.prepare(`INSERT INTO items (id, lesson_id, sort_order, kind, title, text_ar, text_en, file_url, glb_url, placement, size, audio_url, video_url)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
              .bind(id, lessonId, (max?.m ?? -1) + 1, b.kind || 'image', b.title || '', b.text_ar || '', b.text_en || '',
                b.file_url || '', b.glb_url || '', b.placement || 'wall', b.size || 'medium', b.audio_url || '', b.video_url || '').run();
            return json({ ok: true, item: { id, ...b } }, 201);
          }
          if (request.method === 'PUT' && itemId) {
            const b = await request.json().catch(() => ({}));
            const cur = await env.DB.prepare('SELECT * FROM items WHERE id = ? AND lesson_id = ?').bind(itemId, lessonId).first();
            if (!cur) return err('العنصر غير موجود', 404);
            await env.DB.prepare(`UPDATE items SET kind=?, title=?, text_ar=?, text_en=?, file_url=?, glb_url=?, placement=?, size=?, audio_url=?, video_url=?, sort_order=?
              WHERE id=?`).bind(
              b.kind ?? cur.kind, b.title ?? cur.title, b.text_ar ?? cur.text_ar, b.text_en ?? cur.text_en,
              b.file_url ?? cur.file_url, b.glb_url ?? cur.glb_url, b.placement ?? cur.placement, b.size ?? cur.size,
              b.audio_url ?? cur.audio_url, b.video_url ?? cur.video_url, b.sort_order ?? cur.sort_order, itemId).run();
            return json({ ok: true });
          }
          if (request.method === 'DELETE' && itemId) {
            await env.DB.prepare('DELETE FROM items WHERE id = ? AND lesson_id = ?').bind(itemId, lessonId).run();
            return json({ ok: true });
          }
          return err('المسار غير موجود', 404);
        }
        return err('المسار غير موجود', 404);
      }
      return err('المسار غير موجود', 404);
    } catch (e) {
      return err('خطأ في الخادم: ' + (e && e.message ? e.message : 'غير معروف'), 500);
    }
  },
};
