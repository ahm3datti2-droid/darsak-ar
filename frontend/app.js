/**
 * درسك AR — منطق التطبيق كاملًا (SPA)
 * - الباك إند: Supabase (Auth + Postgres + Storage) — يُحمّل عميل JS عبر ESM CDN
 *   مع رجوع تلقائي للوضع المحلي (localStorage) إن تعذّر تحميل الـ CDN.
 * - تسجيل المعلّم: Supabase Auth (email+password) + صف في جدول teachers.
 *   الحساب التجريبي demo@darsak.ar / 123456 يعمل محليًا دون اتصال كما كان.
 * - الدروس/العناصر: جداول lessons/items، والملفات في Storage bucket darsak-files.
 * - الصورة → .glb في المتصفح (three.js + GLTFExporter) عبر lib/image-to-glb.js
 * - QR: مكتبة qrcode-generator مضمّنة محليًا + شعار في المنتصف
 * - الطالب: <model-viewer> مع ar-placement من إعداد المعلّم + عدّاد مشاهدات
 *   (RPC increment_lesson_views) + تسجيل زيارة في site_visits
 * - الأدمن (teachers.is_admin): إحصائيات + جدول مستخدمين + زيارات حسب المصدر
 *   واليوم + تحرير/حذف أي درس أو عنصر.
 */
import { imageFileToGlb } from './lib/image-to-glb.js';

const SUPA_URL = window.DARSAK_SUPABASE_URL || '';
const SUPA_KEY = window.DARSAK_SUPABASE_ANON_KEY || '';
const STORAGE_BUCKET = 'darsak-files';
const MAX_BYTES = 15 * 1024 * 1024; // 15MB
const LS_LESSONS = 'darsak.lessons.v1';
const LS_TEACHERS = 'darsak.teachers.v1';
const LS_SESSION = 'darsak.session.v1';
const LS_VISITOR = 'darsak.visitor.v1';
const SIZE_M = { small: 0.5, medium: 1, large: 1.8 };
const SIZE_LABEL = { small: 'صغير (0.5م)', medium: 'متوسط (1م)', large: 'كبير (1.8م)' };
const SAMPLE_MODELS = 'https://modelviewer.dev/shared-assets/models/';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p) => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
const LS_STUDENT = 'darsak.student.v1'; // اسم الطالب (لتقارير المعلّم)
const LS_ACTIVITY = 'darsak.activity.v1'; // نسخة محلية من نشاط الطلاب (احتياطي دون اتصال)
const LS_OFFLINE = 'darsak.offline.v1'; // دروس منزّلة للاستخدام دون نت (lessonId -> lesson)
const LS_BADGES = 'darsak.badges.v1'; // شارات الطالب المحلية (name -> [badgeId])

/* ================= مكتبة المنهج (تُحمَّل عند الطلب فقط) ================= */
let libraryCache = null;
async function loadLibrary() {
  if (libraryCache) return libraryCache;
  try {
    const m = await import('./lib/curriculum.js');
    libraryCache = m.LIBRARY;
    return libraryCache;
  } catch (e) { console.warn('library load failed', e); return null; }
}
async function findLibraryLesson(id) {
  const lib = await loadLibrary();
  return lib?.lessons.find((l) => l.id === id) || null;
}
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function showMsg(el, text, ok = false) {
  if (!el) return;
  el.innerHTML = text ? `<div class="${ok ? 'success' : 'error'}">${esc(text)}</div>` : '';
}
function checkFileSize(file) {
  if (!file) return true;
  if (file.size > MAX_BYTES) {
    alert('الملف أكبر من 15MB — صغّر الملف وحاول مجددًا. حجم ملفك: ' + (file.size / 1048576).toFixed(1) + 'MB');
    return false;
  }
  return true;
}
function youtubeId(url) {
  if (!url) return '';
  const m = String(url).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{6,})/);
  return m ? m[1] : '';
}
function friendlyAuthError(e) {
  const m = String(e?.message || e || '');
  if (/Invalid login credentials/i.test(m)) return 'البريد أو كلمة السر غير صحيحة';
  if (/User already registered|already registered/i.test(m)) return 'هذا البريد مسجّل من قبل — جرّب تسجيل الدخول';
  if (/Email not confirmed/i.test(m)) return 'لم يتم تأكيد البريد بعد — جرّب إنشاء الحساب مرة أخرى';
  if (/Password should be at least/i.test(m)) return 'كلمة السر يجب أن تكون 6 أحرف على الأقل';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'تعذّر الاتصال بالخادم — تحقق من الإنترنت وحاول مجددًا';
  return m || 'حدث خطأ';
}

/* ================= التخزين المحلي (الوضع دون اتصال) ================= */
function loadLocal(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function saveLocal(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

/* ================= الجلسة ================= */
// session = { id?, email, name, is_admin?, mode: 'supabase' | 'local' }
let session = null;
let supabase = null; // عميل Supabase — null إن تعذّر تحميل الـ CDN
let lessonsCache = null; // دروس محمّلة (من Supabase أو localStorage)
let teacherEmails = {}; // id → email (للأدمن فقط)

function getSession() { return session; }
function setSession(s) {
  session = s || null;
  if (s && s.mode === 'local') saveLocal(LS_SESSION, s);
  else localStorage.removeItem(LS_SESSION);
}
const isRemote = () => !!supabase && session?.mode === 'supabase';
const isAdmin = () => !!session?.is_admin;

/* ================= Supabase: تحميل العميل ================= */
async function loadSupabaseClient() {
  if (!SUPA_URL || !SUPA_KEY) return;
  try {
    const mod = await Promise.race([
      import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('supabase cdn timeout')), 10000)),
    ]);
    supabase = mod.createClient(SUPA_URL, SUPA_KEY);
  } catch (e) {
    console.warn('Supabase CDN غير متاح — الوضع المحلي (localStorage)', e);
    supabase = null;
  }
}

