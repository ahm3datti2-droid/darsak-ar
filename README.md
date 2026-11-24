# درسك AR — الدرس قدامك.. على الحيطة

تطبيق ويب مجاني ومفتوح المصدر يحوّل صور الدروس ونماذج 3D إلى تجارب واقع معزّز (AR) يفتحها الطالب بمسح QR — بدون تثبيت أي تطبيق.

- **المعلّم:** يسجّل دخول، ينشئ درسًا، يرفع صورة (تتحوّل تلقائيًا إلى لوحة 3D بصيغة `.glb`) أو نموذج `.glb/.gltf`، يختار الحيطة/الأرض والحجم، ويضيف شرحًا وصوتًا وفيديو.
- **الطالب:** يمسح QR أو يفتح الرابط، ويعرض الدرس بتقنية AR عبر `<model-viewer>` (WebXR / Scene Viewer / Quick Look).
- **التقنيات المجانية فقط:** Cloudflare Pages + Workers + D1 + R2 (الباقات المجانية)، three.js + GLTFExporter، `model-viewer`، مكتبة `qrcode` — لا APIs مدفوعة ولا AR SDK مدفوع.

## بنية المشروع

```
darsak-ar/
├── README.md
├── frontend/
│   ├── index.html          # التطبيق كاملًا (SPA)
│   ├── styles.css
│   ├── app.js
│   ├── manifest.webmanifest
│   ├── sw.js
│   ├── lib/
│   │   └── image-to-glb.js # تحويل الصورة إلى .glb
│   └── public/
│       ├── darsak-ar-icon.png
│       └── favicon.png
├── workers/
│   └── api/
│       ├── wrangler.toml
│       └── src/index.js    # REST API + رفع الملفات
├── db/
│   └── schema.sql          # جداول D1
└── docs/
    └── DEPLOY_ANDROID_AR.md
```

## النشر خطوة بخطوة — من موبايل أندرويد

> كل الخطوات مجانية. تحتاج: حساب GitHub + حساب Cloudflare + متصفح Chrome على الموبايل.

### 1) أنشئ حساب GitHub مجاني
1. افتح `github.com` في Chrome.
2. اضغط **Sign up**، وأدخل بريدك وكلمة سر.
3. أكّد بريدك من رسالة التفعيل.

### 2) أنشئ حساب Cloudflare مجاني
1. افتح `dash.cloudflare.com` واضغط **Sign up**.
2. سجّل بنفس البريد. لا تحتاج بطاقة ائتمانية للباقة المجانية.

### 3) ارفع هذا المجلد إلى GitHub من الموبايل
1. في GitHub اضغط **+** ثم **New repository**، وسمِّه `darsak-ar`، واختر **Public**، ثم **Create repository**.
2. اضغط **uploading an existing file**، ثم **choose your files** واختر كل ملفات هذا المجلد (أو ارفعها كملف ZIP ثم فكّه من واجهة GitHub).
3. اضغط **Commit changes**.

> بديل من الكمبيوتر: `git init && git add . && git commit -m "init" && git push`.

### 4) وصّل Cloudflare Pages بالمستودع
1. من لوحة Cloudflare اضغط **Workers & Pages** ثم **Create** ثم **Pages** ثم **Connect to Git**.
2. اختر حساب GitHub وسمح بالوصول، ثم اختر مستودع `darsak-ar`.
3. في **Framework preset** اختر **None** (أو Static).
4. في **Build command** اتركه فارغًا، وفي **Build output directory** اكتب `frontend`.
5. اضغط **Save and Deploy**. سيعطيك رابطًا مثل `https://darsak-ar.pages.dev`.

### 5) أنشئ قاعدة بيانات D1 ونفّذ `db/schema.sql`
1. من لوحة Cloudflare: **Workers & Pages ← D1 SQL Database ← Create**.
2. اسم قاعدة البيانات: `darsak-ar` ثم **Create**.
3. افتح القاعدة، تبويب **Console**، والصق محتوى ملف `db/schema.sql` كاملًا، ثم اضغط **Execute**.

### 6) أنشئ مخزن ملفات R2
1. من اللوحة: **R2 Object Storage ← Create bucket**.
2. اسم الـ Bucket: `darsak-ar-files` ثم **Create bucket**.
3. من إعدادات الـ Bucket فعّل **Public access** (أو اربط نطاقًا عامًا) حتى تظهر الصور والنماذج للطلاب — بدون ذلك لن تفتح الملفات برابط عام.

### 7) انشر الـ Worker (API)
1. من الكمبيوتر (أو من تطبيق Termux على الموبايل): ثبّت Wrangler: `npm install -g wrangler` ثم `wrangler login`.
2. من مجلد `workers/api` نفّذ:
   ```bash
   wrangler d1 create darsak-ar        # خذ الـ database_id والصقه في wrangler.toml
   wrangler r2 bucket create darsak-ar-files
   wrangler deploy
   ```
3. ستحصل على رابط مثل `https://darsak-ar-api.<subdomain>.workers.dev`.

> بدون كمبيوتر: يمكن إنشاء Worker من لوحة Cloudflare (**Workers & Pages ← Create ← Worker**) ولصق محتوى `workers/api/src/index.js`، ثم ربط D1 وR2 من تبويب **Settings ← Bindings**.

### 8) اضبط متغيرات البيئة
1. في مشروع Pages: **Settings ← Environment variables**، أضف:
   - `DARSAK_API` = رابط الـ Worker (مثال `https://darsak-ar-api.xxx.workers.dev`)
2. في مشروع Worker: **Settings ← Variables**، أضف:
   - `R2_PUBLIC_URL` = الرابط العام لـ R2 (مثال `https://pub-xxxx.r2.dev`)
   - `JWT_SECRET` = أي نص عشوائي طويل (اخترعه أنت).
3. أعد النشر (**Deployments ← Retry deployment**).

> إذا لم تضبط `DARSAK_API` يعمل التطبيق في **الوضع المحلي**: البيانات تُحفظ في `localStorage` على جهاز المعلّم، والدرس التجريبي «المجموعة الشمسية» يظهر فورًا. حساب تجريبي: `demo@darsak.ar` / `123456`.

### 9) جرّب QR والـ AR على الموبايل
1. سجّل دخول كمعلّم، أنشئ درسًا، أضف عنصرًا (صورة أو نموذج).
2. افتح صفحة الدرس واضغط **تحميل QR** واطبعه، أو **مشاركة واتساب**.
3. من موبايل آخر (أو نفس الموبايل بكاميرا تطبيق آخر) امسح QR — يجب أن يفتح الدرس.
4. اضغط زر **«اعرض على الحيطة / على الأرض»** البرتقالي، وجّه الكاميرا على حيطة أو أرض فاضية وحرّك الموبايل ببطء.

### 10) حدود الباقة المجانية
| الخدمة | الحد المجاني | ملاحظة |
|---|---|---|
| Pages | طلبات غير محدودة تقريبًا | استضافة ثابتة مجانية |
| Workers | 100,000 طلب/يوم | كافٍ لآلاف الطلاب |
| D1 | 5 GB تخزين، 5M قراءة/يوم | دروس ونصوص فقط |
| R2 | 10 GB تخزين، 10M قراءة/شهر | ملفات الطلاب |
| **أقصى حجم ملف** | **15 MB** | صورة / نموذج / صوت — أكبر من ذلك يرفضه التطبيق برسالة عربية |

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
