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
      { id: 'itm_demo_1', kind: 'model', title: 'رائد الفضاء', text_ar: 'رائد الفضاء يسافر خارج الأرض في مركبة فضائية، ويرتدي بدلة خاصة تحميه وتحافظ على الهواء والأكسجين حوله.', text_en: 'An astronaut travels into space wearing a special suit that protects them and supplies air.', file_url: SAMPLE_MODELS + 'Astronaut.glb', glb_url: SAMPLE_MODELS + 'Astronaut.glb', placement: 'floor', size: 'medium', audio_url: '', video_url: '' },
      { id: 'itm_demo_2', kind: 'model', title: 'الروبوت المساعد', text_ar: 'الروبوتات تساعد روّاد الفضاء والعلماء في استكشاف الكواكب وجمع العينات من أماكن خطرة على الإنسان.', text_en: 'Robots help astronauts explore planets and collect samples from places too dangerous for humans.', file_url: SAMPLE_MODELS + 'RobotExpressive.glb', glb_url: SAMPLE_MODELS + 'RobotExpressive.glb', placement: 'floor', size: 'medium', audio_url: '', video_url: '' },
      { id: 'itm_demo_3', kind: 'model', title: 'الحصان — وسيلة نقل قديمة', text_ar: 'قبل السيارات والطائرات كان الحصان من أهم وسائل النقل. قارن بين سرعته وسرعة الصاروخ!', text_en: 'Before cars and planes, the horse was a key means of transport. Compare its speed with a rocket!', file_url: SAMPLE_MODELS + 'Horse.glb', glb_url: SAMPLE_MODELS + 'Horse.glb', placement: 'floor', size: 'large', audio_url: '', video_url: 'https://www.youtube.com/watch?v=libKVRa01X8' },
      { id: 'itm_demo_4', kind: 'image', title: 'لوحة المجموعة الشمسية', text_ar: 'هذه لوحة توضيحية: الشمس في الوسط، وتدور حولها ثمانية كواكب. جرّب عرضها على حيطة الفصل!', text_en: 'Illustrated panel: the Sun in the middle with eight planets orbiting around it.', file_url: '', glb_url: '', placement: 'wall', size: 'large', audio_url: '', video_url: '', textPanel: 'المجموعة الشمسية ☀️' },
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
const VIEWS = ['view-home', 'view-auth', 'view-dashboard', 'view-editor', 'view-student', 'view-print'];
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
  const { data } = await supabase.from('teachers').select('id,email,name,is_admin').eq('id', userId).maybeSingle();
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
          <button class="btn btn-danger btn-sm" onclick="window.__deleteLesson('${l.id}')">🗑️ حذف</button>
        </div>
      </div>
    </div>`).join('') : '<div class="card">لا توجد دروس بعد — أنشئ أول درس من الأعلى 👆</div>';
  if (isAdmin()) renderAdmin();
  else $('adminSection').classList.add('hidden');
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
async function drawQR(text) {
  const canvas = $('qrCanvas');
  try {
    await QRCode.toCanvas(canvas, text, { width: 520, margin: 2, color: { dark: '#1E1B4B', light: '#ffffff' } });
    // الشعار في المنتصف
    const ctx = canvas.getContext('2d');
    const img = new Image(); img.src = '/public/darsak-ar-icon.png';
    await new Promise((res) => { img.onload = res; img.onerror = res; });
    const s = 110, x = (canvas.width - s) / 2, y = (canvas.height - s) / 2;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(x - 8, y - 8, s + 16, s + 16, 18); ctx.fill();
    ctx.drawImage(img, x, y, s, s);
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
  if (supabase) {
    try { lesson = await fetchPublicLesson(id); } catch (e) { console.warn('Supabase lesson fetch failed', e); }
  }
  if (!lesson) lesson = findLocalLesson(id);
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
  $('studentTitle').textContent = lesson.title;
  $('studentMeta').textContent = `${lesson.subject || ''} • ${lesson.grade || ''} • 👁️ ${lesson.views || 0} مشاهدة`;
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
  const it = items[studentIndex];
  const src = await itemGlbUrl(it);
  const scale = SIZE_M[it.size] || 1;
  const yt = youtubeId(it.video_url);
  $('itemDots').textContent = `${studentIndex + 1} / ${items.length}`;
  $('prevItemBtn').disabled = studentIndex === 0;
  $('nextItemBtn').disabled = studentIndex === items.length - 1;
  $('studentItems').innerHTML = `
    <article class="item-card">
      <model-viewer id="mv" src="${esc(src)}" alt="${esc(it.title)}"
        ar ar-modes="webxr scene-viewer quick-look" ar-placement="${it.placement === 'floor' ? 'floor' : 'wall'}"
        ar-scale="fixed" camera-controls auto-rotate shadow
        style="--ar-scale:${scale}" data-size-m="${scale}">
      </model-viewer>
      <div class="item-body">
        <h2>${esc(it.title)}</h2>
        ${it.text_ar ? `<p>${esc(it.text_ar)}</p>` : ''}
        ${it.text_en ? `<p class="hint" dir="ltr" style="text-align:left">${esc(it.text_en)}</p>` : ''}
        ${!arSupported ? `<div class="ar-fallback">⚠️ هاتفك لا يدعم الواقع المعزّز (AR) — يمكنك تدوير النموذج بإصبعك على الشاشة ومشاهدته بتقنية 3D. جرّب متصفح Chrome على أندرويد حديث يدعم ARCore.</div>` : ''}
        <button class="btn btn-orange" id="launchArBtn" type="button">📷 ${it.placement === 'floor' ? 'اعرض على الأرض' : 'اعرض على الحيطة'}</button>
        ${it.audio_url ? `<div style="margin-top:12px"><button class="btn btn-ghost audio-btn" id="playAudioBtn" type="button">🔊 اسمع الشرح الصوتي</button><audio id="itemAudioEl" src="${esc(it.audio_url)}" preload="none"></audio></div>` : ''}
        ${yt ? `<div class="video-wrap"><iframe src="https://www.youtube.com/embed/${yt}" allowfullscreen loading="lazy" title="فيديو الشرح"></iframe></div>`
          : (it.video_url ? `<p style="margin-top:12px"><a href="${esc(it.video_url)}" target="_blank" rel="noopener">🎬 شاهد الفيديو</a></p>` : '')}
        <p class="hint" style="margin-top:10px">الحجم: ${SIZE_LABEL[it.size] || ''} • المكان: ${it.placement === 'floor' ? 'على الأرض' : 'على الحيطة'}</p>
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