/* ================= الدرس التجريبي: المجموعة الشمسية ================= */
function buildDemoLesson() {
  return {
    id: 'les_demo_solar', teacher_id: 'demo', title: 'المجموعة الشمسية',
    subject: 'علوم', grade: 'الصف الرابع', description: 'درس تجريبي: تعرّف على كواكب المجموعة الشمسية وروّاد الفضاء في الواقع المعزّز.',
    views: 0, created_at: new Date().toISOString(),
    items: [
      { id: 'itm_demo_1', kind: 'model', title: 'رائد الفضاء', text_ar: 'رائد الفضاء يسافر خارج الأرض في مركبة فضائية، ويرتدي بدلة خاصة تحميه وتحافظ على الهواء والأكسجين حوله.', text_en: 'An astronaut travels into space wearing a special suit that protects them and supplies air.', file_url: SAMPLE_MODELS + 'Astronaut.glb', glb_url: SAMPLE_MODELS + 'Astronaut.glb', placement: 'floor', size: 'medium', audio_url: '', video_url: '', quiz: { q: 'ما الذي يحمي رائد الفضاء في الفضاء؟', choices: [ { t: 'البدلة الفضائية الخاصة', ok: true, pos: [0, 1.5, 0.15] }, { t: 'المظلة', ok: false, pos: [0, 1.2, -0.25] }, { t: 'الحذاء الرياضي', ok: false, pos: [0.15, 0.1, 0.1] } ] } },
      { id: 'itm_demo_2', kind: 'model', title: 'الروبوت المساعد', text_ar: 'الروبوتات تساعد روّاد الفضاء والعلماء في استكشاف الكواكب وجمع العينات من أماكن خطرة على الإنسان.', text_en: 'Robots help astronauts explore planets and collect samples from places too dangerous for humans.', file_url: SAMPLE_MODELS + 'RobotExpressive.glb', glb_url: SAMPLE_MODELS + 'RobotExpressive.glb', placement: 'floor', size: 'medium', audio_url: '', video_url: '' },
      { id: 'itm_demo_3', kind: 'model', title: 'الحصان — وسيلة نقل قديمة', text_ar: 'قبل السيارات والطائرات كان الحصان من أهم وسائل النقل. قارن بين سرعته وسرعة الصاروخ!', text_en: 'Before cars and planes, the horse was a key means of transport. Compare its speed with a rocket!', file_url: SAMPLE_MODELS + 'Horse.glb', glb_url: SAMPLE_MODELS + 'Horse.glb', placement: 'floor', size: 'large', audio_url: '', video_url: '', quiz: { q: 'ما فائدة الحصان قديمًا؟', choices: [ { t: 'وسيلة نقل', ok: true, pos: [0, 1.0, 0] }, { t: 'مصدر للكهرباء', ok: false, pos: [0.55, 1.15, 0] }, { t: 'آلة حاسبة', ok: false, pos: [-0.6, 1.0, 0] } ] } },
      { id: 'itm_demo_4', kind: 'image', title: 'لوحة المجموعة الشمسية', text_ar: 'هذه لوحة توضيحية: الشمس في الوسط، وتدور حولها ثمانية كواكب. جرّب عرضها على حيطة الفصل!', text_en: 'Illustrated panel: the Sun in the middle with eight planets orbiting around it.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'المجموعة الشمسية ☀️', quiz: { q: 'كم عدد كواكب المجموعة الشمسية؟', choices: [ { t: '8 كواكب', ok: true }, { t: '5 كواكب', ok: false }, { t: '10 كواكب', ok: false } ] } },
    ],
  };
}
function seedDemoIfNeeded() {
  const existing = loadLocal(LS_LESSONS, null);
  if (existing) return existing;
  const list = [buildDemoLesson()];
  saveLocal(LS_LESSONS, list);
  return list;
}

/* ================= طبقة البيانات: Supabase أو محلي ================= */
function getLessons() {
  if (lessonsCache) return lessonsCache;
  if (isRemote()) return [];
  return loadLocal(LS_LESSONS, null) ?? seedDemoIfNeeded();
}
function saveLessons(list) {
  lessonsCache = list;
  if (!isRemote()) saveLocal(LS_LESSONS, list); // في وضع Supabase الحفظ يتم عبر الـ API مباشرة
}
async function loadLessons() {
  if (isRemote()) {
    let q = supabase.from('lessons').select('*').order('created_at', { ascending: false });
    if (!isAdmin()) q = q.eq('teacher_id', session.id);
    const { data, error } = await q;
    if (error) throw new Error('تعذّر تحميل الدروس: ' + friendlyAuthError(error));
    const ids = (data || []).map((l) => l.id);
    let items = [];
    if (ids.length) {
      const { data: it, error: e2 } = await supabase.from('items').select('*').in('lesson_id', ids).order('sort_order', { ascending: true });
      if (e2) throw new Error('تعذّر تحميل العناصر: ' + friendlyAuthError(e2));
      items = it || [];
    }
    lessonsCache = (data || []).map((l) => ({ ...l, items: items.filter((i) => i.lesson_id === l.id) }));
    return lessonsCache;
  }
  lessonsCache = loadLocal(LS_LESSONS, null) ?? seedDemoIfNeeded();
  return lessonsCache;
}
async function fetchPublicLesson(id) {
  if (!supabase) return null;
  const { data: l, error } = await supabase.from('lessons').select('*').eq('id', id).maybeSingle();
  if (error || !l) return null;
  const { data: items } = await supabase.from('items').select('*').eq('lesson_id', id).order('sort_order', { ascending: true });
  return { ...l, items: items || [] };
}
function findLocalLesson(id) {
  const list = loadLocal(LS_LESSONS, null) || [];
  return list.find((l) => l.id === id) || null;
}
async function uploadToStorage(fileOrBlob, filename, lessonId) {
  const safe = String(filename).replace(/[^\w.\-]+/g, '_');
  const path = `${session.id}/${lessonId}/${Date.now()}_${safe}`;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, fileOrBlob, {
    upsert: true, contentType: fileOrBlob.type || 'application/octet-stream',
  });
  if (error) throw new Error('فشل رفع الملف: ' + friendlyAuthError(error));
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
// صف العنصر كما يُحفظ في جدول items (بدون حقول محلية مثل textPanel)
function itemRow(it, lessonId, sortOrder) {
  return {
    id: it.id, lesson_id: lessonId, sort_order: sortOrder,
    kind: it.kind, title: it.title, text_ar: it.text_ar || '', text_en: it.text_en || '',
    file_url: it.file_url || '', glb_url: it.glb_url || '',
    placement: it.placement, size: it.size,
    audio_url: it.audio_url || '', video_url: it.video_url || '',
    quiz: it.quiz || null,
  };
}

/* ================= تتبّع الزيارات ================= */
function getVisitorId() {
  let vid = null;
  try { vid = localStorage.getItem(LS_VISITOR); } catch {}
  if (!vid) {
    vid = uid('vis');
    try { localStorage.setItem(LS_VISITOR, vid); } catch {}
  }
  return vid;
}
async function recordVisit(path) {
  if (!supabase) return; // لا تتبّع في الوضع المحلي
  try {
    const day = new Date().toISOString().slice(0, 10);
    const device = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
    await supabase.from('site_visits').insert({
      visitor_id: getVisitorId(), path, referrer: document.referrer || '', device, day,
    });
    // خطأ التكرار (نفس الزائر/المسار/اليوم) متوقَّع ويُتجاهل — الصف موجود أصلًا
  } catch {}
}

/* ================= التنقّل بين الصفحات ================= */
const VIEWS = ['view-home', 'view-auth', 'view-dashboard', 'view-editor', 'view-student', 'view-print', 'view-library', 'view-worksheet'];
function showView(id) {
  VIEWS.forEach((v) => $(v).classList.toggle('hidden', v !== id));
  window.scrollTo({ top: 0 });
  const logged = !!getSession();
  $('navDashBtn').classList.toggle('hidden', !logged);
  $('navLogoutBtn').classList.toggle('hidden', !logged);
  $('navAdminBtn').classList.toggle('hidden', !(logged && isAdmin()));
}
function publicLink(lessonId) { return location.origin + location.pathname + '?lesson=' + lessonId; }

/* ================= المصادقة ================= */
let authMode = 'login'; // أو signup

async function fetchProfile(userId) {
  const { data } = await supabase.from('teachers').select('id,email,name,is_admin,brand_name,brand_logo_url').eq('id', userId).maybeSingle();
  return data || null;
}
async function applySupabaseUser(user) {
  let profile = await fetchProfile(user.id);
  if (!profile) {
    // سجّل قبل إنشاء صف teachers (مثلًا أكّد بريده بعد التسجيل) — أنشئ الصف الآن
    const { error } = await supabase.from('teachers').insert({ id: user.id, email: user.email, name: user.email.split('@')[0] });
    if (!error) profile = await fetchProfile(user.id);
  }
  setSession({
    id: user.id, email: user.email,
    name: profile?.name || user.email.split('@')[0],
    is_admin: !!profile?.is_admin, mode: 'supabase',
    brand_name: profile?.brand_name || '', brand_logo_url: profile?.brand_logo_url || '',
  });
  lessonsCache = null;
}
async function tryLocalLogin(email, pass) {
  const teachers = loadLocal(LS_TEACHERS, [{ email: 'demo@darsak.ar', password_hash: await sha256('123456'), name: 'معلّم تجريبي' }]);
  const t = teachers.find((x) => x.email === email);
  if (!t || t.password_hash !== await sha256(pass)) return false;
  setSession({ email, name: t.name, is_admin: false, mode: 'local' });
  lessonsCache = null;
  return true;
}
function initAuth() {
  $('authToggle').onclick = (e) => {
    e.preventDefault();
    authMode = authMode === 'login' ? 'signup' : 'login';
    $('authTitle').textContent = authMode === 'login' ? 'تسجيل الدخول — المعلّم' : 'إنشاء حساب معلّم جديد';
    $('authSubmit').textContent = authMode === 'login' ? 'دخول' : 'إنشاء الحساب';
    $('authToggle').textContent = authMode === 'login' ? 'ليس لديك حساب؟ أنشئ حسابًا مجانيًا' : 'لديك حساب؟ سجّل الدخول';
  };
  $('authSubmit').onclick = async () => {
    const email = $('authEmail').value.trim().toLowerCase();
    const pass = $('authPass').value;
    const name = $('authName').value.trim();
    if (!email.includes('@') || pass.length < 6) return showMsg($('authMsg'), 'أدخل بريدًا صحيحًا وكلمة سر 6 أحرف على الأقل');
    $('authSubmit').disabled = true;
    try {
      if (supabase) {
        if (authMode === 'signup') {
          const { data, error } = await supabase.auth.signUp({ email, password: pass });
          if (error) throw new Error(friendlyAuthError(error));
          if (data.user) {
            // صف المعلّم في جدول teachers (يتجاهل الفشل إن كان موجودًا)
            await supabase.from('teachers').insert({ id: data.user.id, email, name: name || 'معلّم' });
          }
          if (data.session?.user) {
            await applySupabaseUser(data.session.user);
          } else {
            // تأكيد البريد مُلغى من Supabase: الدخول يكون مباشرة بالحساب الجديد
            const { data: s2, error: e2 } = await supabase.auth.signInWithPassword({ email, password: pass });
            if (e2 || !s2?.user) {
              authMode = 'login';
              $('authTitle').textContent = 'تسجيل الدخول — المعلّم';
              $('authSubmit').textContent = 'دخول';
              $('authToggle').textContent = 'ليس لديك حساب؟ أنشئ حسابًا مجانيًا';
              showMsg($('authMsg'), 'تم إنشاء الحساب ✅ — اضغط «دخول» الآن.', true);
              return;
            }
            await applySupabaseUser(s2.user);
          }
        } else {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
          if (error) {
            // رجوع للحساب التجريبي المحلي (يعمل حتى دون اتصال)
            const ok = await tryLocalLogin(email, pass);
            if (!ok) throw new Error(friendlyAuthError(error));
          } else if (data.user) {
            await applySupabaseUser(data.user);
          }
        }
      } else {
        // الوضع المحلي: حساب تجريبي + حسابات محفوظة في localStorage
        const teachers = loadLocal(LS_TEACHERS, [{ email: 'demo@darsak.ar', password_hash: await sha256('123456'), name: 'معلّم تجريبي' }]);
        if (authMode === 'signup') {
          if (teachers.some((t) => t.email === email)) throw new Error('هذا البريد مسجّل من قبل — جرّب تسجيل الدخول');
          teachers.push({ email, password_hash: await sha256(pass), name: name || 'معلّم' });
          saveLocal(LS_TEACHERS, teachers);
          setSession({ email, name: name || 'معلّم', is_admin: false, mode: 'local' });
        } else {
          const ok = await tryLocalLogin(email, pass);
          if (!ok) throw new Error('البريد أو كلمة السر غير صحيحة');
        }
      }
      showMsg($('authMsg'), '', true);
      renderDashboard();
    } catch (e) { showMsg($('authMsg'), e.message || 'حدث خطأ'); }
    finally { $('authSubmit').disabled = false; }
  };
}

/* ================= لوحة المعلّم ================= */
// الاسم المعروض: إن كان فارغًا أو مجرد أول الإيميل (مثل ahm3d.atti2) نعرض «معلّم»
const displayName = (s) => (s?.name && s.name !== s.email?.split('@')[0] ? s.name : 'معلّم');
async function renderDashboard() {
  const sess = getSession();
  if (!sess) { showView('view-auth'); return; }
  $('teacherName').textContent = displayName(sess);
  const bn = $('brandName'); if (bn) bn.value = sess.brand_name || '';
  const bp = $('brandPreview'); if (bp) bp.innerHTML = sess.brand_logo_url ? `<img src="${esc(sess.brand_logo_url)}" alt="شعار السنتر" style="width:64px;height:64px;border-radius:12px;object-fit:cover">` : '';
  $('lessonsHeading').textContent = isAdmin() ? 'كل الدروس — عرض الأدمن' : 'دروسي';
  showView('view-dashboard');
  let lessons;
  try { lessons = await loadLessons(); }
  catch (e) { $('lessonsList').innerHTML = `<div class="card"><div class="error">${esc(e.message)}</div></div>`; return; }
  if (isAdmin()) {
    try {
      const { data } = await supabase.from('teachers').select('id,email').order('created_at', { ascending: true });
      teacherEmails = {};
      (data || []).forEach((t) => { teacherEmails[t.id] = t.email; });
    } catch {}
  }
  $('lessonsList').innerHTML = lessons.length ? lessons.map((l) => `
    <div class="card lesson-card">
      <div class="thumb">📚</div>
      <div class="lesson-meta">
        <h3>${esc(l.title)}</h3>
        <span class="badge">${esc(l.subject || 'بدون مادة')}</span>
        <span class="badge">${esc(l.grade || '')}</span>
        <span class="badge orange">👁️ ${l.views || 0} مشاهدة</span>
        <span class="badge">${(l.items || []).length} عنصر</span>
        ${isAdmin() && teacherEmails[l.teacher_id] ? `<span class="badge">👤 ${esc(teacherEmails[l.teacher_id])}</span>` : ''}
        <p class="hint">${esc(l.description || '')}</p>
        <div class="row">
          <button class="btn btn-primary btn-sm" onclick="window.__editLesson('${l.id}')">✏️ تحرير وعناصر</button>
          <button class="btn btn-ghost btn-sm" onclick="window.__openStudent('${l.id}')">👀 عرض الطالب</button>
          <button class="btn btn-ghost btn-sm" onclick="window.__openPrint('${l.id}')">🖨️ طباعة QR</button>
          <button class="btn btn-ghost btn-sm" onclick="window.__startLive('${l.id}')">📡 حصة مباشرة</button>
          <button class="btn btn-ghost btn-sm" onclick="window.__toggleShare('${l.id}')">${l.shared ? '✓ مشترك' : '🔗 مشاركة مع المعلمين'}</button>
          <button class="btn btn-ghost btn-sm" onclick="window.__openWorksheet('${l.id}')">📄 ورقة شغل</button>
          <button class="btn btn-danger btn-sm" onclick="window.__deleteLesson('${l.id}')">🗑️ حذف</button>
        </div>
      </div>
    </div>`).join('') : '<div class="card">لا توجد دروس بعد — أنشئ أول درس من الأعلى 👆</div>';
  if (isAdmin()) renderAdmin();
  else $('adminSection').classList.add('hidden');
  renderReports();
}
window.__editLesson = (id) => openEditor(id);
window.__openStudent = (id) => { location.hash = ''; history.pushState(null, '', '?lesson=' + id); openStudent(id); };
window.__openPrint = (id) => { history.pushState(null, '', '?print=' + id); openPrint(id); };
window.__deleteLesson = async (id) => {
  if (!confirm('حذف هذا الدرس نهائيًا؟')) return;
  if (isRemote()) {
    const { error } = await supabase.from('lessons').delete().eq('id', id);
    if (error) { alert('تعذّر حذف الدرس: ' + friendlyAuthError(error)); return; }
  }
  saveLessons(getLessons().filter((l) => l.id !== id));
  renderDashboard();
};

/* ================= لوحة الأدمن ================= */
async function renderAdmin() {
  $('adminSection').classList.remove('hidden');
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  try {
    const [usersRes, lessonsRes, visitsRes, todayRes] = await Promise.all([
      supabase.from('teachers').select('id,email,name,created_at').order('created_at', { ascending: false }),
      supabase.from('lessons').select('id,teacher_id,views'),
      supabase.from('site_visits').select('id', { count: 'exact', head: true }),
      supabase.from('site_visits').select('id', { count: 'exact', head: true }).eq('day', today),
    ]);
    const users = usersRes.data || [];
    const lessons = lessonsRes.data || [];
    const totalViews = lessons.reduce((s, l) => s + (l.views || 0), 0);
    const lessonsByTeacher = {};
    lessons.forEach((l) => { lessonsByTeacher[l.teacher_id] = (lessonsByTeacher[l.teacher_id] || 0) + 1; });
    $('adminStats').innerHTML = [
      ['👥', users.length, 'مستخدم'],
      ['📚', lessons.length, 'درس'],
      ['👁️', totalViews, 'مشاهدة دروس'],
      ['🌐', visitsRes.count ?? 0, 'زيارة للموقع'],
      ['📅', todayRes.count ?? 0, 'زيارة اليوم'],
    ].map(([ico, num, lbl]) => `<div class="stat-card"><div class="num">${ico} ${num}</div><div class="lbl">${lbl}</div></div>`).join('');
    $('usersTable').innerHTML = users.length ? `
      <table class="admin-table">
        <thead><tr><th>الاسم</th><th>البريد</th><th>الدروس</th><th>تاريخ الانضمام</th></tr></thead>
        <tbody>${users.map((u) => `<tr>
          <td>${esc(u.name || '—')}${u.is_admin ? ' 👑' : ''}</td>
          <td dir="ltr" style="text-align:right">${esc(u.email)}</td>
          <td>${lessonsByTeacher[u.id] || 0}</td>
          <td>${esc((u.created_at || '').slice(0, 10))}</td>
        </tr>`).join('')}</tbody>
      </table>` : '<p class="hint">لا يوجد مستخدمون بعد.</p>';
  } catch (e) {
    $('adminStats').innerHTML = `<div class="error">${esc(e.message || 'تعذّر تحميل إحصائيات الأدمن')}</div>`;
  }
  // الزيارات حسب المصدر + حسب اليوم (آخر 7 أيام)
  try {
    const { data } = await supabase.from('site_visits').select('referrer,day').gte('day', weekAgo).limit(2000);
    const rows = data || [];
    const byRef = {};
    rows.forEach((r) => {
      let host = 'مباشر / بدون مصدر';
      try { if (r.referrer) host = new URL(r.referrer).hostname.replace(/^www\./, ''); } catch { host = r.referrer || host; }
      byRef[host] = (byRef[host] || 0) + 1;
    });
    const topRef = Object.entries(byRef).sort((a, b) => b[1] - a[1]).slice(0, 8);
    $('referrerStats').innerHTML = topRef.length ? topRef.map(([h, c]) =>
      `<div class="ref-row"><span>${esc(h)}</span><b>${c}</b></div>`).join('') : '<p class="hint">لا توجد زيارات مسجّلة بعد.</p>';
    const byDay = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      byDay[d] = 0;
    }
    rows.forEach((r) => { if (r.day in byDay) byDay[r.day]++; });
    const max = Math.max(1, ...Object.values(byDay));
    $('dailyVisits').innerHTML = Object.entries(byDay).map(([d, c]) =>
      `<div class="day-row"><span>${esc(d)}</span><div class="day-bar"><div style="width:${Math.round((c / max) * 100)}%"></div></div><b>${c}</b></div>`).join('');
  } catch {
    $('referrerStats').innerHTML = '<p class="hint">تعذّر تحميل بيانات الزيارات.</p>';
    $('dailyVisits').innerHTML = '';
  }
}

