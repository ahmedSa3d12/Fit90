# FIT90 Mobile App API

Base URL للتجربة محليًا:

```text
http://localhost:4000/api
```

على Android Emulator استخدم `http://10.0.2.2:4000/api` بدل `localhost`. على جهاز حقيقي استخدم IP جهاز الـ backend على الشبكة، وفي الإنتاج استبدل العنوان بالدومين الفعلي.

الإعلانات والعروض والإرسال Public. بروفايل العميل يحتاج Bearer Token ناتج تسجيل دخول العميل. مسارات الإرسال محدودة إلى 5 طلبات في الدقيقة لكل عميل.

## Endpoints

| الوظيفة | Method | URL |
|---|---|---|
| تسجيل دخول العميل | POST | `/mobile/app/login` |
| بروفايل العميل الحالي | GET | `/mobile/app/profile` |
| قياسات InBody وجدول التغذية | GET | `/mobile/app/inbody-measurements` |
| تفاصيل قياس InBody | GET | `/mobile/app/inbody-measurements/:id` |
| تغيير صورة البروفايل | PATCH | `/mobile/app/profile/picture` |
| تغيير كلمة المرور | PATCH | `/mobile/app/profile/password` |
| كل الإعلانات النشطة | GET | `/mobile/app/ads` |
| إعلان واحد | GET | `/mobile/app/ads/:id` |
| كل العروض النشطة | GET | `/mobile/app/offers` |
| عرض واحد | GET | `/mobile/app/offers/:id` |
| إرسال شكوى أو اقتراح | POST | `/mobile/app/tickets` |
| إرسال رأي عضو Feedback | POST | `/mobile/app/feedback` |
| إرسال دعوة | POST | `/mobile/app/invitations` |

### تسجيل الدخول وبروفايل العميل

```json
POST /mobile/app/login
{
  "phone": "01001234567",
  "password": "01001234567"
}
```

الاستجابة تحتوي `accessToken`. أرسله عند طلب البروفايل:

```text
Authorization: Bearer ACCESS_TOKEN
```

```text
GET /mobile/app/profile
```

البروفايل يرجع الاسم، كود العضو، الهاتف، البريد، الصورة، النوع، البطاقة، تاريخ الميلاد، العنوان، الفرع، جهة اتصال الطوارئ، الحالة الاجتماعية، الوظيفة، بيانات ولي الأمر، نوع العضوية، تاريخ بدايتها ونهايتها، وآخر اشتراك شامل الحالة والقيمة والمدفوع والمتبقي وعدد الجلسات المستخدمة. التوكن خاص بالعميل ولا يعمل على APIs الموظفين أو لوحة الإدارة.

### قياسات InBody وجدول التغذية

```text
GET /mobile/app/inbody-measurements
Authorization: Bearer ACCESS_TOKEN
```

لا يُرسل `memberId`؛ السيرفر يستخرج العضو من توكن العميل حتى لا يتمكن عضو من قراءة قياسات عضو آخر. القياسات مرتبة من الأحدث للأقدم، والاستجابة:

```json
{
  "member": { "id": 15, "memberCode": "M00015", "name": "أحمد محمد" },
  "count": 2,
  "latestMeasurement": {
    "id": 22,
    "measurementDate": "2026-07-21",
    "weight": 75.5,
    "bodyFat": 24.1,
    "muscleMass": 31.25,
    "bmi": 26.2,
    "staffName": "أخصائي التغذية",
    "fileUrl": "/uploads/inbody/result.pdf",
    "notes": null,
    "nutritionPlan": {
      "goal": "خسارة الوزن",
      "dailyCalories": 1800,
      "waterLiters": 3,
      "notes": "",
      "fileUrl": "club/nutrition/nutrition-20260722.pdf",
      "file": {
        "path": "club/nutrition/nutrition-20260722.pdf",
        "url": "/uploads/club/nutrition/nutrition-20260722.pdf",
        "fileName": "nutrition-20260722.pdf",
        "contentType": "application/pdf"
      },
      "meals": [
        { "name": "الإفطار", "time": "08:00", "foods": "2 بيضة وخبز", "notes": "بدون سكر" }
      ]
    }
  },
  "nutritionPlan": {
    "measurementId": 22,
    "measurementDate": "2026-07-21",
    "plan": {
      "goal": "خسارة الوزن",
      "dailyCalories": 1800,
      "waterLiters": 3,
      "notes": "",
      "fileUrl": "club/nutrition/nutrition-20260722.pdf",
      "file": {
        "path": "club/nutrition/nutrition-20260722.pdf",
        "url": "/uploads/club/nutrition/nutrition-20260722.pdf",
        "fileName": "nutrition-20260722.pdf",
        "contentType": "application/pdf"
      },
      "meals": []
    }
  },
  "measurements": []
}
```

