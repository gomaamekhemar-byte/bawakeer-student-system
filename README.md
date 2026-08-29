# نظام متابعة تسجيل الطلاب - مدارس بواكير

نظام ويب متكامل لإدارة وتتبع عمليات مقابلة وتسجيل الطلاب في مدارس بواكير.

## التقنيات المستخدمة

- **Node.js + Express.js** - الخادم
- **EJS** - محرك القوالب
- **Supabase (PostgreSQL)** - قاعدة البيانات + تخزين الملفات
- **JWT** - نظام المصادقة
- **Netlify Functions** - النشر (serverless)
- **xlsx + pdfkit** - تصدير التقارير

## المميزات

- ✅ نظام تسجيل دخول آمن (JWT)
- ✅ إدارة الطلاب (إضافة، تعديل، حذف)
- ✅ رفع وتحميل الملفات (Supabase Storage)
- ✅ تصدير Excel و PDF
- ✅ نظام صلاحيات متقدم (Admin/Manager/Employee/Viewer)
- ✅ سجل تاريخي لجميع العمليات
- ✅ إحصائيات ولوحة تحليلات
- ✅ إدارة الفروع والأعوام الدراسية
- ✅ واجهة عربية RTL

---

## خطوات النشر

### 1. إعداد Supabase

1. سجّل في [supabase.com](https://supabase.com) وأنشئ مشروعاً جديداً
2. في **SQL Editor**، شغّل ملف `supabase/schema.sql` كاملاً
3. في **Storage**، أنشئ bucket باسم `uploads` واجعله **Public**
4. انسخ بياناتك:
   - Project URL → `SUPABASE_URL`
   - Service Role Key → `SUPABASE_SERVICE_KEY`

### 2. ترحيل البيانات (اختياري)

إذا كانت لديك بيانات قديمة في ملفات JSON:

```bash
# انسخ ملفات JSON القديمة إلى المجلد الأب
# ثم شغّل:
npm install
node supabase/migrate.js
```

### 3. رفع على GitHub

```bash
git init
git add .
git commit -m "Initial commit - Bawakeer Student System"
git remote add origin https://github.com/username/bawakeer-app.git
git push -u origin main
```

### 4. النشر على Netlify

1. سجّل في [netlify.com](https://netlify.com)
2. اضغط **Add new site** → **Import an existing project**
3. اختر **GitHub** وحدد المستودع
4. في إعدادات البناء:
   - Build command: `npm install`
   - Publish directory: `public`
   - Functions directory: `netlify/functions`
5. أضف متغيرات البيئة في **Site settings → Environment variables**:
   ```
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_SERVICE_KEY=eyJxxx...
   JWT_SECRET=your-random-secret-key-min-32-chars
   NODE_ENV=production
   ```
6. اضغط **Deploy site**

---

## التشغيل المحلي

```bash
# نسخ ملف البيئة
cp .env.example .env
# عدّل .env بإضافة بياناتك

# تثبيت الحزم
npm install

# تشغيل مع Hot Reload
npm run dev

# أو تشغيل عادي
npm start
```

التطبيق يعمل على: http://localhost:3000

---

## بيانات الدخول الافتراضية

| المستخدم | كلمة المرور | الدور |
|----------|------------|-------|
| `admin` | `Bawakeer@2026` | مدير النظام |
| `manager` | `Manager@2026` | مدير المتابعة |
| `employee` | `Employee@2026` | موظف |
| `viewer` | `Viewer@2026` | مشاهد |

> **تنبيه:** غيّر كلمات المرور فوراً بعد أول تسجيل دخول!

---

## بنية المشروع

```
bawakeer-webapp/
├── netlify/functions/app.js   # Netlify Function (يُغلّف Express)
├── src/
│   ├── app.js                 # Express app
│   ├── config/supabase.js     # Supabase client
│   ├── middleware/auth.js     # JWT authentication
│   ├── middleware/permissions.js
│   ├── routes/               # جميع المسارات
│   ├── services/             # منطق الأعمال
│   └── utils/                # أدوات مساعدة
├── views/                    # قوالب EJS
├── public/styles.css         # CSS
├── supabase/
│   ├── schema.sql            # هيكل قاعدة البيانات
│   └── migrate.js            # سكريبت الترحيل
├── netlify.toml              # إعدادات Netlify
└── package.json
```

---

## إعداد Supabase Storage

في **Supabase Dashboard → Storage**:
1. أنشئ bucket باسم `uploads`
2. اجعله **Public** (للسماح برابط عام للملفات)
3. أضف **Storage Policy** للسماح بالرفع:
   ```sql
   CREATE POLICY "Allow all uploads" ON storage.objects
   FOR INSERT WITH CHECK (bucket_id = 'uploads');
   ```

---

*نظام مدارس بواكير - 2026*