/* ================= محرر الدرس ================= */
let currentLessonId = null;
let currentKind = 'image';
let currentPlacement = 'wall';
let currentSize = 'medium';
let editingItemId = null;

function segInit(containerId, attr, cb) {
  $(containerId).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $(containerId).querySelectorAll('button').forEach((x) => x.classList.remove('active'));
    b.classList.add('active'); cb(b.dataset[attr]);
  });
}

async function openEditor(id) {
  currentLessonId = id;
  try { await loadLessons(); } catch {}
  const lesson = getLessons().find((l) => l.id === id);
  if (!lesson) return;
  $('editorTitle').textContent = '✏️ ' + lesson.title;
  $('editorMeta').textContent = `${lesson.subject || ''} • ${lesson.grade || ''} • 👁️ ${lesson.views || 0} مشاهدة`;
  $('publicLink').value = publicLink(id);
  showView('view-editor');
  renderItems();
  drawQR(publicLink(id));
}
function renderItems() {
  const lesson = getLessons().find((l) => l.id === currentLessonId);
  const items = lesson?.items || [];
  $('itemsList').innerHTML = items.length ? items.map((it, i) => `
    <div class="card lesson-card">
      <div class="thumb">${it.kind === 'model' ? '🧊' : '🖼️'}</div>
      <div class="lesson-meta">
        <h3>${i + 1}. ${esc(it.title)}</h3>
        <span class="badge">${it.placement === 'wall' ? '🧱 على الحيطة' : '🟫 على الأرض'}</span>
        <span class="badge">${SIZE_LABEL[it.size] || it.size}</span>
        ${it.audio_url ? '<span class="badge">🔊 صوت</span>' : ''}
        ${it.video_url ? '<span class="badge">🎬 فيديو</span>' : ''}
        ${it.quiz ? '<span class="badge">❓ سؤال</span>' : ''}
        <p class="hint">${esc(it.text_ar || '')}</p>
        <div class="row">
          <button class="btn btn-ghost btn-sm" onclick="window.__moveItem('${it.id}',-1)" ${i === 0 ? 'disabled' : ''}>⬆️ فوق</button>
          <button class="btn btn-ghost btn-sm" onclick="window.__moveItem('${it.id}',1)" ${i === items.length - 1 ? 'disabled' : ''}>⬇️ تحت</button>
          <button class="btn btn-ghost btn-sm" onclick="window.__editItem('${it.id}')">✏️ تعديل</button>
          <button class="btn btn-danger btn-sm" onclick="window.__deleteItem('${it.id}')">🗑️ حذف</button>
        </div>
      </div>
    </div>`).join('') : '<div class="card">لا توجد عناصر بعد — أضف أول عنصر من النموذج أعلاه 👆</div>';
}
window.__moveItem = async (id, dir) => {
  const lessons = getLessons(); const lesson = lessons.find((l) => l.id === currentLessonId);
  if (!lesson) return;
  const i = lesson.items.findIndex((x) => x.id === id); const j = i + dir;
  if (i < 0 || j < 0 || j >= lesson.items.length) return;
  [lesson.items[i], lesson.items[j]] = [lesson.items[j], lesson.items[i]];
  if (isRemote()) {
    const a = lesson.items[i], b = lesson.items[j];
    const { error } = await supabase.from('items').update({ sort_order: i }).eq('id', a.id);
    const { error: e2 } = error ? {} : await supabase.from('items').update({ sort_order: j }).eq('id', b.id);
    if (error || e2) { alert('تعذّر إعادة الترتيب: ' + friendlyAuthError(error || e2)); return; }
  }
  saveLessons(lessons); renderItems();
};
window.__deleteItem = async (id) => {
  if (!confirm('حذف هذا العنصر؟')) return;
  if (isRemote()) {
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) { alert('تعذّر حذف العنصر: ' + friendlyAuthError(error)); return; }
  }
  const lessons = getLessons(); const lesson = lessons.find((l) => l.id === currentLessonId);
  lesson.items = lesson.items.filter((x) => x.id !== id);
  saveLessons(lessons); renderItems();
};
window.__editItem = (id) => {
  const lesson = getLessons().find((l) => l.id === currentLessonId);
  const it = lesson.items.find((x) => x.id === id); if (!it) return;
  editingItemId = id;
  $('itemTitle').value = it.title; $('itemTextAr').value = it.text_ar || '';
  $('itemTextEn').value = it.text_en || ''; $('itemVideo').value = it.video_url || '';
  fillQuizForm(it.quiz);
  currentPlacement = it.placement; currentSize = it.size; currentKind = it.kind;
  document.querySelectorAll('#placementToggle button').forEach((b) => b.classList.toggle('active', b.dataset.placement === it.placement));
  document.querySelectorAll('#sizeSeg button').forEach((b) => b.classList.toggle('active', b.dataset.size === it.size));
  document.querySelectorAll('#kindToggle button').forEach((b) => b.classList.toggle('active', b.dataset.kind === it.kind));
  $('fileInfo').textContent = 'تعديل: اترك حقل الملف فارغًا للاحتفاظ بالملف الحالي.';
  $('addItemBtn').textContent = '💾 حفظ التعديلات';
  window.scrollTo({ top: 0 });
};

/* ---- إضافة / تعديل عنصر ---- */
async function addItem() {
  const title = $('itemTitle').value.trim();
  if (!title) return showMsg($('editorMsg'), 'عنوان العنصر مطلوب');
  const file = $('itemFile').files[0];
  const audioFile = $('itemAudio').files[0];
  if (!editingItemId && !file) return showMsg($('editorMsg'), 'اختر ملف الصورة أو النموذج أولًا');
  if (!checkFileSize(file) || !checkFileSize(audioFile)) return;
  const btn = $('addItemBtn'); btn.disabled = true;
  const prog = $('uploadProgress'); prog.classList.remove('hidden');
  const bar = prog.querySelector('div');
  try {
    let fileUrl = '', glbUrl = '';
    if (file) {
      bar.style.width = '30%';
      if (currentKind === 'image') {
        // الصورة → ضغط + تحويل إلى .glb في المتصفح
        const { blob } = await imageFileToGlb(file, { maxWidth: 1200, quality: 0.82 });
        if (isRemote()) {
          glbUrl = await uploadToStorage(new File([blob], title.replace(/\s+/g, '_') + '.glb', { type: 'model/gltf-binary' }), title.replace(/\s+/g, '_') + '.glb', currentLessonId);
          fileUrl = glbUrl;
        } else {
          glbUrl = URL.createObjectURL(blob); fileUrl = glbUrl;
        }
        $('fileInfo').textContent = '✅ تم تحويل الصورة إلى لوحة 3D (.glb) بنسبة أبعادها الأصلية.';
      } else {
        if (!/\.(glb|gltf)$/i.test(file.name)) throw new Error('ملف النموذج يجب أن يكون .glb أو .gltf');
        if (isRemote()) {
          glbUrl = await uploadToStorage(file, file.name, currentLessonId); fileUrl = glbUrl;
        } else {
          glbUrl = URL.createObjectURL(file); fileUrl = glbUrl;
        }
      }
    }
    let audioUrl = '';
    if (audioFile) {
      audioUrl = isRemote()
        ? await uploadToStorage(audioFile, audioFile.name, currentLessonId)
        : URL.createObjectURL(audioFile);
    }
    bar.style.width = '80%';
    const lessons = getLessons(); const lesson = lessons.find((l) => l.id === currentLessonId);
    if (!lesson) throw new Error('الدرس غير موجود');
    lesson.items = lesson.items || [];
    if (editingItemId) {
      const old = lesson.items.find((x) => x.id === editingItemId);
      const updated = {
        ...old, kind: currentKind, title, text_ar: $('itemTextAr').value.trim(),
        text_en: $('itemTextEn').value.trim(), placement: currentPlacement, size: currentSize,
        file_url: fileUrl || old.file_url, glb_url: glbUrl || old.glb_url,
        audio_url: audioUrl || old.audio_url, video_url: $('itemVideo').value.trim(),
        quiz: readQuizForm(),
      };
      if (isRemote()) {
        const { error } = await supabase.from('items').update(itemRow(updated, currentLessonId, lesson.items.indexOf(old))).eq('id', editingItemId);
        if (error) throw new Error('فشل حفظ التعديل: ' + friendlyAuthError(error));
      }
      Object.assign(old, updated);
      editingItemId = null; $('addItemBtn').textContent = '➕ أضف العنصر للدرس';
    } else {
      const item = {
        id: uid('itm'), kind: currentKind,
        title, text_ar: $('itemTextAr').value.trim(), text_en: $('itemTextEn').value.trim(),
        file_url: fileUrl, glb_url: glbUrl, placement: currentPlacement, size: currentSize,
        audio_url: audioUrl, video_url: $('itemVideo').value.trim(),
        quiz: readQuizForm(),
      };
      if (isRemote()) {
        const { error } = await supabase.from('items').insert(itemRow(item, currentLessonId, lesson.items.length));
        if (error) throw new Error('فشل حفظ العنصر: ' + friendlyAuthError(error));
      }
      lesson.items.push(item);
    }
    saveLessons(lessons);
    bar.style.width = '100%';
    showMsg($('editorMsg'), 'تم حفظ العنصر بنجاح ✅', true);
    $('itemTitle').value = ''; $('itemTextAr').value = ''; $('itemTextEn').value = ''; $('itemVideo').value = '';
    $('itemFile').value = ''; $('itemAudio').value = ''; $('fileInfo').textContent = '';
    clearQuizForm();
    renderItems();
  } catch (e) { showMsg($('editorMsg'), e.message || 'فشل حفظ العنصر'); }
  finally { btn.disabled = false; setTimeout(() => prog.classList.add('hidden'), 600); }
}

