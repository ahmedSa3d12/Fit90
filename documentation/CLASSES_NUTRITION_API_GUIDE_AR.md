# دليل APIs الحصص والتغذية - تطبيق FIT90

**آخر تحديث:** 21 يوليو 2026  
**الجمهور المستهدف:** مطورو تطبيق الموبايل، فريق الـ Frontend، وفريق اختبار الـ API.

يوضح هذا الملف طريقة تسجيل دخول العميل، واستخدام Bearer Token، ثم استدعاء APIs الحصص والتغذية بالترتيب الصحيح، مع أمثلة للطلبات والاستجابات وحالات الحجز والانتظار والإلغاء.

---

## 1. عناوين الاتصال

### بيئة الإنتاج

```text
https://fit90.metacodex.com/api
```

### البيئة المحلية

```text
http://localhost:4000/api
```

على Android Emulator يستخدم التطبيق عادة:

```text
http://10.0.2.2:4000/api
```

في أمثلة هذا الدليل سنستخدم المتغير:

```text
{{baseUrl}}
```

---

## 2. تسجيل دخول العميل والتوكن

كل APIs الحصص والتغذية محمية بتوكن **عميل**. توكن الموظف أو مدير النظام لا يعمل معها.

### تسجيل الدخول

```http
POST {{baseUrl}}/mobile/app/login
Content-Type: application/json
```

### Body

```json
{
  "phone": "01001234567",
  "password": "CustomerPassword"
}
```

يجب استخدام `raw JSON`، وليس `form-data`.

### استجابة ناجحة

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "tokenType": "Bearer",
  "expiresIn": "2h"
}
```

يرسل التوكن في كل الطلبات التالية:

```text
Authorization: Bearer ACCESS_TOKEN
```

في Postman اختاري `Authorization > Bearer Token` والصقي قيمة `accessToken` فقط.

### حفظ التوكن تلقائيًا في Postman

ضعي السكربت التالي داخل تبويب `Tests` لطلب تسجيل الدخول:

```javascript
const json = pm.response.json();
if (json.accessToken) {
  pm.collectionVariables.set('customerToken', json.accessToken);
}
```

واستخدمي في بقية الطلبات:

```text
{{customerToken}}
```

> مهم: يجب أن يكون طلب تسجيل الدخول والطلبات الأخرى داخل نفس Postman Collection، لأن Collection Variable لا تنتقل تلقائيًا إلى Collection أخرى.

---

## 3. أكواد HTTP الشائعة

| الكود | المعنى | أشهر سبب |
|---|---|---|
| `200` | الطلب نجح | قراءة بيانات أو تسجيل دخول أو إلغاء ناجح |
| `201` | تم الإنشاء | إنشاء حجز في بعض المسارات |
| `400` | بيانات الطلب غير صحيحة | حقل ناقص أو نوع قيمة غير صحيح |
| `401` | غير مصرح | التوكن مفقود أو منتهي أو ليس توكن عميل |
| `403` | ممنوع | العضوية غير نشطة أو الحجز لا يخص العميل |
| `404` | غير موجود | رقم موعد أو حجز غير صحيح، أو الجدول غير منشور |
| `409` | تعارض | حجز مكرر، فترة الحجز مغلقة، أو الموعد بدأ |

---

# القسم الأول: APIs الحصص

المسار الأساسي:

```text
{{baseUrl}}/mobile/app/classes
```

## 4. تسلسل تشغيل الحصص

```text
تسجيل الدخول
    ↓
جلب أنواع الحصص
    ↓
جلب المدربين
    ↓
جلب الجدول الشهري
    ↓
عرض تفاصيل الموعد
    ↓
إنشاء الحجز
    ↓
