/**
 * درسك AR — منطق التطبيق كاملًا (SPA)
 * - تسجيل المعلّم: محلي (SHA-256 + localStorage) أو عبر Worker API عند ضبط window.DARSAK_API
 * - الدروس: localStorage مع مزامنة اختيارية مع الـ Worker
 * - الصورة → .glb في المتصفح (three.js + GLTFExporter) عبر lib/image-to-glb.js
 * - QR: مكتبة qrcode + شعار في المنتصف — تحميل PNG / نسخ رابط / واتساب
 * - الطالب: <model-viewer> مع ar-placement من إعداد المعلّم + عدّاد مشاهدات + Lazy-load
 */
import { imageFileToGlb } from './lib/image-to-glb.js';

const API_BASE = (window.DARSAK_API || '').replace(/\/$/, '');
const MAX_BYTES = 15 * 1024 * 1024; // 15MB
const LS_LESSONS = 'darsak.lessons.v1';
const LS_TEACHERS = 'darsak.teachers.v1';
const LS_SESSION = 'darsak.session.v1';
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

/* ================= التخزين المحلي ================= */
function loadLocal(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function saveLocal(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function getLessons() { return loadLocal(LS_LESSONS, null) ?? seedDemoIfNeeded(); }
function saveLessons(list) { saveLocal(LS_LESSONS, list); }
function getSession() { return loadLocal(LS_SESSION, null); }
function setSession(s) { s ? saveLocal(LS_SESSION, s) : localStorage.removeItem(LS_SESSION); }

/* ================= الدرس التجريبي: المجموعة الشمسية ================= */
function seedDemoIfNeeded() {
  const existing = loadLocal(LS_LESSONS, null);
  if (existing) return existing;
  const lesson = {
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
  saveLocal(LS_LESSONS, [lesson]);
  return [lesson];
}

/* ================= API (اختياري — عند ضبط DARSAK_API) ================= */
async function api(path, { method = 'GET', body, token } = {}) {
  if (!API_BASE) return null;
  const res = await fetch(API_BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'خطأ في الخادم');
  return data;
}
async function apiUpload(file, type, token) {
  const res = await fetch(`${API_BASE}/api/upload?type=${type}&filename=${encodeURIComponent(file.name)}`, {
    method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream', Authorization: 'Bearer ' + token }, body: file,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'فشل رفع الملف');
  return data.url;
}

/* ================= التنقّل بين الصفحات ================= */
const VIEWS = ['view-home', 'view-auth', 'view-dashboard', 'view-editor', 'view-student', 'view-print'];
function showView(id) {
  VIEWS.forEach((v) => $(v).classList.toggle('hidden', v !== id));
  window.scrollTo({ top: 0 });
  const logged = !!getSession();
  $('navDashBtn').classList.toggle('hidden', !logged);
  $('navLogoutBtn').classList.toggle('hidden', !logged);
}
function publicLink(lessonId) { return location.origin + location.pathname + '?lesson=' + lessonId; }

/* ================= المصادقة ================= */
let authMode = 'login'; // أو signup
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
      if (API_BASE) {
        const data = await api(authMode === 'login' ? '/api/auth/login' : '/api/auth/signup',
          { method: 'POST', body: { email, password: pass, name } });
        setSession({ token: data.token, email: data.teacher.email, name: data.teacher.name });
      } else {
        // الوضع المحلي: حساب تجريبي + حسابات محفوظة في localStorage
        const teachers = loadLocal(LS_TEACHERS, [{ email: 'demo@darsak.ar', password_hash: await sha256('123456'), name: 'معلّم تجريبي' }]);
        if (authMode === 'signup') {
          if (teachers.some((t) => t.email === email)) throw new Error('هذا البريد مسجّل من قبل — جرّب تسجيل الدخول');
          teachers.push({ email, password_hash: await sha256(pass), name: name || email.split('@')[0] });
          saveLocal(LS_TEACHERS, teachers);
          setSession({ email, name: name || email.split('@')[0] });
        } else {
          const t = teachers.find((x) => x.email === email);
          if (!t || t.password_hash !== await sha256(pass)) throw new Error('البريد أو كلمة السر غير صحيحة');
          setSession({ email, name: t.name });
        }
      }
      showMsg($('authMsg'), '', true);
      renderDashboard();
    } catch (e) { showMsg($('authMsg'), e.message || 'حدث خطأ'); }
    finally { $('authSubmit').disabled = false; }
  };
}

/* ================= لوحة المعلّم ================= */
function renderDashboard() {
  const session = getSession();
  if (!session) { showView('view-auth'); return; }
  $('teacherName').textContent = session.name || session.email;
  showView('view-dashboard');
  const lessons = getLessons().filter((l) => !API_BASE || l.teacher_id === session.email || l.teacher_id === 'demo' || true);
  $('lessonsList').innerHTML = lessons.length ? lessons.map((l) => `
    <div class="card lesson-card">
      <div class="thumb">📚</div>
      <div class="lesson-meta">
        <h3>${esc(l.title)}</h3>
        <span class="badge">${esc(l.subject || 'بدون مادة')}</span>
        <span class="badge">${esc(l.grade || '')}</span>
        <span class="badge orange">👁️ ${l.views || 0} مشاهدة</span>
        <span class="badge">${(l.items || []).length} عنصر</span>
        <p class="hint">${esc(l.description || '')}</p>
        <div class="row">
          <button class="btn btn-primary btn-sm" onclick="window.__editLesson('${l.id}')">✏️ تحرير وعناصر</button>
          <button class="btn btn-ghost btn-sm" onclick="window.__openStudent('${l.id}')">👀 عرض الطالب</button>
          <button class="btn btn-ghost btn-sm" onclick="window.__openPrint('${l.id}')">🖨️ طباعة QR</button>
          <button class="btn btn-danger btn-sm" onclick="window.__deleteLesson('${l.id}')">🗑️ حذف</button>
        </div>
      </div>
    </div>`).join('') : '<div class="card">لا توجد دروس بعد — أنشئ أول درس من الأعلى 👆</div>';
}
window.__editLesson = (id) => openEditor(id);
window.__openStudent = (id) => { location.hash = ''; history.pushState(null, '', '?lesson=' + id); openStudent(id); };
window.__openPrint = (id) => { history.pushState(null, '', '?print=' + id); openPrint(id); };
window.__deleteLesson = async (id) => {
  if (!confirm('حذف هذا الدرس نهائيًا؟')) return;
  const session = getSession();
  if (API_BASE && session?.token) { try { await api('/api/lessons/' + id, { method: 'DELETE', token: session.token }); } catch (e) { alert(e.message); return; } }
  saveLessons(getLessons().filter((l) => l.id !== id));
  renderDashboard();
};

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

function openEditor(id) {
  currentLessonId = id;
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
window.__moveItem = (id, dir) => {
  const lessons = getLessons(); const lesson = lessons.find((l) => l.id === currentLessonId);
  const i = lesson.items.findIndex((x) => x.id === id); const j = i + dir;
  if (i < 0 || j < 0 || j >= lesson.items.length) return;
  [lesson.items[i], lesson.items[j]] = [lesson.items[j], lesson.items[i]];
  saveLessons(lessons); renderItems();
};
window.__deleteItem = (id) => {
  if (!confirm('حذف هذا العنصر؟')) return;
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
  const session = getSession();
  const btn = $('addItemBtn'); btn.disabled = true;
  const prog = $('uploadProgress'); prog.classList.remove('hidden');
  const bar = prog.querySelector('div');
  try {
    let fileUrl = '', glbUrl = '';
    if (file) {
      bar.style.width = '30%';
      if (currentKind === 'image') {
        // الصورة → ضغط + تحويل إلى .glb في المتصفح
        const { blob, url } = await imageFileToGlb(file, { maxWidth: 1200, quality: 0.82 });
        glbUrl = url; fileUrl = url; // Blob URL محلي — يُرفع للخادم عند توفر API
        if (API_BASE && session?.token) {
          const up = await apiUpload(new File([blob], title.replace(/\s+/g, '_') + '.glb', { type: 'model/gltf-binary' }), 'model', session.token);
          glbUrl = up; fileUrl = up;
        }
        $('fileInfo').textContent = '✅ تم تحويل الصورة إلى لوحة 3D (.glb) بنسبة أبعادها الأصلية.';
      } else {
        if (!/\.(glb|gltf)$/i.test(file.name)) throw new Error('ملف النموذج يجب أن يكون .glb أو .gltf');
        glbUrl = URL.createObjectURL(file); fileUrl = glbUrl;
        if (API_BASE && session?.token) {
          glbUrl = await apiUpload(file, 'model', session.token); fileUrl = glbUrl;
        }
      }
    }
    let audioUrl = '';
    if (audioFile) {
      if (API_BASE && session?.token) audioUrl = await apiUpload(audioFile, 'audio', session.token);
      else audioUrl = URL.createObjectURL(audioFile);
    }
    bar.style.width = '80%';
    const item = {
      id: editingItemId || uid('itm'), kind: currentKind,
      title, text_ar: $('itemTextAr').value.trim(), text_en: $('itemTextEn').value.trim(),
      file_url: fileUrl, glb_url: glbUrl, placement: currentPlacement, size: currentSize,
      audio_url: audioUrl, video_url: $('itemVideo').value.trim(),
    };
    const lessons = getLessons(); const lesson = lessons.find((l) => l.id === currentLessonId);
    if (editingItemId) {
      const old = lesson.items.find((x) => x.id === editingItemId);
      Object.assign(old, { ...item, file_url: fileUrl || old.file_url, glb_url: glbUrl || old.glb_url, audio_url: audioUrl || old.audio_url });
      editingItemId = null; $('addItemBtn').textContent = '➕ أضف العنصر للدرس';
    } else {
      lesson.items = lesson.items || []; lesson.items.push(item);
      if (API_BASE && session?.token) {
        try { await api('/api/lessons/' + currentLessonId + '/items', { method: 'POST', body: item, token: session.token }); } catch (e) { /* يبقى محليًا */ }
      }
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
  let lesson = getLessons().find((l) => l.id === id);
  // من الـ API إن وُجد (ويزيد عدّاد المشاهدات هناك)
  if (API_BASE) { try { const d = await api('/api/lessons/' + id); lesson = { ...d.lesson, items: d.items }; } catch { /* fallback محلي */ } }
  if (!lesson) { alert('الدرس غير موجود'); return showView('view-home'); }
  // زيادة عدّاد المشاهدات محليًا
  const lessons = getLessons(); const local = lessons.find((l) => l.id === id);
  if (local) { local.views = (local.views || 0) + 1; saveLessons(lessons); }
  studentLesson = lesson; studentIndex = 0;
  $('studentTitle').textContent = lesson.title;
  $('studentMeta').textContent = `${lesson.subject || ''} • ${lesson.grade || ''} • 👁️ ${(lesson.views || 0) + 1} مشاهدة`;
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
  const lesson = getLessons().find((l) => l.id === id);
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
  const session = getSession();
  const lesson = { id: uid('les'), teacher_id: session?.email || 'local', title, subject: $('newSubject').value.trim(), grade: $('newGrade').value.trim(), description: $('newDesc').value.trim(), views: 0, created_at: new Date().toISOString(), items: [] };
  if (API_BASE && session?.token) {
    try { const d = await api('/api/lessons', { method: 'POST', body: lesson, token: session.token }); lesson.id = d.lesson.id; } catch (e) { showMsg($('dashMsg'), e.message); return; }
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
}
function init() {
  seedDemoIfNeeded();
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
  $('navLogoutBtn').onclick = () => { setSession(null); showView('view-home'); };
  route();
}
init();