/* ================= QR محلي (بدون CDN) ================= */
// مكتبة qrcode-generator مضمّنة محليًا في lib/qrcode-generator.min.js.
// إن لم توجد مكتبة qrcode الخارجية، نعرّف QRCode.toCanvas بنفس الواجهة حتى يعمل الرمز دائمًا.
if (typeof QRCode === 'undefined' && typeof qrcode !== 'undefined') {
  window.QRCode = {
    toCanvas(canvas, text, opts = {}) {
      return new Promise((resolve, reject) => {
        try {
          const qr = qrcode(0, 'M');
          qr.addData(text);
          qr.make();
          const count = qr.getModuleCount();
          const margin = opts.margin ?? 2;
          const size = opts.width || 520;
          const cell = size / (count + margin * 2);
          const ctx = canvas.getContext('2d');
          canvas.width = size; canvas.height = size;
          ctx.fillStyle = (opts.color && opts.color.light) || '#ffffff';
          ctx.fillRect(0, 0, size, size);
          ctx.fillStyle = (opts.color && opts.color.dark) || '#000000';
          for (let r = 0; r < count; r++) {
            for (let c = 0; c < count; c++) {
              if (qr.isDark(r, c)) ctx.fillRect((c + margin) * cell, (r + margin) * cell, Math.ceil(cell), Math.ceil(cell));
            }
          }
          resolve();
        } catch (e) { reject(e); }
      });
    },
  };
}

/* ================= QR ================= */
// يرسم شعارًا في منتصف لوحة QR (براندنج المعلّم أو شعار المنصة) — يُستدعى بعد رسم الرمز
async function drawQrLogo(canvas, logoUrl, size = 110) {
  const ctx = canvas.getContext('2d');
  const img = new Image();
  if (/^https?:/.test(logoUrl || '')) img.crossOrigin = 'anonymous';
  img.src = logoUrl || '/public/darsak-ar-icon.png';
  await new Promise((res) => { img.onload = res; img.onerror = res; });
  if (!img.naturalWidth) return;
  const s = size, x = (canvas.width - s) / 2, y = (canvas.height - s) / 2;
  ctx.fillStyle = '#fff';
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x - 8, y - 8, s + 16, s + 16, 18); ctx.fill(); }
  else ctx.fillRect(x - 8, y - 8, s + 16, s + 16);
  ctx.drawImage(img, x, y, s, s);
}
function brandLogoUrl() { return getSession()?.brand_logo_url || '/public/darsak-ar-icon.png'; }
async function drawQR(text) {
  const canvas = $('qrCanvas');
  try {
    await QRCode.toCanvas(canvas, text, { width: 520, margin: 2, color: { dark: '#1E1B4B', light: '#ffffff' } });
    // الشعار في المنتصف (براندنج المعلّم إن وُجد، وإلا شعار المنصة)
    await drawQrLogo(canvas, brandLogoUrl());
  } catch (e) {
    console.warn('QR failed', e);
    // لا تترك مساحة بيضاء صامتة أبدًا: اكتب رسالة واضحة على اللوحة
    try {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#991b1b'; ctx.font = 'bold 24px Cairo, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('تعذّر إنشاء رمز QR', canvas.width / 2, canvas.height / 2);
    } catch {}
  }
}
function downloadQR() { const a = document.createElement('a'); a.href = $('qrCanvas').toDataURL('image/png'); a.download = 'darsak-ar-qr.png'; a.click(); }

/* ================= عرض الطالب ================= */
let studentLesson = null, studentIndex = 0, arSupported = false;

async function openStudent(id) {
  let lesson = null;
  if (!navigator.onLine) lesson = findOfflineLesson(id);
  if (!lesson && supabase) {
    try { lesson = await fetchPublicLesson(id); } catch (e) { console.warn('Supabase lesson fetch failed', e); }
  }
  if (!lesson) lesson = findLocalLesson(id);
  if (!lesson) lesson = await findLibraryLesson(id);
  if (!lesson && id === 'les_demo_solar') lesson = buildDemoLesson();
  if (!lesson) { alert('الدرس غير موجود'); return showView('view-home'); }
  // عدّاد المشاهدات + تسجيل الزيارة
  if (supabase) {
    recordVisit(id); // دون انتظار — صف واحد لكل زائر/درس/يوم
    try {
      await supabase.rpc('increment_lesson_views', { p_lesson_id: id });
    } catch {
      // رجوع: تحديث مباشر (ينجح فقط لمالك الدرس — الطالب المجهول يمنعه RLS)
      try { await supabase.from('lessons').update({ views: (lesson.views || 0) + 1 }).eq('id', id); } catch {}
    }
  }
  // النسخة المحلية أيضًا (الدرس التجريبي غير موجود في Supabase،
  // وبدون هذا السطر يظهر العدّاد 1 للطالب و0 في اللوحة)
  const _lessons = getLessons(); const _local = _lessons.find((l) => l.id === id);
  if (_local) { _local.views = (_local.views || 0) + 1; saveLessons(_lessons); lesson.views = _local.views; }
  else { lesson.views = (lesson.views || 0) + 1; }
  studentLesson = lesson; studentIndex = 0;
  startStudentSession(lesson);
  const q0 = new URLSearchParams(location.search);
  const it0 = parseInt(q0.get('item') || '0', 10);
  if (it0 > 0 && it0 < (lesson.items || []).length) studentIndex = it0;
  $('studentTitle').textContent = lesson.title;
  $('studentMeta').textContent = `${lesson.subject || ''} • ${lesson.grade || ''} • 👁️ ${lesson.views || 0} مشاهدة`;
  const brandEl = $('studentBrand');
  if (brandEl) {
    brandEl.innerHTML = (lesson.brand_name || lesson.brand_logo_url)
      ? `${lesson.brand_logo_url ? `<img src="${esc(lesson.brand_logo_url)}" alt="" style="width:52px;height:52px;border-radius:12px;object-fit:cover;vertical-align:middle">` : ''} <b style="font-size:19px">${esc(lesson.brand_name || '')}</b>`
      : '';
  }
  showView('view-student');
  renderStudentItem();
  // هل يدعم الجهاز AR؟ (WebXR أو Scene Viewer)
  arSupported = ('xr' in navigator) || /Android/i.test(navigator.userAgent);
}
function itemGlbUrl(it) {
  if (it.glb_url) return it.glb_url;
  if (it.textPanel) {
    // لوحة نصية تجريبية: تُبنى عند الطلب من canvas
    return textPanelDataUrl(it.textPanel);
  }
  return '';
}
// لوحة نصية كصورة (fallback للعنصر التجريبي بدون ملف) — تُحوَّل إلى glb عند أول عرض
let textPanelCache = {};
async function textPanelDataUrl(text) {
  if (textPanelCache[text]) return textPanelCache[text];
  const { textPanelToGlb } = await import('./lib/image-to-glb.js');
  const { url } = await textPanelToGlb(text, { bg: '#4F46E5' });
  textPanelCache[text] = url; return url;
}
async function renderStudentItem() {
  const items = studentLesson.items || [];
  if (!items.length) { $('studentItems').innerHTML = '<div class="card">هذا الدرس بلا عناصر بعد.</div>'; return; }
  explodeFactor = 0;
  const it = items[studentIndex];
  const src = await itemGlbUrl(it);
  const scale = SIZE_M[it.size] || 1;
  const yt = youtubeId(it.video_url);
  $('itemDots').textContent = `${studentIndex + 1} / ${items.length}`;
  const liveGuest = liveRole === 'guest';
  $('prevItemBtn').disabled = studentIndex === 0 || liveGuest;
  $('nextItemBtn').disabled = studentIndex === items.length - 1 || liveGuest;
  $('studentItems').innerHTML = `
    <article class="item-card">
      <model-viewer id="mv" src="${esc(src)}" alt="${esc(it.title)}"
        ar ar-modes="webxr scene-viewer quick-look" ar-placement="${it.placement === 'floor' ? 'floor' : 'wall'}"
        ar-scale="fixed" camera-controls auto-rotate shadow
        style="--ar-scale:${scale}" data-size-m="${scale}">
        ${hotspotsHtml(it)}
      </model-viewer>
      <div class="item-body">
        <h2>${esc(it.title)}</h2>
        ${it.text_ar ? `<p>${esc(it.text_ar)}</p>` : ''}
        ${it.text_en ? `<p class="hint" dir="ltr" style="text-align:left">${esc(it.text_en)}</p>` : ''}
        ${!arSupported ? `<div class="ar-fallback">⚠️ هاتفك لا يدعم الواقع المعزّز (AR) — يمكنك تدوير النموذج بإصبعك على الشاشة ومشاهدته بتقنية 3D. جرّب متصفح Chrome على أندرويد حديث يدعم ARCore.</div>` : ''}
        <button class="btn btn-orange" id="launchArBtn" type="button">📷 ${it.placement === 'floor' ? 'اعرض على الأرض' : 'اعرض على الحيطة'}</button>
        ${it.kind === 'model' ? `<div class="row" style="align-items:center"><button class="btn btn-ghost" id="explodeBtn" type="button" onclick="window.__toggleExplode()">🧩 فكّك الأجزاء</button><input type="range" id="explodeRange" min="0" max="100" value="0" style="flex:1" oninput="window.__explodeRange(this.value)" aria-label="مستوى التفكيك"></div>` : ''}
        ${it.audio_url ? `<div style="margin-top:12px"><button class="btn btn-ghost audio-btn" id="playAudioBtn" type="button">🔊 اسمع الشرح الصوتي</button><audio id="itemAudioEl" src="${esc(it.audio_url)}" preload="none"></audio></div>` : ''}
        ${yt ? `<div class="video-wrap"><iframe src="https://www.youtube.com/embed/${yt}" allowfullscreen loading="lazy" title="فيديو الشرح"></iframe></div>`
          : (it.video_url ? `<p style="margin-top:12px"><a href="${esc(it.video_url)}" target="_blank" rel="noopener">🎬 شاهد الفيديو</a></p>` : '')}
        <p class="hint" style="margin-top:10px">الحجم: ${SIZE_LABEL[it.size] || ''} • المكان: ${it.placement === 'floor' ? 'على الأرض' : 'على الحيطة'}</p>
        ${quizHtml(it)}
      </div>
    </article>`;
  const mv = $('mv');
  // الحجم الحقيقي: model-viewer يقبل scale عبر خاصية scale بعد التحميل
  mv.addEventListener('load', () => { try { mv.scale = `${scale} ${scale} ${scale}`; } catch {} });
  $('launchArBtn').onclick = () => {
    if (mv.activateAR) mv.activateAR().catch(() => alert('تعذّر تشغيل الـ AR على هذا الجهاز — جرّب Chrome على أندرويد، وتأكد من تفعيل ARCore.'));
    else alert('هذا المتصفح لا يدعم تشغيل AR مباشرة.');
  };
  const playBtn = $('playAudioBtn');
  if (playBtn) playBtn.onclick = () => { const a = $('itemAudioEl'); a.paused ? a.play() : a.pause(); playBtn.textContent = a.paused ? '🔊 اسمع الشرح الصوتي' : '⏸️ إيقاف الصوت'; };
  // Lazy-load: النموذج الحالي فقط يُبنى — باقي العناصر لا تُحمّل حتى التنقّل إليها
}