عرض حجوزاتي أو إلغاء الحجز
```

هوية العضو تؤخذ من التوكن؛ لا يرسل التطبيق `memberId` في Body.

---

## 5. جلب أنواع الحصص

```http
GET {{baseUrl}}/mobile/app/classes/catalog
Authorization: Bearer {{customerToken}}
```

يعيد أنواع الحصص التي لديها جدول شهري منشور ومواعيد مستقبلية.

### مثال استجابة

```json
{
  "data": [
    {
      "id": 7,
      "name": "يوجا",
      "nameEn": "Yoga",
      "code": "YOGA"
    }
  ]
}
```

احفظي `id` في متغير مثل `classId`.

---

## 6. جلب مدربي الحصص

### كل المدربين الذين لديهم مواعيد منشورة

```http
GET {{baseUrl}}/mobile/app/classes/trainers
Authorization: Bearer {{customerToken}}
```

### مدربو نوع حصة محدد

```http
GET {{baseUrl}}/mobile/app/classes/trainers?classId=7
Authorization: Bearer {{customerToken}}
```

### مثال استجابة

```json
{
  "data": [
    {
      "id": 12,
      "name": "أحمد محمد",
      "specialization": "Fitness",
      "imageUrl": null
    }
  ]
}
```

---

## 7. جلب جدول حصص المدرب الشهري

```http
GET {{baseUrl}}/mobile/app/classes/schedule?trainerId=12&year=2026&month=7&classId=7
Authorization: Bearer {{customerToken}}
```

### Query Parameters

| الحقل | مطلوب | الوصف |
|---|---:|---|
| `trainerId` | نعم | رقم المدرب |
| `year` | نعم | السنة من 2000 إلى 2100 |
| `month` | نعم | الشهر من 1 إلى 12 |
| `classId` | لا | فلترة الجدول بنوع حصة محدد |

الاستجابة مجمعة حسب يوم القاهرة، وكل موعد يحتوي بيانات الحصة والمدرب والسعة والحجز الحالي للعضو.

### مثال مختصر

```json
{
  "trainer": {
    "id": 12,
    "name": "أحمد محمد",
    "specialization": "Fitness"
  },
  "year": 2026,
  "month": 7,
  "days": [
    {
      "date": "2026-07-25",
      "slots": [
        {
          "id": 150,
          "startAt": "2026-07-25T16:00:00.000Z",
          "endAt": "2026-07-25T17:00:00.000Z",
          "bookingStartAt": "2026-07-20T08:00:00.000Z",
          "bookingEndAt": "2026-07-25T15:00:00.000Z",
          "capacity": 10,
          "confirmedBookingsCount": 8,
          "remainingCapacity": 2,
          "class": {
            "id": 7,
            "name": "يوجا",
            "type": "YOGA"
          },
          "service": {
            "id": 7,
            "name": "يوجا",
            "category": "class"
          },
          "trainer": {
            "id": 12,
            "name": "أحمد محمد",
            "specialization": "Fitness"
          },
          "availability": {
            "status": "BOOKING_AVAILABLE",
            "canBook": true,
            "canJoinWaitlist": false
          },
          "freeSession": {
            "eligible": true,
            "remaining": 3,
            "classId": 7
          },
          "myBooking": null,
          "additionalServices": []
        }
      ]
    }
  ]
}
```

### حالات `availability.status`

| الحالة | معناها | الإجراء في التطبيق |
|---|---|---|
| `BOOKING_AVAILABLE` | يوجد مكان والحجز مفتوح | إظهار زر حجز |
| `WAITLIST_ONLY` | السعة مكتملة | إظهار زر الانضمام للانتظار |
| `BOOKING_NOT_STARTED` | موعد فتح الحجز لم يأتِ | تعطيل زر الحجز |
| `BOOKING_WINDOW_NOT_CONFIGURED` | فترة الحجز غير محددة | تعطيل الحجز |
| `BOOKING_CLOSED` | فترة الحجز انتهت | تعطيل الحجز |
| `CLASS_STARTED` | الحصة بدأت | تعطيل الحجز والإلغاء |
| `UNAVAILABLE` | الموعد غير متاح | عدم السماح بالحجز |
| `CANCELLED` | الموعد ملغي | عرض الحالة فقط |

---

## 8. تفاصيل موعد حصة واحدة

```http
GET {{baseUrl}}/mobile/app/classes/slots/150
Authorization: Bearer {{customerToken}}
```

يعيد نفس بيانات الموعد الموجودة داخل الجدول الشهري، بما فيها `availability` و`myBooking` و`freeSession`.

---

## 9. إنشاء حجز حصة

```http
POST {{baseUrl}}/mobile/app/classes/bookings
Authorization: Bearer {{customerToken}}
Content-Type: application/json
```

### Body

```json
{
  "slotId": 150
}
```

### عند وجود مكان

```json
{
  "id": 501,
  "status": "confirmed",
  "code": "BOOKING_CONFIRMED",
  "message": "تم تأكيد حجز الحصة بنجاح.",
  "waitlistPosition": null,
  "class": {
    "id": 7,
    "name": "يوجا",
    "type": "YOGA"
  },
  "trainer": {
    "id": 12,
    "name": "أحمد محمد"
  }
}
```

### عند اكتمال السعة

```json
{
  "id": 502,
  "status": "wait",
  "code": "CLASS_FULL_WAITLISTED",
  "message": "اكتملت سعة الحصة وتمت إضافتك إلى قائمة الانتظار.",
  "waitlistPosition": 2
}
```

النظام ينشئ حجز انتظار حقيقي بدل رفض الطلب. كما يقفل سجل الموعد أثناء الحجز لمنع عميلين من أخذ آخر مكان في نفس اللحظة.

---

## 10. جلب حجوزات الحصص الخاصة بالعميل

```http
GET {{baseUrl}}/mobile/app/classes/bookings/my?scope=upcoming
Authorization: Bearer {{customerToken}}
```

### Query Parameters

| الحقل | القيم |
|---|---|
| `scope` | `upcoming` افتراضيًا، أو `past`، أو `all` |
| `status` | `confirmed` أو `wait` أو `cancelled` أو `completed` أو `no_show` |

مثال لعرض قائمة الانتظار فقط:

```http
GET {{baseUrl}}/mobile/app/classes/bookings/my?status=wait&scope=upcoming
```

كل حجز بحالة `wait` يحتوي `waitlistPosition`.

---

## 11. إلغاء حجز حصة

```http
PATCH {{baseUrl}}/mobile/app/classes/bookings/501/cancel
Authorization: Bearer {{customerToken}}
```

لا يحتاج Body.

### مثال استجابة

```json
{
  "code": "BOOKING_CANCELLED",
  "message": "تم إلغاء الحجز بنجاح.",
  "promotedBookingId": 503
}
```

إذا كان الحجز الملغي مؤكدًا، يؤكد النظام تلقائيًا أقدم حجز في قائمة الانتظار ويرسل إشعارًا للعضو الذي تم تصعيده.

لا يمكن الإلغاء بعد بدء الحصة أو بعد انتهاء فترة الإلغاء.

---

## 12. إشعارات حجوزات الحصص

```http
GET {{baseUrl}}/mobile/app/classes/notifications
Authorization: Bearer {{customerToken}}
```

يعيد أحدث 50 إشعارًا مرتبطًا بحجوزات العضو، مثل تأكيد حجز كان في قائمة الانتظار.

```json
{
  "data": [
    {
      "id": 91,
      "type": "booking_confirmed",
      "bookingId": 503,
      "title": "تم تأكيد حجزك",
      "message": "أصبح الموعد متاحًا وتم تأكيد حجزك.",
      "status": "pending",
      "createdAt": "2026-07-21T08:00:00.000Z"
    }
  ]
}
```

---

# القسم الثاني: APIs التغذية

التغذية تستخدم محرك المواعيد الموحد. المسار الأساسي:

```text
{{baseUrl}}/mobile/app/appointments
```

في جميع طلبات هذا القسم تكون:

```text
category=nutrition
```

نفس المحرك يدعم `spa` و`personal_training` عند تغيير قيمة `category`.

## 13. تسلسل تشغيل التغذية

```text
تسجيل الدخول
    ↓