`nutritionPlan` أعلى الاستجابة هو أحدث جدول تغذية مسجل، لتسهيل عرضه مباشرة في صفحة التغذية. كل عنصر داخل `measurements` يحتوي أيضًا جدول التغذية المرتبط بذلك القياس إن وُجد. الحقل `file` يكون `null` إذا لم يُرفع ملف، وإلا يحتوي `url` الجاهز للفتح أو التحميل مع اسم الملف ونوعه. إذا كان `url` نسبيًا أضيفي إليه دومين الـ backend فقط، بدون `/api`. للحصول على قياس واحد:

```text
GET /mobile/app/inbody-measurements/22
Authorization: Bearer ACCESS_TOKEN
```

إذا كان القياس لا يخص العضو الحالي ترجع الاستجابة `404` دون كشف بياناته.

لتغيير الصورة أرسل `multipart/form-data`، واسم حقل الملف هو `file`. الأنواع المدعومة JPG وPNG وWebP، والحد الأقصى 5MB:

```text
PATCH /mobile/app/profile/picture
Authorization: Bearer ACCESS_TOKEN
file: <image>
```

لتغيير كلمة المرور:

```json
PATCH /mobile/app/profile/password
{
  "currentPassword": "01001234567",
  "newPassword": "NewPassword123"
}
```

كلمة المرور الجديدة لا تقل عن 6 أحرف ويجب أن تختلف عن الحالية.

### إرسال شكوى

```json
{
  "type": "complaint",
  "subject": "ازدحام في وقت الذروة",
  "body": "برجاء مراجعة عدد الأجهزة المتاحة.",
  "memberName": "أحمد محمد",
  "memberId": 15,
  "branchId": 1
}
```

للاقتراح غيّر `type` إلى `suggestion`. الحقول `memberName` و`memberId` و`branchId` اختيارية. الشكوى تُحفظ كـ `complaint` والاقتراح كـ `feedback`، وكلاهما يظهر في شاشة «الشكاوى والاقتراحات» في السيستم.

### إرسال رأي عضو Feedback

```json
POST /mobile/app/feedback
{
  "memberName": "شهد محمد العنزي",
  "subject": "إشادة بالمدرب",
  "notes": "شكرًا لملاحظاتكم القيمة."
}
```

الحقول الثلاثة مطلوبة. يتم حفظ الرأي بحالة `open` ونوع `feedback` ليظهر مباشرة في شاشة «آراء الأعضاء».

### إرسال دعوة

```json
{
  "inviteeName": "محمد علي",
  "inviteePhone": "+201001234567",
  "inviteeGender": "male",
  "invitedById": 15,
  "invitedByName": "أحمد محمد",
  "visitDate": "2026-07-20",
  "branchId": 1,
  "notes": "زيارة تجريبية"
}
```

`inviteeName` فقط مطلوب. رقم الهاتف يجب أن يكون بصيغة دولية، والنوع `male` أو `female`، والتاريخ بصيغة `YYYY-MM-DD`.

## Response shapes

قوائم الإعلانات والعروض ترجع `{ "data": [...] }`. نجاح إرسال شكوى/اقتراح أو دعوة يرجع `success`, و`id`, و`status`, و`createdAt`. أخطاء التحقق ترجع HTTP 400 مع `statusCode` و`message`.

## Postman

استورد الملف `FIT90-Mobile-App.postman_collection.json`. المتغير `baseUrl` مضبوط على `http://localhost:4000/api` ويمكن تغييره من Variables داخل Collection.

## التعديلات المنفذة

- إضافة Mobile controller/service مستقلة لمحتوى التطبيق.
- إضافة تسجيل دخول وبروفايل آمن لعميل التطبيق باستخدام Customer JWT مستقل.
- إضافة رفع وتغيير صورة العميل وتحديثها في العضوية وحساب التطبيق.
- إضافة تغيير كلمة المرور مع التحقق من كلمة المرور الحالية وتخزين الجديدة مشفرة.
- قراءة الإعلانات والعروض من `club_content_items` مع إخفاء غير النشط والمحذوف.
- تخزين الشكاوى والاقتراحات في `club_tickets`.
- تخزين الدعوات في `club_invitations` بحالة `sent`.
- توسيع شاشة «الشكاوى والاقتراحات» لتعرض `complaint` و`feedback` معًا.
- إضافة DTO validation وrate limiting لمسارات الإرسال.