/* ================= الإصدار 2: المكتبة + الأسئلة + الحصة المباشرة + التقارير ================= */

// ---------- 1) مكتبة المنهج ----------
let libFilters = { grade: '', subject: '', term: '' };
async function openLibrary() {
  showView('view-library');
  const lib = await loadLibrary();
  if (!lib) { $('libraryGrid').innerHTML = '<div class="card">تعذّر تحميل المكتبة — تحقق من الاتصال وأعد المحاولة.</div>'; return; }
  const fill = (id, items, all) => {
    const sel = $(id);
    if (sel.options.length > 1) return;
    items.forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
    sel.value = all;
  };
  fill('libGrade', lib.grades, libFilters.grade);
  fill('libSubject', lib.subjects, libFilters.subject);
  fill('libTerm', lib.terms, libFilters.term);
  $('libGrade').onchange = (e) => { libFilters.grade = e.target.value; renderLibrary(); };
  $('libSubject').onchange = (e) => { libFilters.subject = e.target.value; renderLibrary(); };
  $('libTerm').onchange = (e) => { libFilters.term = e.target.value; renderLibrary(); };
  renderLibrary();
  renderShared();
}
function renderLibrary() {
  const lib = libraryCache; if (!lib) return;
  const list = lib.lessons.filter((l) =>
    (!libFilters.grade || l.grade === libFilters.grade) &&
    (!libFilters.subject || l.subject === libFilters.subject) &&
    (!libFilters.term || l.term === libFilters.term));
  $('libraryCount').textContent = `📚 ${list.length} درس — اختر واطبع الـ QR على طول`;
  $('libraryGrid').innerHTML = list.length ? list.map((l) => `
    <div class="card lib-card">
      <div class="thumb">📚</div>
      <div class="lesson-meta">
        <h3>${esc(l.title)}</h3>
        <span class="badge">${esc(l.subject)}</span>
        <span class="badge">${esc(l.grade)}</span>
        <span class="badge">${esc(l.term)}</span>
        <span class="badge orange">${l.items.length} عنصر</span>
        <span class="badge">${l.items.filter((i) => i.quiz).length} سؤال</span>
        <p class="hint">${esc(l.description || '')}</p>
        <div class="row">
          <button class="btn btn-primary btn-sm" onclick="window.__viewLibraryLesson('${l.id}')">👀 عرض</button>
          <button class="btn btn-orange btn-sm" style="width:auto" onclick="window.__copyLibrary('${l.id}')">➕ أضف إلى دروسي</button>
          <button class="btn btn-ghost btn-sm" onclick="window.__printLibrary('${l.id}')">🖨️ طباعة QR</button>
        </div>
      </div>
    </div>`).join('') : '<div class="card">لا توجد دروس مطابقة — جرّب تصفية مختلفة.</div>';
}
async function copyLibraryLesson(id) {
  const src = await findLibraryLesson(id);
  if (!src) { alert('الدرس غير موجود في المكتبة'); return; }
  await copyLessonFrom(src, ' (من مكتبة المنهج)');
}
async function copyLessonFrom(src, suffix = '') {
  const sess = getSession();
  if (!sess) { showView('view-auth'); return; }
  const countEl = $('libraryCount');
  if (countEl) countEl.textContent = '⏳ جارٍ نسخ الدرس — تجهيز اللوحات والرفع...';
  const lesson = {
    id: uid('les'), teacher_id: isRemote() ? sess.id : (sess?.email || 'local'),
    title: src.title, subject: src.subject, grade: src.grade,
    description: (src.description || '') + suffix,
    views: 0, created_at: new Date().toISOString(),
    items: src.items.map((it) => ({ ...it, id: uid('itm') })),
    brand_name: sess?.brand_name || '', brand_logo_url: sess?.brand_logo_url || '',
    shared: false,
  };
  if (isRemote()) {
    try { await prepareItemsForRemote(lesson.items, lesson.id); }
    catch (e) { renderLibrary(); alert('تعذّر تجهيز لوحات الدرس: ' + e.message); return; }
    const { error } = await supabase.from('lessons').insert({
      id: lesson.id, teacher_id: sess.id, title: lesson.title,
      subject: lesson.subject, grade: lesson.grade, description: lesson.description,
      brand_name: lesson.brand_name, brand_logo_url: lesson.brand_logo_url,
    });
    if (error) { renderLibrary(); alert('تعذّر نسخ الدرس: ' + friendlyAuthError(error)); return; }
    const { error: e2 } = await supabase.from('items').insert(lesson.items.map((it, i) => itemRow(it, lesson.id, i)));
    if (e2) { renderLibrary(); alert('تعذّر نسخ العناصر: ' + friendlyAuthError(e2)); return; }
  }
  const lessons = getLessons(); lessons.unshift(lesson); saveLessons(lessons);
  renderDashboard(); openEditor(lesson.id);
}
window.__copyLibrary = copyLibraryLesson;
window.__viewLibraryLesson = (id) => { history.pushState(null, '', '?lesson=' + id); openStudent(id); };
window.__printLibrary = (id) => { history.pushState(null, '', '?print=' + id); openPrint(id); };

