# درسك AR — الدرس قدامك.. على الحيطة

تطبيق ويب مجاني ومفتوح المصدر يحوّل صور الدروس ونماذج 3D إلى تجارب واقع معزّز (AR) يفتحها الطالب بمسح QR — بدون تثبيت أي تطبيق.

- **المعلّم:** يسجّل دخول، ينشئ درسًا، يرفع صورة (تتحوّل تلقائيًا إلى لوحة 3D بصيغة `.glb`) أو نموذج `.glb/.gltf`، يختار الحيطة/الأرض والحجم، ويضيف شرحًا وصوتًا وفيديو.
- **الطالب:** يمسح QR أو يفتح الرابط، ويعرض الدرس بتقنية AR عبر `<model-viewer>` (WebXR / Scene Viewer / Quick Look).
- **التقنيات المجانية فقط:** Supabase (Postgres + Auth + Storage — الباقة المجانية) + Vercel للاستضافة، three.js + GLTFExporter، `model-viewer`، مكتبة `qrcode` — لا APIs مدفوعة ولا AR SDK مدفوع.

> **تغيّرت البنية 2026-11-24:** الباك إند كان Cloudflare (Workers + D1 + R2) ثم انتقل إلى **Supabase** لأن تسجيل الدخول للوحة Cloudflare كان محظورًا من متصفح السحابة (Turnstile). مجلد `workers/api` ما زال موجودًا كمرجع قديم (**legacy / deprecated**) — لا يُستخدم ولا يُحذف.

## بنية المشروع

```
darsak-ar/
├── README.md
├── frontend/
│   ├── index.html          # التطبيق كاملًا (SPA)
│   ├── styles.css
│   ├── app.js              # Supabase Auth + Postgres + Storage + لوحة الأدمن
│   ├── supabase-config.js  # رابط المشروع + المفتاح العام anon
│   ├── manifest.webmanifest
│   ├── sw.js               # Service Worker (ارفع رقم CACHE مع كل تغيير!)
│   ├── lib/
│   │   └── image-to-glb.js # تحويل الصورة إلى .glb
│   └── public/
│       ├── darsak-ar-icon.png
│       └── favicon.png
├── supabase/
│   └── schema.sql          # جداول Postgres + RLS + سياسات Storage + دالة الأدمن
├── workers/
│   └── api/                # ⚠️ قديم (deprecated): باك إند Cloudflare — لا يُستخدم
│       ├── wrangler.toml
│       └── src/index.js
├── db/
│   └── schema.sql          # ⚠️ مخطط D1 القديم — لا يُستخدم
└── docs/
    └── DEPLOY_ANDROID_AR.md
```

## النشر خطوة بخطوة — من موبايل أندرويد

> كل الخطوات مجانية. تحتاج: حساب GitHub + حساب Supabase + متصفح Chrome على الموبايل.

### 1) أنشئ حساب GitHub مجاني
1. افتح `github.com` في Chrome.
2. اضغط **Sign up**، وأدخل بريدك وكلمة سر.
3. أكّد بريدك من رسالة التفعيل.

### 2) أنشئ مشروع Supabase مجاني
1. افتح `supabase.com` واضغط **Start your project** وسجّل (بـ GitHub مثلًا).
2. **New project** — اسم المشروع `darsak-ar`، واختر كلمة سر قوية لقاعدة البيانات واحتفظ بها، والمنطقة الأقرب (Frankfurt).
3. انتظر حتى يصبح المشروع **Healthy**، ثم من **Project Settings ← API** خذ:
   - **Project URL** (مثل `https://xxxx.supabase.co`)
   - **anon public key** (المفتاح العام — آمن في كود الواجهة)
4. ضع القيمتين في ملف `frontend/supabase-config.js` (مكان `window.DARSAK_SUPABASE_URL` و`window.DARSAK_SUPABASE_ANON_KEY`).
   > ⚠️ لا تضع أبدًا مفتاح `service_role` ولا كلمة سر قاعدة البيانات في كود الواجهة.

### 3) ارفع هذا المجلد إلى GitHub من الموبايل
1. في GitHub اضغط **+** ثم **New repository**، وسمِّه `darsak-ar`، واختر **Public**، ثم **Create repository**.
2. اضغط **uploading an existing file**، ثم **choose your files** واختر كل ملفات هذا المجلد (أو ارفعها كملف ZIP ثم فكّه من واجهة GitHub).
3. اضغط **Commit changes**.

> بديل من الكمبيوتر: `git init && git add . && git commit -m "init" && git push`.

### 4) وصّل Vercel بالمستودع (استضافة الواجهة)
1. من لوحة Vercel اضغط **Add New ← Project** ثم **Import** مستودع `darsak-ar`.
2. في **Root Directory** اكتب `frontend`، وفي **Framework Preset** اختر **Other**.
3. **Build Command**: فارغ، و**Output Directory**: `.` (نقطة — مهم، وإلا يظهر 404).
4. اضغط **Deploy**. سيعطيك رابطًا مثل `https://darsak-ar.vercel.app`.

