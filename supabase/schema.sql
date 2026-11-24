-- درسك AR — مخطط Supabase (Postgres + RLS)
-- نفّذ هذا الملف كاملًا من SQL Editor في لوحة Supabase
-- (أو من psql المتصل بقاعدة المشروع)
--
-- ⚠️ الترتيب مهم: الجداول والفهارس أولًا، ثم دالة is_admin()، ثم RLS والسياسات.
-- تعريف is_admin() قبل جدول teachers يفشل بالخطأ 42P01
-- (نفس الخطأ الذي ظهر في EL FASL — الدالة تستعلم جدولًا لم يُنشأ بعد).
--
-- منح صلاحية الأدمن (نفّذها بعد أن يسجّل الأدمن حسابه من الموقع):
--   update public.teachers set is_admin = true where email = 'ahm3d.atti2@gmail.com';
--
-- عدّاد المشاهدات (دالة آمنة تُستدعى من الواجهة — نفّذها مرة واحدة أيضًا):
--   الدالة increment_lesson_views معرّفة في آخر هذا الملف.

-- ================= الجداول =================

-- المعلّمون (مربوط بحسابات Supabase Auth)
create table if not exists public.teachers (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null unique,
  name       text not null default '',
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

-- الدروس
create table if not exists public.lessons (
  id          text primary key,
  teacher_id  uuid references public.teachers (id) on delete cascade,
  title       text not null,
  subject     text not null default '',
  grade       text not null default '',
  description text not null default '',
  views       integer not null default 0,
  created_at  timestamptz not null default now()
);

-- عناصر الدرس (شرائح AR)
create table if not exists public.items (
  id          text primary key,
  lesson_id   text not null references public.lessons (id) on delete cascade,
  sort_order  integer not null default 0,
  kind        text not null default 'image' check (kind in ('image', 'model')),
  title       text not null default '',
  text_ar     text not null default '',
  text_en     text not null default '',
  file_url    text not null default '',
  glb_url     text not null default '',
  placement   text not null default 'wall' check (placement in ('wall', 'floor')),
  size        text not null default 'medium' check (size in ('small', 'medium', 'large')),
  audio_url   text not null default '',
  video_url   text not null default ''
);

-- زيارات الموقع (عدّاد الوصول + المصدر) — صف واحد لكل زائر/مسار/يوم
create table if not exists public.site_visits (
  id         bigint generated always as identity primary key,
  visitor_id text not null,
  path       text not null default '',
  referrer   text not null default '',
  country    text not null default '',
  device     text not null default '',
  day        date not null default current_date,
  created_at timestamptz not null default now(),
  unique (visitor_id, path, day)
);

-- ================= نشاط الطلاب (تقارير: الدرس + الوقت + نتيجة الأسئلة) =================
-- صف واحد لكل جلسة طالب (يُحفظ عند إنهاء الدرس أو إغلاق الصفحة).
create table if not exists public.student_activity (
  id           bigint generated always as identity primary key,
  lesson_id    text not null,
  student_name text not null default '',
  seconds      integer not null default 0,
  quiz_score   integer not null default 0,
  quiz_total   integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists idx_activity_lesson on public.student_activity (lesson_id, created_at desc);

-- عمود الأسئلة في عناصر الدرس (JSON: {q, choices:[{t, ok, pos?}]})
alter table public.items add column if not exists quiz jsonb;

-- ================= الفهارس =================
create index if not exists idx_lessons_teacher on public.lessons (teacher_id);
create index if not exists idx_lessons_created on public.lessons (created_at desc);
create index if not exists idx_items_lesson  on public.items (lesson_id, sort_order);
create index if not exists idx_visits_day    on public.site_visits (day desc);
create index if not exists idx_visits_path   on public.site_visits (path);

-- ================= دالة الأدمن (بعد جدول teachers) =================
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.teachers
    where id = auth.uid() and is_admin = true
  );
$$;

-- ================= عدّاد المشاهدات (يستدعيه الطالب المجهول عبر RPC) =================
-- الطالب لا يملك صلاحية UPDATE على lessons، لذلك الزيادة تتم عبر دالة
-- SECURITY DEFINER يملك تنفيذها anon + authenticated.
create or replace function public.increment_lesson_views(p_lesson_id text)
returns void
language sql
security definer
as $$
  update public.lessons set views = views + 1 where id = p_lesson_id;
$$;
grant execute on function public.increment_lesson_views(text) to anon, authenticated;

-- ================= RLS + السياسات =================
alter table public.teachers   enable row level security;
alter table public.lessons    enable row level security;
alter table public.items      enable row level security;
alter table public.site_visits enable row level security;
alter table public.student_activity enable row level security;

-- ================= صلاحيات الجداول (GRANT) — لا تنسَها =================
-- سياسات RLS وحدها لا تكفي: يجب منح الصلاحية على الجدول للدور أولًا،
-- وإلا يرد Supabase بالخطأ 42501 «permission denied for table ...»
-- حتى مع وجود سياسة تسمح بالعملية. (اكتُشف هذا في 2026-11-24:
-- قراءة lessons العامة كانت ترد 401 لأن الـ GRANT لم يُنفَّذ.)
grant select on public.lessons to anon, authenticated;
grant insert, update, delete on public.lessons to authenticated;
grant select on public.items to anon, authenticated;
grant insert, update, delete on public.items to authenticated;
grant select, insert, update on public.teachers to authenticated;
grant insert, select on public.site_visits to anon, authenticated;
grant delete on public.site_visits to authenticated;
grant insert, select on public.student_activity to anon, authenticated;

-- المعلّمون: يرى كل معلّم صفّه، والأدمن يرى الكل
create policy "teachers_select_own_or_admin" on public.teachers
  for select using (id = auth.uid() or public.is_admin());
create policy "teachers_insert_own" on public.teachers
  for insert with check (id = auth.uid());
create policy "teachers_update_own_or_admin" on public.teachers
  for update using (id = auth.uid() or public.is_admin());

-- الدروس: قراءة عامة للجميع (صفحة الطالب)، كتابة للمالك، والأدمن يعدّل/يحذف أي درس
create policy "lessons_select_public" on public.lessons
  for select using (true);
create policy "lessons_insert_owner" on public.lessons
  for insert with check (teacher_id = auth.uid());
create policy "lessons_update_owner_or_admin" on public.lessons
  for update using (teacher_id = auth.uid() or public.is_admin());
create policy "lessons_delete_owner_or_admin" on public.lessons
  for delete using (teacher_id = auth.uid() or public.is_admin());

-- العناصر: قراءة عامة، كتابة لمالك الدرس، والأدمن يعدّل/يحذف أي عنصر
create policy "items_select_public" on public.items
  for select using (true);
create policy "items_insert_owner" on public.items
  for insert with check (
    exists (select 1 from public.lessons
            where lessons.id = items.lesson_id
              and lessons.teacher_id = auth.uid())
    or public.is_admin()
  );
create policy "items_update_owner_or_admin" on public.items
  for update using (
    exists (select 1 from public.lessons
            where lessons.id = items.lesson_id
              and lessons.teacher_id = auth.uid())
    or public.is_admin()
  );
create policy "items_delete_owner_or_admin" on public.items
  for delete using (
    exists (select 1 from public.lessons
            where lessons.id = items.lesson_id
              and lessons.teacher_id = auth.uid())
    or public.is_admin()
  );

-- الزيارات: الإدخال مفتوح للجميع (عدّاد مجهول)، القراءة للأدمن فقط
create policy "visits_insert_open" on public.site_visits
  for insert with check (true);
create policy "visits_select_admin" on public.site_visits
  for select using (public.is_admin());
create policy "visits_delete_admin" on public.site_visits
  for delete using (public.is_admin());

-- نشاط الطلاب: الإدخال مفتوح للطلاب المجهولين، القراءة لمالك الدرس أو الأدمن
create policy "activity_insert_open" on public.student_activity
  for insert with check (true);
create policy "activity_select_owner_or_admin" on public.student_activity
  for select using (
    exists (select 1 from public.lessons
            where lessons.id = student_activity.lesson_id
              and lessons.teacher_id = auth.uid())
    or public.is_admin()
  );

-- ================= Storage: bucket darsak-files =================
-- أنشئ الـ bucket كـ Public من لوحة Storage أولًا (أو نفّذ السطر التالي):
insert into storage.buckets (id, name, public)
values ('darsak-files', 'darsak-files', true)
on conflict (id) do nothing;

-- قراءة عامة للملفات (الطلاب يفتحون النماذج بدون تسجيل)
create policy "darsak_files_read_public" on storage.objects
  for select using (bucket_id = 'darsak-files');
-- رفع/تعديل/حذف للمعلّمين المسجّلين فقط
create policy "darsak_files_insert_auth" on storage.objects
  for insert to authenticated with check (bucket_id = 'darsak-files');
create policy "darsak_files_update_auth" on storage.objects
  for update to authenticated using (bucket_id = 'darsak-files');
create policy "darsak_files_delete_auth" on storage.objects
  for delete to authenticated using (bucket_id = 'darsak-files');