جلب خدمات التغذية
    ↓
جلب مقدمي الخدمة
    ↓
جلب الجدول الشهري
    ↓
عرض تفاصيل الموعد
    ↓
إنشاء الحجز
    ↓
عرض حجوزاتي أو إلغاء الحجز
```

---

## 14. جلب خدمات التغذية

```http
GET {{baseUrl}}/mobile/app/appointments/services?category=nutrition
Authorization: Bearer {{customerToken}}
```

يعيد الخدمات المفعلة التي لديها جدول شهري منشور ومواعيد مستقبلية.

### مثال استجابة

```json
{
  "data": [
    {
      "id": 8,
      "name": "متابعة تغذية",
      "category": "nutrition",
      "description": "جلسة متابعة مع أخصائي التغذية",
      "durationMin": 60,
      "price": "250.00"
    }
  ]
}
```

---

## 15. جلب أخصائيي التغذية للخدمة

```http
GET {{baseUrl}}/mobile/app/appointments/trainers?category=nutrition&serviceId=8
Authorization: Bearer {{customerToken}}
```

`serviceId` اختياري، لكن يفضل إرساله لعرض مقدمي الخدمة المرتبطين بالخدمة المختارة فقط.

### مثال استجابة

```json
{
  "data": [
    {
      "id": 10,
      "name": "سارة محمد",
      "specialization": "Nutrition",
      "imageUrl": null
    }
  ]
}
```

---

## 16. جلب جدول التغذية الشهري

```http
GET {{baseUrl}}/mobile/app/appointments/schedule?category=nutrition&serviceId=8&trainerId=10&year=2026&month=7
Authorization: Bearer {{customerToken}}
```

### Query Parameters

| الحقل | مطلوب | الوصف |
|---|---:|---|
| `category` | نعم | قيمته `nutrition` |
| `serviceId` | نعم | رقم خدمة التغذية |
| `trainerId` | نعم | رقم أخصائي التغذية أو مقدم الخدمة |
| `year` | نعم | السنة من 2000 إلى 2100 |
| `month` | نعم | الشهر من 1 إلى 12 |

### مثال مختصر

```json
{
  "category": "nutrition",
  "service": {
    "id": 8,
    "name": "متابعة تغذية",
    "category": "nutrition"
  },
  "trainer": {
    "id": 10,
    "name": "سارة محمد",
    "specialization": "Nutrition",
    "imageUrl": null
  },
  "year": 2026,
  "month": 7,
  "days": [
    {
      "date": "2026-07-25",
      "slots": [
        {
          "id": 201,
          "date": "2026-07-25",
          "startTime": "18:00:00",
          "endTime": "19:00:00",
          "bookingStartAt": "2026-07-20T08:00:00.000Z",
          "bookingEndAt": "2026-07-25T17:00:00.000Z",
          "capacity": 4,
          "bookedCount": 3,
          "remainingCapacity": 1,
          "availability": {
            "status": "BOOKING_AVAILABLE",
            "canBook": true,
            "canJoinWaitlist": false
          },
          "service": {
            "id": 8,
            "name": "متابعة تغذية",
            "category": "nutrition"
          },
          "trainer": {
            "id": 10,
            "name": "سارة محمد",
            "specialization": "Nutrition",
            "imageUrl": null
          },
          "myBooking": null
        }
      ]
    }
  ]
}
```

إذا لم يوجد جدول منشور لنفس الخدمة ومقدم الخدمة والشهر والسنة، تكون الاستجابة `404`.

### حالات الإتاحة

| الحالة | معناها |
|---|---|
| `BOOKING_AVAILABLE` | الحجز مفتوح ويوجد مكان |
| `WAITLIST_ONLY` | السعة مكتملة ويمكن دخول الانتظار |
| `BOOKING_NOT_STARTED` | فترة الحجز لم تبدأ |
| `BOOKING_CLOSED` | فترة الحجز انتهت |
| `BOOKING_WINDOW_NOT_CONFIGURED` | فتح وغلق الحجز غير محددين |
| `APPOINTMENT_STARTED` | الموعد بدأ |

---

## 17. تفاصيل موعد تغذية واحد

```http
GET {{baseUrl}}/mobile/app/appointments/slots/201
Authorization: Bearer {{customerToken}}
```

يعيد بيانات الموعد والخدمة وأخصائي التغذية والسعة وحالة الإتاحة وحجز العميل الحالي.

---

## 18. إنشاء حجز تغذية

```http
POST {{baseUrl}}/mobile/app/appointments/bookings
Authorization: Bearer {{customerToken}}
Content-Type: application/json
```

### Body

```json
{
  "scheduleId": 201
}
```

### حجز مؤكد

```json
{
  "id": 601,
  "bookingNumber": "BK-3AB94668",
  "status": "confirmed",
  "code": "BOOKING_CONFIRMED",
  "message": "تم تأكيد الحجز بنجاح.",
  "waitlistPosition": null,
  "service": {
    "id": 8,
    "name": "متابعة تغذية",
    "category": "nutrition"
  },
  "trainer": {
    "id": 10,
    "name": "سارة محمد",
    "specialization": "Nutrition",
    "imageUrl": null
  },
  "schedule": {
    "id": 201,
    "date": "2026-07-25",
    "startTime": "18:00:00",
    "endTime": "19:00:00"
  }
}
```

### عند اكتمال الموعد

```json
{
  "id": 602,
  "status": "wait",
  "code": "SERVICE_FULL_WAITLISTED",
  "message": "اكتملت سعة الموعد وتمت إضافتك إلى قائمة الانتظار.",
  "waitlistPosition": 1
}
```

لا يرسل التطبيق اسم العضو أو رقمه؛ النظام يستخرجهما من التوكن.

---

## 19. جلب حجوزات التغذية الخاصة بالعميل

```http
GET {{baseUrl}}/mobile/app/appointments/bookings/my?category=nutrition&scope=upcoming
Authorization: Bearer {{customerToken}}
```

### Query Parameters

| الحقل | القيم |
|---|---|
| `category` | `nutrition`، ويمكن حذفه لجلب تغذية وسبا وتدريب شخصي معًا |
| `scope` | `upcoming` افتراضيًا، أو `past`، أو `all` |
| `status` | `pending` أو `confirmed` أو `wait` أو `completed` أو `cancelled` أو `no_show` |

### مثال استجابة

```json
{
  "data": [
    {
      "id": 601,
      "bookingNumber": "BK-3AB94668",
      "status": "confirmed",
      "waitlistPosition": null,
      "service": {
        "id": 8,
        "name": "متابعة تغذية",
        "category": "nutrition"
      },
      "trainer": {
        "id": 10,
        "name": "سارة محمد",
        "specialization": "Nutrition",
        "imageUrl": null
      },
      "schedule": {
        "id": 201,
        "date": "2026-07-25",
        "startTime": "18:00:00",
        "endTime": "19:00:00"
      },
      "createdAt": "2026-07-21T08:30:00.000Z"
    }
  ]
}
```

---

## 20. إلغاء حجز تغذية

```http
PATCH {{baseUrl}}/mobile/app/appointments/bookings/601/cancel
Authorization: Bearer {{customerToken}}
```

لا يحتاج Body.

```json
{
  "id": 601,
  "status": "cancelled",
  "code": "BOOKING_CANCELLED",
  "message": "تم إلغاء الحجز بنجاح.",
  "promotedBookingId": 602,
  "service": {
    "id": 8,
    "name": "متابعة تغذية",
    "category": "nutrition"
  }
}
```

إذا ألغي حجز مؤكد، يؤكد النظام أقدم عضو في الانتظار. لا يمكن إلغاء حجز يخص عضوًا آخر، أو حجز مكتمل، أو موعد بدأ بالفعل، أو بعد انتهاء فترة الإلغاء.

---

## 21. منطق الحجز والانتظار

### عند الضغط على حجز

1. يتحقق النظام من صحة العميل والعضوية.
2. يتحقق من أن الجدول الشهري منشور.
3. يتحقق من أن الموعد متاح ولم يبدأ.
4. يتحقق من فترة فتح وغلق الحجز.
5. يمنع تكرار الحجز لنفس العضو والموعد.
6. يقفل سجل الموعد داخل Transaction لمنع تعارض الحجز المتزامن.
7. إذا كان العدد أقل من السعة ينشئ `confirmed`.
8. إذا اكتملت السعة ينشئ `wait` ويعيد `waitlistPosition`.

### عند الإلغاء

1. يتحقق النظام أن الحجز يخص العميل الحالي.
2. يتحقق أن الإلغاء ما زال مسموحًا.
3. يغير الحالة إلى `cancelled`.
4. إذا كان الحجز مؤكدًا، يؤكد أقدم حجز انتظار تلقائيًا.
5. ينشئ إشعارًا للعضو الذي تم تصعيده.

---

## 22. حالات الحجز

| الحالة | معناها |
|---|---|
| `pending` | قيد المراجعة، وتظهر في محرك المواعيد الموحد |
| `confirmed` | الحجز مؤكد ويستهلك مكانًا |
| `wait` | العضو في قائمة الانتظار ولا يستهلك مكانًا مؤكدًا |
| `completed` | تم حضور أو إكمال الموعد |
| `cancelled` | الحجز ملغي |
| `no_show` | العضو لم يحضر |

---

## 23. إعداد متغيرات Postman المقترحة

| المتغير | مثال |
|---|---|
| `baseUrl` | `https://fit90.metacodex.com/api` |
| `customerToken` | يملأ تلقائيًا بعد Login |
| `classId` | `7` |
| `trainerId` | `12` |
| `slotId` | `150` |
| `bookingId` | `501` |
| `appointmentCategory` | `nutrition` |
| `appointmentServiceId` | `8` |
| `appointmentTrainerId` | `10` |
| `appointmentScheduleId` | `201` |
| `appointmentBookingId` | `601` |
| `scheduleYear` | `2026` |
| `scheduleMonth` | `7` |