### 5) أنشئ جداول قاعدة البيانات (Supabase)
1. من لوحة Supabase: **SQL Editor ← New query**.
2. الصق محتوى ملف `supabase/schema.sql` كاملًا ثم **Run**.
   > ⚠️ الترتيب داخل الملف مهم: الجداول والفهارس أولًا، ثم دالة `is_admin()`، ثم RLS والسياسات — تعريف الدالة قبل جدول `teachers` يفشل بالخطأ `42P01`.
3. الملف ينشئ الجداول الأربعة (`teachers`, `lessons`, `items`, `site_visits`) + كل سياسات RLS + دالة `increment_lesson_views` (عدّاد المشاهدات) + سياسات Storage.

### 6) أنشئ مخزن الملفات (Storage)
1. من اللوحة: **Storage ← New bucket**، الاسم `darsak-files`، واختر **Public bucket**.
2. سياسات القراءة العامة والرفع للمعلّمين موجودة في `supabase/schema.sql` (تُنفَّذ مع الملف في الخطوة 5).

### 7) امنح نفسك صلاحية الأدمن
1. افتح الموقع وسجّل حساب معلّم ببريدك (من صفحة الدخول ← «أنشئ حسابًا مجانيًا»).
   - إن كان تأكيد البريد مفعّلًا، اضغط رابط التأكيد من بريدك ثم سجّل الدخول.
2. من لوحة Supabase: **SQL Editor** ونفّذ:
   ```sql
   update public.teachers set is_admin = true where email = 'ahm3d.atti2@gmail.com';
   ```
   (بدّل البريد ببريدك إن كان مختلفًا.)
3. سجّل خروجًا ودخولًا من الموقع — ستظهر لوحة الأدمن (زر «👥 المستخدمون» + قسم الإحصائيات والمستخدمين والزيارات)، وسترى كل الدروس مع تحرير/حذف أي درس أو عنصر.

### 8) الوضع دون اتصال (احتياطي)
- إن تعذّر تحميل عميل Supabase من الـ CDN يعمل التطبيق في **الوضع المحلي**: البيانات تُحفظ في `localStorage` على جهاز المعلّم، والدرس التجريبي «المجموعة الشمسية» يظهر فورًا. حساب تجريبي: `demo@darsak.ar` / `123456`.
- ملاحظة: الدروس المُنشأة في الوضع المحلي لا تنتقل تلقائيًا إلى Supabase — أنشئها مجددًا بعد الاتصال.

### 9) جرّب QR والـ AR على الموبايل
1. سجّل دخول كمعلّم، أنشئ درسًا، أضف عنصرًا (صورة أو نموذج).
2. افتح صفحة الدرس واضغط **تحميل QR** واطبعه، أو **مشاركة واتساب**.
3. من موبايل آخر (أو نفس الموبايل بكاميرا تطبيق آخر) امسح QR — يجب أن يفتح الدرس.
4. اضغط زر **«اعرض على الحيطة / على الأرض»** البرتقالي، وجّه الكاميرا على حيطة أو أرض فاضية وحرّك الموبايل ببطء.

### 10) حدود الباقة المجانية (Supabase Free)
| الخدمة | الحد المجاني | ملاحظة |
|---|---|---|
| Postgres | 500 MB تخزين | دروس ونصوص فقط |
| Auth | 50,000 مستخدم نشط شهريًا | |
| Storage | 1 GB تخزين، 2 GB نقل بيانات/شهر | ملفات الطلاب (.glb / mp3) |
| **أقصى حجم ملف** | **15 MB** | صورة / نموذج / صوت — أكبر من ذلك يرفضه التطبيق برسالة عربية |

## لوحة الأدمن
تظهر فقط للحساب الذي لديه `is_admin = true` في جدول `teachers` (انظر الخطوة 7):
- **بطاقات إحصائيات:** إجمالي المستخدمين، إجمالي الدروس، إجمالي مشاهدات الدروس، إجمالي زيارات الموقع، زيارات اليوم.
- **جدول المستخدمين:** الاسم، البريد، عدد دروسه، تاريخ الانضمام (👑 بجانب الأدمن).
- **الزيارات:** حسب المصدر (النطاق الذي جاء منه الزائر — جوجل/فيسبوك/واتساب/مباشر…) وحسب اليوم لآخر 7 أيام — من جدول `site_visits` (صف واحد لكل زائر/مسار/يوم، يُسجَّل تلقائيًا عند فتح الصفحة الرئيسية أو أي درس).
- **تحكم كامل:** الأدمن يرى كل الدروس (وليس دروسه فقط) مع تحرير وحذف أي درس وأي عنصر داخل أي درس.

## الإطلاق: SEO والأمان — الدومين الموحّد www + هيدرز الأمان + CSP

