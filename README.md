# شجرة الضفيان — Firebase

موقع ثابت على Firebase Hosting مع قاعدة Cloud Firestore (مشروع `aldhfyan-family`).

## النشر (من Google Cloud Shell أو أي جهاز عليه Firebase CLI)

```bash
cd Aldhfyan
firebase deploy --project aldhfyan-family
```

هذا ينشر الموقع **وقواعد Firestore** معاً. القواعد الجديدة ضرورية للنسخة السريعة والنسخ الاحتياطية.

## الملفات المهمة

- `site-config.js` — كل ما يخص هذه العائلة: إعدادات Firebase، اسم الشجرة، رقم المدير.
- `family-tools.js` — ملف مشترك بين كل مواقع العائلات (نفس الملف في كل مشروع): الحماية، النسخة السريعة، النسخ الاحتياطية، التنزيل Excel/نص، كشف الأسماء المكررة.
- `firestore.rules` — قواعد الحماية. رقم المدير مكتوب فيها أيضاً (`isOwner`) ويجب أن يطابق `site-config.js`.
- `seed-data.js` — النسخة الأساسية من الأسماء (تُستخدم لتهيئة قاعدة البيانات أول مرة).

## كيف تُخزَّن البيانات

- `persons/*` — شخص في كل مستند (المصدر الأساسي).
- `meta/tree` — نسخة كاملة من الشجرة في مستند واحد، يقرؤها الزائر بقراءة واحدة. تُحدَّث تلقائياً عند كل اعتماد، ويمكن للمدير تحديثها يدوياً من لوحة الإدارة.
- `backups/*` — نسخ احتياطية: نسخة تلقائية قبل أول اعتماد في كل يوم، ونسخ يدوية، ونسخة قبل أي استعادة.


## التصميم الجديد (نوفمبر ٢٠٢٦)

- `index.html` + `site.css` + `site.js` — الواجهة الجديدة: الشجرة التفاعلية (شجرة / مخطط)، الشجرة المطبوعة، العائلة بالأرقام، ولوحة الإدارة. تستخدم `site-config.js` و `family-tools.js` كما هي.
- `pdf.html` و `numbers.html` تحوّل للأقسام داخل الصفحة الرئيسية (`#printed` و `#numbers`).
- ملفات الواجهة القديمة (`app.js`, `styles.css`, `radial.css`, `mobile-fix.css`, `ui-refresh.css`, `header-auth.js`, `site-actions.js`, `numbers.js`, `pdf-viewer.js`) لم تعد مستخدمة، وتركتها كما هي.

### الأدوار (مجموعة `reviewers`، المفتاح رقم الجوال)
- المدير العام: الرقم في `site-config.js` وفي `firestore.rules`.
- مدير: `kind: "admin"` مع `perms` = `review` (قبول/رفض)، `edit` (تعديل مباشر)، `roles` (إدارة المدراء والمشرفين)، `logs` (السجل والإحصائيات). المراجع القديم بدون `kind` يعامل كمدير بصلاحية القبول والرفض.
- مشرف فرع: `kind: "mod"` و `branches` = أرقام الأسماء. الطلب يظهر لأقرب مشرف للاسم.

### السجل
- `logs/*` كل حدث: زيارة، مشاركة، نسخ، دخول، تسجيل، طلب، قبول، رفض، تعديل، صلاحيات، أدوات.
- `stats/{يوم}_{نوع}` عدّاد يومي لكل نوع.

### معاينة قبل النشر
```bash
firebase hosting:channel:deploy tajriba --project aldhfyan-family   # رابط معاينة مؤقت بالبيانات الحقيقية
firebase deploy --only firestore:rules --project aldhfyan-family     # القواعد (لازمة للسجل والأدوار الجديدة)
firebase deploy --project aldhfyan-family                            # النشر الكامل
```

## النشر

النشر يدوي من جهاز المدير (تم إيقاف النشر التلقائي القديم لأنه كان مربوطاً بمشروع Firebase محذوف):

```
firebase hosting:channel:deploy tajriba --project aldhfyan-family   # رابط تجربة
firebase deploy --project aldhfyan-family                            # الموقع + قواعد قاعدة البيانات
```

## النسخة الاحتياطية الأسبوعية

كل جمعة فجراً يشغّل GitHub ملف `.github/workflows/weekly-backup.yml`، فيقرأ جميع الأسماء من قاعدة البيانات ويحفظها في مجلد `backups/`:

- `persons.csv` — يفتح في Excel، فيه النسب الكامل والجيل لكل اسم.
- `persons.json` — نسخة كاملة يمكن استعادتها.
- `last-backup.txt` — وقت آخر نسخة وعدد الأسماء.

كل نسخة تُحفظ كـ commit، فيمكن الرجوع لأي أسبوع سابق من سجل المستودع. ولتشغيلها يدوياً: Actions ← نسخة احتياطية أسبوعية ← Run workflow.