---

## 24. فحص سريع عند ظهور مشكلة

### `401 Unauthorized`

- شغلي Login من نفس Collection.
- تأكدي أن `customerToken` ليس فارغًا.
- تأكدي أن التوكن لم يتجاوز ساعتين.
- لا تستخدمي توكن موظف أو مدير نظام.

### `400 Bad Request`

- استخدمي `raw JSON` في طلبات POST.
- تأكدي من كتابة `slotId` أو `scheduleId` كرقم.
- تأكدي من وجود كل Query Parameters المطلوبة.

### `404 Not Found`

- تأكدي أن الجدول الشهري منشور.
- تأكدي أن الشهر والسنة والمدرب والخدمة متطابقون.
- تأكدي أن الموعد لم يحذف أو يلغَ.

### `409 Conflict`

- ربما يوجد حجز سابق لنفس العضو والموعد.
- ربما لم تبدأ فترة الحجز أو انتهت.
- ربما بدأ الموعد بالفعل.
- اقرأ `message` لمعرفة السبب المحدد.

---

## 25. ملفات مرجعية داخل المشروع

- Postman Collection: `documentation/FIT90-Mobile-App.postman_collection.json`
- توثيق الحصص المختصر: `documentation/mobile-class-booking-api.md`
- توثيق المواعيد المختصر: `documentation/mobile-appointments-api.md`
- Controller الحصص: `backend/src/modules/mobile/mobile-class-bookings.controller.ts`
- Controller التغذية والمواعيد: `backend/src/modules/mobile/mobile-appointments.controller.ts`