كل الروابط العامة تشير إلى **https://www.drsak.online/** فقط (الدومين الأساسي)، وأي طلب على `drsak.online` أو `darsak-ar.vercel.app` يُحوَّل إليه (301).

### 1) صورة المعاينة (Open Graph)
- الملف: `frontend/public/og-image.png` — ‏**1200×630** (القياس المطلوب لفيسبوك/واتساب).
- تُبنى بالسكربت المحلي (PIL + خط Noto Sans Arabic + شعار الموقع) — ليست مولّدة بالذكاء الاصطناعي حتى يكون النص العربي سليمًا.
- تُستخدم في وسوم `og:image` و`twitter:image` داخل `<head>` في `index.html` مع `og:image:width/height`.

### 2) الـ canonical ووسوم Open Graph
- في `<head>` في `frontend/index.html`: `rel="canonical"` + `og:type/site_name/title/description/url/image/locale (ar_EG)` + `twitter:card (summary_large_image)` — كلها تشير إلى `https://www.drsak.online/`.
- `frontend/sitemap.xml` فيه **رابط واحد فقط**: `https://www.drsak.online/` (الروابط القديمة `drsak.online` و`darsak-ar.vercel.app` حُذفت منه لأنها تُحوَّل أصلًا).

### 3) إعدادات Domains في Vercel
- من لوحة Vercel ← المشروع `darsak-ar` ← **Settings ← Domains**: اجعل `www.drsak.online` هو **Primary Domain**، وتأكد أن `drsak.online` يحوّل إلى `www` (يظهر كـ Redirect).
- التحويل مضمون أيضًا بالكود (انظر الخطوة 4) حتى لو تغيّر إعداد اللوحة.

### 4) `vercel.json` — الهيدرز الأمنية + التحويلات (وضع تجريبي أولًا)
- الملف في `frontend/vercel.json` (لأن Root Directory هو `frontend`) ويحتوي:
  - **redirects** (301) حسب الـ host: `drsak.online` → `www.drsak.online`، و`darsak-ar.vercel.app` → `www.drsak.online`.
  - **headers**: `Strict-Transport-Security` + `X-Content-Type-Options: nosniff` + `X-Frame-Options: DENY` + `Referrer-Policy` + `Permissions-Policy` (`camera=(self)` لأن الـ AR يحتاج الكاميرا).
  - **CSP في وضع تجريبي** (`Content-Security-Policy-Report-Only`): يسجّل المخالفات في الـ Console **دون أن يحجب أي شيء**، حتى لا يكسر الموقع.
- **لماذا `unsafe-inline` في `script-src` و`style-src`؟** التطبيق يستخدم `onclick="..."` داخل القوالب المولّدة ديناميكيًا + سكربت تسجيل الـ Service Worker مضمّن في الصفحة + `style="..."` في أماكن كثيرة — إزالتها تتطلب إعادة كتابة كبيرة. الـ CSP ما زال يحمي من: تحميل سكربتات من مصادر غير مصرّح بها، والتضمين في iframes (`frame-ancestors 'none'`)، والبلاجنز (`object-src 'none'`)، وتغيير الـ base.

### 5) التفعيل بعد التجربة
1. ادفع `vercel.json` (التجريبي) وجرّب الموقع كاملًا: الصفحة الرئيسية، تسجيل الدخول، إنشاء درس، الـ QR، عرض الطالب، الطباعة — وافتح **Console** وابحث عن أي سطر `Content-Security-Policy` (مخالفة).
2. إن لم تظهر مخالفات: استبدل محتوى `frontend/vercel.json` بمحتوى `frontend/vercel.enforce.json` (نفس الملف تمامًا لكن الهيدر `Content-Security-Policy` بدل `Content-Security-Policy-Report-Only`) وادفع من جديد.
3. تحقق من الهيدرز الحيّة: `curl -sI https://www.drsak.online/ | grep -i "content-security-policy\|strict-transport"`.
4. ⚠️ **ارفع رقم `CACHE` في `sw.js` مع كل تغيير** — وإلا يبقى المتصفح يعرض النسخة القديمة.

## التطوير محليًا
```bash
# جرّب الواجهة فقط (بدون خادم):
npx serve frontend
# أو: python3 -m http.server --directory frontend 8000
# ثم افتح http://localhost:8000
```

## ملاحظات تقنية
- تحويل الصورة إلى `.glb` يتم **في المتصفح** (three.js + GLTFExporter): الصورة تُضغط أولًا إلى 1200px بحد أقصى JPEG بجودة 0.82، ثم تُلصق على `PlaneGeometry` بنسبة الأبعاد الأصلية.
- الأحجام الحقيقية: صغير 0.5م / متوسط 1م / كبير 1.8م (عرض اللوحة أو النموذج).
- `model-viewer`: `ar-modes="webxr scene-viewer quick-look"`، و`ar-placement` يأتي من إعداد المعلّم (`wall`/`floor`).
- عدّاد المشاهدات يزيد عند كل فتح لصفحة الطالب.