/* ================= صفحة الطباعة ================= */
async function openPrint(id) {
  let lesson = null;
  if (supabase) {
    try { lesson = await fetchPublicLesson(id); } catch {}
  }
  if (!lesson) lesson = findLocalLesson(id);
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
}

/* ================= إنشاء درس ================= */
async function createLesson() {
  const title = $('newTitle').value.trim();
  if (!title) return showMsg($('dashMsg'), 'عنوان الدرس مطلوب');
  const sess = getSession();
  const lesson = { id: uid('les'), teacher_id: isRemote() ? sess.id : (sess?.email || 'local'), title, subject: $('newSubject').value.trim(), grade: $('newGrade').value.trim(), description: $('newDesc').value.trim(), views: 0, created_at: new Date().toISOString(), items: [] };
  if (isRemote()) {
    const { error } = await supabase.from('lessons').insert({
      id: lesson.id, teacher_id: sess.id, title: lesson.title,
      subject: lesson.subject, grade: lesson.grade, description: lesson.description,
    });
    if (error) { showMsg($('dashMsg'), 'تعذّر إنشاء الدرس: ' + friendlyAuthError(error)); return; }
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
  $('backFromPrint').onclick = renderDashboard;
  $('doPrintBtn').onclick = () => window.print();
  $('prevItemBtn').onclick = () => { if (studentIndex > 0) { studentIndex--; renderStudentItem(); } };
  $('nextItemBtn').onclick = () => { if (studentLesson && studentIndex < studentLesson.items.length - 1) { studentIndex++; renderStudentItem(); } };
  $('ctaTeacher').onclick = () => { getSession() ? renderDashboard() : showView('view-auth'); };
  $('ctaDemo').onclick = () => { history.pushState(null, '', '?lesson=les_demo_solar'); openStudent('les_demo_solar'); };
  $('navHomeBtn').onclick = () => { history.pushState(null, '', location.pathname); showView('view-home'); };
  $('navDashBtn').onclick = renderDashboard;
  $('navAdminBtn').onclick = () => { renderDashboard().then(() => { const el = $('adminSection'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }); };
  $('navLogoutBtn').onclick = async () => {
    if (session?.mode === 'supabase' && supabase) { try { await supabase.auth.signOut(); } catch {} }
    setSession(null); lessonsCache = null; showView('view-home');
  };
  route();
}
init();