// ---------- 2) أسئلة الفهم داخل الـ AR ----------
let quizAnswers = {}; // itemId -> {choice, correct}
function quizTotals() {
  const items = (studentLesson?.items || []).filter((it) => it.quiz);
  const answered = items.filter((it) => quizAnswers[it.id]);
  const correct = answered.filter((it) => quizAnswers[it.id].correct).length;
  return { score: correct, total: items.length, answered: answered.length };
}
function hotspotsHtml(it) {
  if (it.kind !== 'model' || !it.quiz) return '';
  const ans = quizAnswers[it.id];
  return it.quiz.choices.map((c, i) => {
    if (!c.pos) return '';
    const cls = ans ? (c.ok ? 'correct' : (ans.choice === i ? 'wrong' : '')) : '';
    return `<button slot="hotspot-${i}" data-position="${c.pos.join(' ')}" class="hotspot ${cls}" type="button" onclick="window.__answerQuiz('${it.id}', ${i})">${esc(c.t)}</button>`;
  }).join('');
}
function quizHtml(it) {
  const q = it?.quiz; if (!q) return '';
  const ans = quizAnswers[it.id];
  return `<div class="quiz-block">
    <h3>❓ ${esc(q.q)}</h3>
    <div class="quiz-choices">${q.choices.map((c, i) => {
      const cls = ans ? (c.ok ? 'correct' : (ans.choice === i ? 'wrong' : '')) : '';
      return `<button class="btn btn-ghost quiz-choice ${cls}" type="button" onclick="window.__answerQuiz('${it.id}', ${i})" ${ans ? 'disabled' : ''}>${esc(c.t)}</button>`;
    }).join('')}</div>
    ${ans
      ? `<p class="quiz-result ${ans.correct ? 'ok' : 'bad'}">${ans.correct ? '✅ إجابة صحيحة! أحسنت.' : '❌ إجابة غير صحيحة — الإجابة الصحيحة مظللة بالأخضر.'}</p>`
      : '<p class="hint">دوس على الجزء الصح في المجسّم، أو اختر من الأزرار.</p>'}
  </div>`;
}
window.__answerQuiz = (itemId, idx) => {
  if (quizAnswers[itemId] || !studentLesson) return;
  const it = studentLesson.items.find((x) => x.id === itemId);
  if (!it?.quiz) return;
  const choice = it.quiz.choices[idx];
  if (!choice) return;
  quizAnswers[itemId] = { choice: idx, correct: !!choice.ok };
  renderStudentItem();
  const t = quizTotals();
  if (t.answered === t.total && t.total > 0) {
    const fb = $('finishLessonBtn');
    if (fb) {
      fb.textContent = `🏁 أنهيت كل الأسئلة (${t.score}/${t.total}) — اعرض نتيجتي`;
      fb.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
};
// حقول سؤال الفهم في محرر العناصر
function readQuizForm() {
  const q = $('quizQ').value.trim();
  const cs = [$('quizC1').value.trim(), $('quizC2').value.trim(), $('quizC3').value.trim()].filter(Boolean);
  if (!q || cs.length < 2) return null;
  const ok = Math.min(parseInt($('quizCorrect').value || '0', 10) || 0, cs.length - 1);
  return { q, choices: cs.map((t, i) => ({ t, ok: i === ok })) };
}
function fillQuizForm(quiz) {
  $('quizQ').value = quiz?.q || '';
  const cs = quiz?.choices || [];
  $('quizC1').value = cs[0]?.t || ''; $('quizC2').value = cs[1]?.t || ''; $('quizC3').value = cs[2]?.t || '';
  $('quizCorrect').value = String(Math.max(0, cs.findIndex((c) => c.ok)));
}
function clearQuizForm() {
  $('quizQ').value = ''; $('quizC1').value = ''; $('quizC2').value = ''; $('quizC3').value = ''; $('quizCorrect').value = '0';
}

// ---------- 3) الحصة المباشرة (المعلّم يتحكم — الطلاب يتبعونه) ----------
let liveChannel = null, liveRole = null, liveCode = null;
function updateLiveBanner() {
  const bar = $('liveBanner'); if (!bar) return;
  const joinRow = $('liveJoinRow');
  if (liveRole === 'host') {
    bar.classList.remove('hidden');
    bar.innerHTML = `📡 <b>حصة مباشرة جارية</b> — كود الطلاب: <span class="code" dir="ltr">${liveCode}</span> — قلّب بين العناصر من الأسفل وكل موبايلات الطلاب تتقلب معك. <button class="btn btn-danger btn-sm" type="button" onclick="window.__leaveLive()">إنهاء الحصة</button>`;
    if (joinRow) joinRow.classList.add('hidden');
  } else if (liveRole === 'guest') {
    bar.classList.remove('hidden');
    bar.innerHTML = `🎛️ <b>أنت في حصة مباشرة</b> — المعلّم يتحكم في العرض الآن، وموبايلك يتقلب معه تلقائيًا. <button class="btn btn-ghost btn-sm" type="button" onclick="window.__leaveLive()">مغادرة الحصة</button>`;
    if (joinRow) joinRow.classList.add('hidden');
  } else {
    bar.classList.add('hidden');
    if (joinRow) joinRow.classList.remove('hidden');
  }
}
async function startLive(lessonId) {
  if (!supabase) { alert('وضع الحصة المباشرة يحتاج اتصالًا بالإنترنت — فعّل Supabase أولًا.'); return; }
  const code = String(Math.floor(1000 + Math.random() * 9000));
  await openStudent(lessonId);
  liveRole = 'host'; liveCode = code;
  liveChannel = supabase.channel('live-' + code);
  liveChannel.subscribe();
  updateLiveBanner(); renderStudentItem();
}
async function joinLive() {
  const code = ($('liveCodeInput').value || '').trim();
  if (!/^\d{4}$/.test(code)) { alert('أدخل كود الحصة المكوّن من 4 أرقام'); return; }
  if (!supabase) { alert('وضع الحصة المباشرة يحتاج اتصالًا بالإنترنت.'); return; }
  if (liveChannel) leaveLive();
  liveRole = 'guest'; liveCode = code;
  liveChannel = supabase.channel('live-' + code);
  liveChannel
    .on('broadcast', { event: 'goto' }, ({ payload }) => {
      if (studentLesson && typeof payload?.index === 'number') {
        studentIndex = Math.max(0, Math.min(payload.index, studentLesson.items.length - 1));
        renderStudentItem();
      }
    })
    .on('broadcast', { event: 'end' }, () => { leaveLive(); alert('انتهت الحصة المباشرة — يمكنك الآن تصفّح الدرس بحرية.'); })
    .subscribe();
  updateLiveBanner(); renderStudentItem();
}
function leaveLive() {
  if (liveRole === 'host' && liveChannel) {
    try { liveChannel.send({ type: 'broadcast', event: 'end', payload: {} }); } catch {}
  }
  if (liveChannel) { try { supabase.removeChannel(liveChannel); } catch {} liveChannel = null; }
  liveRole = null; liveCode = null;
  updateLiveBanner(); renderStudentItem();
}
function broadcastGoto() {
  if (liveRole === 'host' && liveChannel) {
    try { liveChannel.send({ type: 'broadcast', event: 'goto', payload: { index: studentIndex } }); } catch {}
  }
}
function navStudent(dir) {
  if (liveRole === 'guest') return; // المعلّم يتحكم أثناء الحصة
  if (!studentLesson) return;
  const n = studentIndex + dir;
  if (n < 0 || n >= studentLesson.items.length) return;
  studentIndex = n; renderStudentItem(); broadcastGoto();
}
window.__startLive = startLive;
window.__joinLive = joinLive;
window.__leaveLive = leaveLive;

// ---------- 4) جلسة الطالب + تقارير المعلّم ----------
let activitySeconds = 0, activityTimer = null, activitySaved = false;
function studentName() { try { return localStorage.getItem(LS_STUDENT) || ''; } catch { return ''; } }
function startStudentSession(lesson) {
  quizAnswers = {}; activitySeconds = 0; activitySaved = false;
  clearInterval(activityTimer);
  activityTimer = setInterval(() => { if (document.visibilityState === 'visible') activitySeconds += 5; }, 5000);
  const bar = $('studentNameBar'); if (!bar) return;
  const name = studentName();
  if (name) {
    bar.innerHTML = `<span>👤 أهلًا <b>${esc(name)}</b> — نتيجتك ووقتك في هذا الدرس يُحفظان في تقرير المعلّم.</span> <button class="btn btn-ghost btn-sm" type="button" onclick="window.__changeStudentName()">تغيير الاسم</button>`;
  } else {
    bar.innerHTML = `<input id="studentNameInput" placeholder="اكتب اسمك (مثال: عمر أحمد)" style="max-width:260px"> <button class="btn btn-primary btn-sm" type="button" onclick="window.__saveStudentName()">ابدأ الدرس</button>`;
  }
  updateLiveBanner();
}
window.__saveStudentName = () => {
  const v = $('studentNameInput').value.trim();
  if (!v) { alert('اكتب اسمك أولًا — حتى يظهر في تقرير المعلّم'); return; }
  try { localStorage.setItem(LS_STUDENT, v); } catch {}
  startStudentSession(studentLesson);
};
window.__changeStudentName = () => {
  try { localStorage.removeItem(LS_STUDENT); } catch {}
  startStudentSession(studentLesson);
};
async function saveActivity() {
  if (activitySaved || !studentLesson) return;
  activitySaved = true;
  const t = quizTotals();
  const row = {
    lesson_id: studentLesson.id, student_name: studentName() || 'طالب بدون اسم',
    seconds: activitySeconds, quiz_score: t.score, quiz_total: t.total,
    created_at: new Date().toISOString(),
  };
  const list = loadLocal(LS_ACTIVITY, []); list.push(row); saveLocal(LS_ACTIVITY, list.slice(-500));
  if (supabase) {
    try {
      await supabase.from('student_activity').insert({
        lesson_id: row.lesson_id, student_name: row.student_name,
        seconds: row.seconds, quiz_score: row.quiz_score, quiz_total: row.quiz_total,
      });
    } catch {}
  }
}
window.__finishLesson = async () => {
  await saveActivity();
  const t = quizTotals();
  const mins = Math.max(1, Math.round(activitySeconds / 60));
  const myRows = myActivityRows();
  const stats = studentStats(myRows);
  const myBadges = badgesFor(myRows);
  const box = $('finishResult');
  box.classList.remove('hidden');
  box.innerHTML = `<h3>🏁 انتهى الدرس!</h3>
    <p>⏱️ قضيت حوالي <b>${mins} دقيقة</b> في هذا الدرس.</p>
    <p>❓ نتيجتك في الأسئلة: <b>${t.total ? `${t.score} من ${t.total} (${Math.round((t.score / t.total) * 100)}%)` : 'لا توجد أسئلة في هذا الدرس'}</b></p>
    <p>⭐ نقاطك حتى الآن: <b>${stats.points}</b> (كل إجابة صحيحة +5، وإنهاء الدرس +10)</p>
    ${myBadges.length ? `<p>🎖️ شاراتك: ${myBadges.map((b) => `${b.icon} ${b.title}`).join(' • ')}</p>` : ''}
    <p class="hint">تم حفظ تقريرك عند المعلّم ✅ — يمكنك تصفّح الدرس مرة أخرى من الأعلى.</p>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
};
function fmtMins(s) { const m = Math.floor((s || 0) / 60); return m < 1 ? 'أقل من دقيقة' : m + ' دقيقة'; }
let reportAggCache = [];
async function loadReports() {
  let rows = loadLocal(LS_ACTIVITY, []);
  if (supabase && getSession()) {
    try {
      const lessons = await loadLessons();
      const ids = lessons.map((l) => l.id);
      if (ids.length) {
        const { data } = await supabase.from('student_activity').select('*').in('lesson_id', ids).order('created_at', { ascending: false }).limit(300);
        if (data?.length) rows = [...data.map((r) => ({ ...r, seconds: r.seconds || 0 })), ...rows];
      }
    } catch {}
  }
  return rows;
}
async function renderReports() {
  const box = $('reportsList'); if (!box) return;
  const rows = await loadReports();
  const lessons = getLessons();
  const title = (id) => lessons.find((l) => l.id === id)?.title || id;
  const agg = {};
  rows.forEach((r) => {
    const k = (r.student_name || '؟') + '|' + r.lesson_id;
    const a = agg[k] || (agg[k] = { student: r.student_name || '؟', lesson: r.lesson_id, seconds: 0, best: 0, total: 0, count: 0, last: '', points: 0 });
    a.seconds += r.seconds || 0; a.count++; a.points += pointsForRow(r);
    if (r.quiz_total) { a.best = Math.max(a.best, Math.round((r.quiz_score / r.quiz_total) * 100)); a.total++; }
    if (!a.last || (r.created_at || '') > a.last) a.last = r.created_at || '';
  });
  reportAggCache = Object.values(agg).sort((a, b) => (b.last || '').localeCompare(a.last || ''));
  const byStudent = {};
  rows.forEach((r) => { const k = r.student_name || '؟'; (byStudent[k] = byStudent[k] || []).push(r); });
  const board = Object.entries(byStudent).map(([name, rs]) => ({ name, ...studentStats(rs) })).sort((a, b) => b.points - a.points).slice(0, 10);
  const boardHtml = board.length ? `<h3>🏆 لوحة شرف الفصل</h3><div class="table-wrap"><table class="admin-table">
    <tr><th>#</th><th>الطالب</th><th>النقاط</th><th>دروس</th><th>إجابات صحيحة</th><th>شارات</th></tr>
    ${board.map((b, i) => `<tr><td>${i + 1}</td><td>${esc(b.name)}</td><td><b>${b.points}</b></td><td>${b.lessons}</td><td>${b.correct}</td><td>${badgesFor(byStudent[b.name]).map((x) => x.icon + ' ' + x.title).join(' • ') || '—'}</td></tr>`).join('')}
  </table></div>` : '';
  box.innerHTML = boardHtml + (reportAggCache.length ? `<div class="table-wrap"><table class="admin-table">
    <tr><th>الطالب</th><th>الدرس</th><th>الوقت</th><th>النقاط</th><th>أفضل نتيجة</th><th>آخر نشاط</th><th></th></tr>
    ${reportAggCache.map((a, i) => `<tr><td>${esc(a.student)}</td><td>${esc(title(a.lesson))}</td><td>${fmtMins(a.seconds)}</td><td><b>${a.points || 0}</b></td><td>${a.total ? a.best + '%' : '—'}</td><td>${a.last ? a.last.slice(0, 10) : ''}</td><td><button class="btn btn-ghost btn-sm" type="button" onclick="window.__waReport(${i})">📲 واتساب لولي الأمر</button></td></tr>`).join('')}
  </table></div>` : '<p class="hint">لا توجد تقارير بعد — ستظهر هنا بعد أن يفتح الطلاب دروسك ويجيبوا على الأسئلة.</p>');
}
window.__waReport = (i) => {
  const a = reportAggCache[i]; if (!a) return;
  const title = getLessons().find((l) => l.id === a.lesson)?.title || a.lesson;
  const phone = prompt('رقم واتساب ولي الأمر (بالصيغة الدولية، مثال: 2010xxxxxxx):');
  if (!phone) return;
  const text = `📚 تقرير درسك AR — الطالب: ${a.student}\nالدرس: ${title}\nالوقت داخل الدرس: ${fmtMins(a.seconds)}\nأفضل نتيجة في الأسئلة: ${a.total ? a.best + '%' : 'لم يجب على أسئلة بعد'}`;
  window.open('https://wa.me/' + phone.replace(/\D/g, '') + '?text=' + encodeURIComponent(text), '_blank');
};

/* ================= الإصدار 3: براندنج + دون نت + ورقة شغل + مشاركة + قوالب + تفكيك + صور + نقاط ================= */

// ---------- براندنج المعلّم ----------
async function saveBrand() {
  const sess = getSession(); if (!sess) return;
  const name = $('brandName').value.trim();
  const file = $('brandLogo').files[0];
  let logoUrl = sess.brand_logo_url || '';
  try {
    if (file) {
      if (!checkFileSize(file)) return;
      logoUrl = isRemote()
        ? await uploadToStorage(file, file.name, 'brand')
        : URL.createObjectURL(file);
    }
    if (isRemote()) {
      const { error } = await supabase.from('teachers').update({ brand_name: name, brand_logo_url: logoUrl }).eq('id', sess.id);
      if (error) throw new Error(friendlyAuthError(error));
      await supabase.from('lessons').update({ brand_name: name, brand_logo_url: logoUrl }).eq('teacher_id', sess.id);
    } else {
      try { localStorage.setItem('darsak.brand.v1', JSON.stringify({ name, logo: logoUrl })); } catch {}
      const lessons = getLessons();
      lessons.forEach((l) => { l.brand_name = name; l.brand_logo_url = logoUrl; });
      saveLessons(lessons);
    }
    sess.brand_name = name; sess.brand_logo_url = logoUrl;
    lessonsCache = null;
    showMsg($('brandMsg'), 'تم حفظ البراندنج ✅ — سيظهر اسم السنتر وشعاره للطلاب وفي الـ QR', true);
    renderDashboard();
  } catch (e) { showMsg($('brandMsg'), 'تعذّر حفظ البراندنج: ' + (e.message || e)); }
}
window.__saveBrand = saveBrand;

// ---------- دون نت ----------
function findOfflineLesson(id) {
  const map = loadLocal(LS_OFFLINE, {});
  return map[id] || null;
}
async function downloadLessonOffline() {
  if (!studentLesson) return;
  const btn = $('downloadOfflineBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ جارٍ التنزيل...'; }
  try {
    const map = loadLocal(LS_OFFLINE, {});
    map[studentLesson.id] = studentLesson;
    saveLocal(LS_OFFLINE, map);
    const urls = [];
    (studentLesson.items || []).forEach((it) => {
      if (it.glb_url) urls.push(it.glb_url);
      if (it.file_url && it.file_url !== it.glb_url && !String(it.file_url).startsWith('blob:')) urls.push(it.file_url);
      if (it.audio_url) urls.push(it.audio_url);
    });
    if (urls.length && 'caches' in window) {
      const cache = await caches.open('darsak-lessons-v1');
      await Promise.allSettled(urls.map((u) => cache.add(u).catch(() => {})));
    }
    if (btn) btn.textContent = '✅ تم التنزيل — يعمل دون نت';
    renderOfflineList();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = '⬇️ نزّل الدرس دون نت'; }
    alert('تعذّر التنزيل: ' + e.message);
  }
}
function renderOfflineList() {
  const box = $('offlineList'); const sec = $('offlineSection');
  if (!box || !sec) return;
  const list = Object.values(loadLocal(LS_OFFLINE, {}));
  sec.classList.toggle('hidden', !list.length);
  box.innerHTML = list.map((l) => `
    <div class="card lib-card">
      <div class="thumb">📴</div>
      <div class="lesson-meta">
        <h3>${esc(l.title)}</h3>
        <span class="badge">${esc(l.subject || '')}</span>
        <span class="badge">${esc(l.grade || '')}</span>
        <span class="badge">${(l.items || []).length} عنصر</span>
        <div class="row">
          <button class="btn btn-primary btn-sm" onclick="window.__openStudent('${l.id}')">👀 فتح دون نت</button>
          <button class="btn btn-danger btn-sm" onclick="window.__removeOffline('${l.id}')">🗑️ حذف</button>
        </div>
      </div>
    </div>`).join('');
}
window.__downloadOffline = downloadLessonOffline;
window.__removeOffline = (id) => { const map = loadLocal(LS_OFFLINE, {}); delete map[id]; saveLocal(LS_OFFLINE, map); renderOfflineList(); };

// ---------- ورقة شغل AR مطبوعة ----------
async function resolveLesson(id) {
  let lesson = null;
  if (supabase) { try { lesson = await fetchPublicLesson(id); } catch {} }
  if (!lesson) lesson = findLocalLesson(id);
  if (!lesson) lesson = await findLibraryLesson(id);
  if (!lesson) lesson = findOfflineLesson(id);
  if (!lesson && id === 'les_demo_solar') lesson = buildDemoLesson();
  return lesson;
}
async function openWorksheet(id) {
  const lesson = await resolveLesson(id);
  showView('view-worksheet');
  const sheet = $('worksheetSheet');
  if (!lesson) { sheet.innerHTML = '<h2>الدرس غير موجود</h2><p>الرابط غير صحيح أو أن الدرس حُذف.</p>'; return; }
  const items = lesson.items || [];
  const quizItems = items.map((it, i) => ({ it, i })).filter(({ it }) => it.quiz);
  sheet.innerHTML = `
    <img class="logo" src="/public/darsak-ar-icon.png" alt="درسك AR">
    <h1>درسك <span style="font-family:'Space Grotesk';background:#EA580C;color:#fff;border-radius:999px;padding:2px 10px">AR</span></h1>
    ${lesson.brand_name ? `<p style="font-size:20px;font-weight:900">🏫 ${esc(lesson.brand_name)}</p>` : ''}
    <h2>📄 ورقة شغل: ${esc(lesson.title)}</h2>
    <p>${esc(lesson.subject || '')} • ${esc(lesson.grade || '')}</p>
    <p class="ws-meta">الاسم: ______________________ &nbsp; التاريخ: ____ / ____ / ________</p>
    ${quizItems.length ? quizItems.map(({ it, i }) => `
      <div class="ws-q">
        <h3>${esc(it.title)}</h3>
        <p><b>❓ ${esc(it.quiz.q)}</b></p>
        <div class="ws-choices">${it.quiz.choices.map((c) => `<p>☐ ${esc(c.t)}</p>`).join('')}</div>
        <p>امسح الرمز بكاميرا الموبايل لمشاهدة المجسم وحل السؤال:</p>
        <canvas class="ws-qr" width="160" height="160" data-link="${esc(publicLink(id) + '&item=' + i)}"></canvas>
      </div>`).join('') : '<p>هذا الدرس بلا أسئلة بعد — أضف أسئلة من المحرر لتظهر في ورقة الشغل.</p>'}
    <div class="ws-notes"><h3>ملاحظات:</h3><p>________________________________________________________</p><p>________________________________________________________</p></div>
    <p class="hint">${esc(publicLink(id))}</p>`;
  for (const c of sheet.querySelectorAll('.ws-qr')) {
    try { await QRCode.toCanvas(c, c.dataset.link, { width: 160, margin: 1, color: { dark: '#1E1B4B', light: '#ffffff' } }); } catch {}
  }
}
window.__openWorksheet = (id) => { history.pushState(null, '', '?worksheet=' + id); openWorksheet(id); };

// ---------- مشاركة الدروس بين المعلّمين ----------
async function prepareItemsForRemote(items, lessonId) {
  // لوحات النص لا تُحفظ في جدول items — حوّلها إلى .glb وارفعها للتخزين أولًا
  const { textPanelToGlb } = await import('./lib/image-to-glb.js');
  for (const it of items) {
    if (it.textPanel && !it.glb_url) {
      const { blob } = await textPanelToGlb(it.textPanel, { bg: '#4F46E5' });
      it.glb_url = await uploadToStorage(new File([blob], 'panel.glb', { type: 'model/gltf-binary' }), 'panel.glb', lessonId);
      it.file_url = it.glb_url;
    }
  }
}
async function loadSharedLessons() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from('lessons').select('id,title,subject,grade,description,views,teacher_id,created_at,brand_name,brand_logo_url').eq('shared', true).order('created_at', { ascending: false }).limit(50);
    if (error) return [];
    return data || [];
  } catch { return []; }
}
async function renderShared() {
  const box = $('sharedGrid'); if (!box) return;
  const list = await loadSharedLessons();
  const sess = getSession();
  box.innerHTML = list.length ? list.map((l) => `
    <div class="card lib-card">
      <div class="thumb">🤝</div>
      <div class="lesson-meta">
        <h3>${esc(l.title)}</h3>
        <span class="badge">${esc(l.subject || 'بدون مادة')}</span>
        <span class="badge">${esc(l.grade || '')}</span>
        ${l.brand_name ? `<span class="badge orange">🏫 ${esc(l.brand_name)}</span>` : ''}
        <span class="badge">👁️ ${l.views || 0}</span>
        <p class="hint">${esc(l.description || '')}</p>
        <div class="row">
          <button class="btn btn-primary btn-sm" onclick="window.__viewLibraryLesson('${l.id}')">👀 عرض</button>
          ${sess ? `<button class="btn btn-orange btn-sm" style="width:auto" onclick="window.__copyShared('${l.id}')">📋 خذ نسخة وعدّل عليها</button>` : ''}
        </div>
      </div>
    </div>`).join('') : '<p class="hint">لا توجد دروس مشتركة بعد — كن أول من يشارك درسًا مع زملائه!</p>';
}
window.__toggleShare = async (id) => {
  const lessons = getLessons(); const lesson = lessons.find((l) => l.id === id); if (!lesson) return;
  const next = !lesson.shared;
  if (isRemote()) {
    const { error } = await supabase.from('lessons').update({ shared: next }).eq('id', id);
    if (error) { alert('تعذّر تغيير المشاركة: ' + friendlyAuthError(error)); return; }
  }
  lesson.shared = next; saveLessons(lessons); renderDashboard();
};
window.__copyShared = async (id) => {
  const src = await fetchPublicLesson(id);
  if (!src) { alert('الدرس غير موجود'); return; }
  await copyLessonFrom(src, ' (نسخة من درس مشترك)');
};

// ---------- تفكيك المجسم (وضع الفصل) ----------
let explodeFactor = 0;
async function applyExplode(factor) {
  const mv = $('mv'); if (!mv || !mv.model) return;
  explodeFactor = factor;
  const THREE = await import('three');
  const model = mv.model;
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.userData.darsakOrig) o.userData.darsakOrig = o.position.clone();
    const ob = new THREE.Box3().setFromObject(o);
    const oc = ob.getCenter(new THREE.Vector3());
    const dir = oc.sub(center);
    if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
    dir.normalize();
    o.position.copy(o.userData.darsakOrig).addScaledVector(dir, factor);
  });
}
window.__toggleExplode = async () => {
  const next = explodeFactor > 0 ? 0 : 0.5;
  await applyExplode(next);
  const btn = $('explodeBtn');
  if (btn) btn.textContent = next > 0 ? '🔩 ركّب الأجزاء' : '🧩 فكّك الأجزاء';
  const rg = $('explodeRange'); if (rg) rg.value = String(Math.round((next / 0.6) * 100));
};
window.__explodeRange = (v) => {
  const f = (Number(v) / 100) * 0.6;
  applyExplode(f);
  const btn = $('explodeBtn');
  if (btn) btn.textContent = Number(v) > 0 ? '🔩 ركّب الأجزاء' : '🧩 فكّك الأجزاء';
};

// ---------- صوّر نفسك مع الدرس ----------
let photoStream = null;
async function openPhotoMode() {
  const modal = $('photoModal'); if (!modal) return;
  modal.classList.remove('hidden');
  try {
    photoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    const v = $('photoVideo'); v.srcObject = photoStream; await v.play();
  } catch (e) { alert('تعذّر فتح الكاميرا — تأكد من السماح بالكاميرا ومن فتح الموقع عبر HTTPS.'); closePhotoMode(); }
}
function closePhotoMode() {
  const modal = $('photoModal'); if (modal) modal.classList.add('hidden');
  if (photoStream) { photoStream.getTracks().forEach((t) => t.stop()); photoStream = null; }
}
async function capturePhoto() {
  const v = $('photoVideo'); const c = $('photoCanvas');
  if (!v || !v.videoWidth) { alert('الكاميرا لم تجهز بعد — انتظر ثانية وحاول مجددًا.'); return; }
  c.width = v.videoWidth; c.height = v.videoHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(v, 0, 0, c.width, c.height);
  const barH = Math.round(c.height * 0.14);
  ctx.fillStyle = '#1E1B4B'; ctx.fillRect(0, c.height - barH, c.width, barH);
  ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(barH * 0.42)}px Cairo, sans-serif`; ctx.textAlign = 'center';
  const brand = studentLesson?.brand_name ? `🏫 ${studentLesson.brand_name} • ` : '';
  ctx.fillText(`${brand}${studentLesson?.title || 'درسك AR'}`, c.width / 2, c.height - barH * 0.36);
  ctx.font = `700 ${Math.round(barH * 0.28)}px Cairo, sans-serif`; ctx.fillStyle = '#A5B4FC';
  ctx.fillText('درسك AR — الدرس قدامك.. على الحيطة • www.drsak.online', c.width / 2, c.height - barH * 0.08);
  c.classList.remove('hidden');
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const dl = $('photoDownload'); dl.href = url; dl.download = 'darsak-photo.png'; dl.classList.remove('hidden');
  const sh = $('photoShare');
  if (navigator.canShare) {
    const file = new File([blob], 'darsak-photo.png', { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      sh.classList.remove('hidden');
      sh.onclick = () => navigator.share({ files: [file], title: 'درسك AR', text: `صورة مع درس «${studentLesson?.title || ''}»` }).catch(() => {});
    }
  }
}
window.__openPhotoMode = openPhotoMode;
window.__closePhotoMode = closePhotoMode;
window.__capturePhoto = capturePhoto;

// ---------- نقاط وشارات ولوحة شرف ----------
const POINTS_PER_CORRECT = 5, POINTS_PER_FINISH = 10;
function pointsForRow(r) { return (r.quiz_score || 0) * POINTS_PER_CORRECT + POINTS_PER_FINISH; }
const BADGES = [
  { id: 'first', icon: '🌱', title: 'أول درس', test: (s) => s.lessons >= 1 },
  { id: 'explorer', icon: '🧭', title: 'مستكشف', test: (s) => s.lessons >= 3 },
  { id: 'perfect', icon: '💯', title: 'علامة كاملة', test: (s) => s.perfect },
  { id: 'star50', icon: '⭐', title: '50 نقطة', test: (s) => s.points >= 50 },
  { id: 'star100', icon: '🏆', title: 'بطل الفصل', test: (s) => s.points >= 100 },
];
function studentStats(rows) {
  const lessons = new Set(rows.map((r) => r.lesson_id)).size;
  const points = rows.reduce((a, r) => a + pointsForRow(r), 0);
  const perfect = rows.some((r) => r.quiz_total > 0 && r.quiz_score === r.quiz_total);
  const correct = rows.reduce((a, r) => a + (r.quiz_score || 0), 0);
  return { lessons, points, perfect, correct, rows: rows.length };
}
function badgesFor(rows) { const s = studentStats(rows); return BADGES.filter((b) => b.test(s)); }
function myActivityRows() {
  const name = studentName();
  if (!name) return [];
  return loadLocal(LS_ACTIVITY, []).filter((r) => r.student_name === name);
}

/* ================= صفحة الطباعة ================= */
async function openPrint(id) {
  let lesson = null;
  if (supabase) {
    try { lesson = await fetchPublicLesson(id); } catch {}
  }
  if (!lesson) lesson = findLocalLesson(id);
  if (!lesson) lesson = await findLibraryLesson(id);
  if (!lesson && id === 'les_demo_solar') lesson = buildDemoLesson();
  showView('view-print');
  const sheet = $('printSheet');
  if (!lesson) {
    sheet.innerHTML = '<h2>الدرس غير موجود</h2><p>الرابط غير صحيح أو أن الدرس حُذف.</p>';
    return;
  }
  const link = publicLink(id);
  sheet.innerHTML = `
    <img class="logo" src="/public/darsak-ar-icon.png" alt="درسك AR">
    <h1>درسك <span style="font-family:'Space Grotesk';background:#EA580C;color:#fff;border-radius:999px;padding:2px 10px">AR</span></h1>
    ${lesson.brand_name || lesson.brand_logo_url ? `<div style="margin:6px 0 2px">${lesson.brand_logo_url ? `<img src="${esc(lesson.brand_logo_url)}" alt="" style="width:72px;height:72px;border-radius:16px;object-fit:cover;vertical-align:middle"> ` : ''}<b style="font-size:22px">${esc(lesson.brand_name || '')}</b></div>` : ''}
    <h2>${esc(lesson.title)}</h2>
    <p>${esc(lesson.subject || '')} • ${esc(lesson.grade || '')}</p>
    <div class="qr-print"><canvas id="printQr" width="520" height="520" style="width:100%"></canvas></div>
    <p><b>امسح الرمز بكاميرا الموبايل لفتح الدرس</b></p>
    <div class="steps">
      <p>1️⃣ افتح كاميرا الموبايل ووجّهها للرمز.</p>
      <p>2️⃣ اضغط الرابط الذي يظهر.</p>
      <p>3️⃣ اضغط الزر البرتقالي «اعرض على الحيطة».</p>
      <p>4️⃣ وجّه الكاميرا على حيطة أو أرض فاضية وحرّك الموبايل ببطء.</p>
    </div>
    <p class="hint">${esc(link)}</p>`;
  try { await QRCode.toCanvas($('printQr'), link, { width: 520, margin: 2, color: { dark: '#1E1B4B', light: '#ffffff' } }); } catch {}
  try { await drawQrLogo($('printQr'), lesson.brand_logo_url || '/public/darsak-ar-icon.png', 90); } catch {}
}

/* ================= إنشاء درس ================= */
async function createLesson() {
  const title = $('newTitle').value.trim();
  if (!title) return showMsg($('dashMsg'), 'عنوان الدرس مطلوب');
  const sess = getSession();
  const lesson = { id: uid('les'), teacher_id: isRemote() ? sess.id : (sess?.email || 'local'), title, subject: $('newSubject').value.trim(), grade: $('newGrade').value.trim(), description: $('newDesc').value.trim(), views: 0, created_at: new Date().toISOString(), items: [], brand_name: sess?.brand_name || '', brand_logo_url: sess?.brand_logo_url || '' };
  const templateId = $('newTemplate')?.value || 'blank';
  if (templateId !== 'blank') {
    try {
      const { TEMPLATES } = await import('./lib/curriculum.js');
      const tpl = TEMPLATES.find((t) => t.id === templateId);
      if (tpl) lesson.items = tpl.items.map((it) => ({ ...it, id: uid('itm') }));
    } catch (e) { console.warn('template load failed', e); }
  }
  if (isRemote()) {
    const { error } = await supabase.from('lessons').insert({
      id: lesson.id, teacher_id: sess.id, title: lesson.title,
      subject: lesson.subject, grade: lesson.grade, description: lesson.description,
      brand_name: lesson.brand_name, brand_logo_url: lesson.brand_logo_url,
    });
    if (error) { showMsg($('dashMsg'), 'تعذّر إنشاء الدرس: ' + friendlyAuthError(error)); return; }
    if (lesson.items.length) {
      try { await prepareItemsForRemote(lesson.items, lesson.id); }
      catch (e) { showMsg($('dashMsg'), 'تعذّر تجهيز عناصر القالب: ' + e.message); return; }
      const { error: e2 } = await supabase.from('items').insert(lesson.items.map((it, i) => itemRow(it, lesson.id, i)));
      if (e2) { showMsg($('dashMsg'), 'تعذّر حفظ عناصر القالب: ' + friendlyAuthError(e2)); return; }
    }
  }
  const lessons = getLessons(); lessons.unshift(lesson); saveLessons(lessons);
  $('newTitle').value = ''; $('newSubject').value = ''; $('newGrade').value = ''; $('newDesc').value = '';
  showMsg($('dashMsg'), 'تم إنشاء الدرس ✅ — أضف عناصره الآن', true);
  renderDashboard(); openEditor(lesson.id);
}

/* ================= تهيئة ================= */
function route() {
  const q = new URLSearchParams(location.search);
  if (q.get('lesson')) return openStudent(q.get('lesson'));
  if (q.get('print')) return openPrint(q.get('print'));
  if (q.get('library')) return openLibrary();
  if (q.get('worksheet')) return openWorksheet(q.get('worksheet'));
  if (getSession()) return renderDashboard();
  showView('view-home');
  recordVisit('/'); // زيارة الصفحة الرئيسية (صف واحد لكل زائر/يوم)
}
async function init() {
  await loadSupabaseClient();
  if (supabase) {
    // استعادة جلسة Supabase المحفوظة
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) await applySupabaseUser(data.session.user);
    } catch (e) { console.warn('getSession failed', e); }
    supabase.auth.onAuthStateChange(async (event, sess) => {
      if (sess?.user) { if (session?.mode !== 'supabase' || session.id !== sess.user.id) await applySupabaseUser(sess.user); }
      else if (event === 'SIGNED_OUT' && session?.mode === 'supabase') { setSession(null); lessonsCache = null; showView('view-home'); }
    });
  }
  // رجوع لجلسة محلية محفوظة (الحساب التجريبي)
  if (!session) {
    const s = loadLocal(LS_SESSION, null);
    if (s) { session = { ...s, mode: 'local' }; lessonsCache = null; }
  }
  if (session?.mode === 'local') {
    try { const b = JSON.parse(localStorage.getItem('darsak.brand.v1') || 'null'); if (b) { session.brand_name = b.name || ''; session.brand_logo_url = b.logo || ''; } } catch {}
  }
  if (!isRemote()) seedDemoIfNeeded();
  initAuth();
  segInit('kindToggle', 'kind', (v) => { currentKind = v; $('itemFile').accept = v === 'image' ? 'image/*' : '.glb,.gltf'; });
  segInit('placementToggle', 'placement', (v) => { currentPlacement = v; });
  segInit('sizeSeg', 'size', (v) => { currentSize = v; });
  $('itemFile').addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!checkFileSize(f)) { e.target.value = ''; return; }
    $('fileInfo').textContent = `الملف: ${f.name} — ${(f.size / 1048576).toFixed(2)}MB` + (currentKind === 'image' ? ' — سيُضغط ويُحوَّل إلى لوحة 3D (.glb).' : ' — نموذج 3D جاهز.');
  });
  $('itemAudio').addEventListener('change', (e) => { if (!checkFileSize(e.target.files[0])) e.target.value = ''; });
  $('addItemBtn').onclick = addItem;
  $('createLessonBtn').onclick = createLesson;
  $('copyLinkBtn').onclick = async () => { try { await navigator.clipboard.writeText($('publicLink').value); alert('تم نسخ الرابط ✅'); } catch { $('publicLink').select(); document.execCommand('copy'); } };
  $('downloadQrBtn').onclick = downloadQR;
  $('shareWaBtn').onclick = () => {
    const lesson = getLessons().find((l) => l.id === currentLessonId);
    const text = `📚 درس «${lesson?.title || ''}» — افتحه بالواقع المعزّز: ${$('publicLink').value}`;
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  };
  $('printBtn').onclick = () => window.__openPrint(currentLessonId);
  $('backToDash').onclick = renderDashboard;
  $('backFromPrint').onclick = () => {
    if (document.referrer && document.referrer.includes(location.host)) history.back();
    else { history.pushState(null, '', location.pathname); showView('view-home'); }
  };
  $('doPrintBtn').onclick = () => window.print();
  $('prevItemBtn').onclick = () => navStudent(-1);
  $('nextItemBtn').onclick = () => navStudent(1);
  $('joinLiveBtn').onclick = joinLive;
  $('finishLessonBtn').onclick = window.__finishLesson;
  $('saveBrandBtn').onclick = saveBrand;
  $('worksheetBtn').onclick = () => window.__openWorksheet(currentLessonId);
  $('doWorksheetPrintBtn').onclick = () => window.print();
  $('backFromWorksheet').onclick = () => {
    if (document.referrer && document.referrer.includes(location.host)) history.back();
    else { history.pushState(null, '', location.pathname); showView('view-home'); }
  };
  $('photoBtn').onclick = openPhotoMode;
  $('closePhotoBtn').onclick = closePhotoMode;
  $('capturePhotoBtn').onclick = capturePhoto;
  $('downloadOfflineBtn').onclick = downloadLessonOffline;
  $('ctaLibrary').onclick = () => { history.pushState(null, '', '?library=1'); openLibrary(); };
  $('dashLibraryBtn').onclick = () => { history.pushState(null, '', '?library=1'); openLibrary(); };
  window.addEventListener('pagehide', () => { if (studentLesson && !activitySaved) saveActivity(); });
  $('ctaTeacher').onclick = () => { getSession() ? renderDashboard() : showView('view-auth'); };
  $('ctaDemo').onclick = () => { history.pushState(null, '', '?lesson=les_demo_solar'); openStudent('les_demo_solar'); };
  $('navHomeBtn').onclick = () => { history.pushState(null, '', location.pathname); showView('view-home'); renderOfflineList(); };
  $('navDashBtn').onclick = renderDashboard;
  $('navAdminBtn').onclick = () => { renderDashboard().then(() => { const el = $('adminSection'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }); };
  $('navLogoutBtn').onclick = async () => {
    if (session?.mode === 'supabase' && supabase) { try { await supabase.auth.signOut(); } catch {} }
    setSession(null); lessonsCache = null; showView('view-home');
  };
  route();
  renderOfflineList();
}
init();
