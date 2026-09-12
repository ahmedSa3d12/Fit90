# دليل API السبا والتدريب الشخصي - تطبيق FIT90

هذا الدليل مخصص لمهندس تطبيق الموبايل. تم فصل المسارين مع الاحتفاظ بنفس منطق الحجز والسعة وقائمة الانتظار المستخدم في التغذية.

## 1. المصادقة

كل الطلبات التالية تحتاج توكن عميل:

```http
Authorization: Bearer {{customerToken}}
```

يتم الحصول عليه من:

```http
POST {{baseUrl}}/mobile/app/login
Content-Type: application/json

{
  "phone": "01001234567",
  "password": "CUSTOMER_PASSWORD"
}
```

## 2. المسارات الأساسية

| القسم | Base path |
|---|---|
| السبا | `{{baseUrl}}/mobile/app/spa` |
| التدريب الشخصي | `{{baseUrl}}/mobile/app/personal-training` |

لا يتم إرسال `category` في المسارات الجديدة؛ السيرفر يثبت القسم تلقائيًا ويمنع حجز أو إلغاء موعد تابع لقسم آخر.

## 3. دورة التشغيل في التطبيق

1. جلب الخدمات.
2. اختيار الخدمة ثم جلب مقدمي الخدمة أو المدربين.
3. اختيار مقدم الخدمة والشهر ثم جلب الجدول الشهري.
4. فتح تفاصيل الموعد عند ضغط المستخدم عليه.
5. إرسال طلب الحجز.
6. إذا كانت السعة متاحة تكون الحالة `confirmed`، وإذا اكتملت السعة تكون `wait` مع ترتيب الانتظار.
7. عرض حجوزات العميل أو إلغاء الحجز.

---

## 4. API السبا

### جلب خدمات السبا

```http
GET {{baseUrl}}/mobile/app/spa/services
Authorization: Bearer {{customerToken}}
```

### جلب مقدمي خدمة السبا

```http
GET {{baseUrl}}/mobile/app/spa/trainers?serviceId={{spaServiceId}}
Authorization: Bearer {{customerToken}}
```

`serviceId` اختياري، لكن يفضل إرساله بعد اختيار الخدمة.

### جلب الجدول الشهري للسبا

```http
GET {{baseUrl}}/mobile/app/spa/schedule?serviceId={{spaServiceId}}&trainerId={{spaTrainerId}}&year=2026&month=7
Authorization: Bearer {{customerToken}}
```

### تفاصيل موعد سبا

```http
GET {{baseUrl}}/mobile/app/spa/slots/{{spaScheduleId}}
Authorization: Bearer {{customerToken}}
```

### حجز موعد سبا

```http
POST {{baseUrl}}/mobile/app/spa/bookings
Authorization: Bearer {{customerToken}}
Content-Type: application/json

{
  "scheduleId": 201
}
```

### حجوزات السبا الخاصة بالعميل

```http
GET {{baseUrl}}/mobile/app/spa/bookings/my?scope=upcoming
Authorization: Bearer {{customerToken}}
```

الـQuery Parameters الاختيارية:

| الحقل | القيم |
|---|---|
| `scope` | `upcoming` أو `past` أو `all` |
| `status` | `pending` أو `confirmed` أو `wait` أو `completed` أو `cancelled` أو `no_show` |

### إلغاء حجز سبا

```http
PATCH {{baseUrl}}/mobile/app/spa/bookings/{{spaBookingId}}/cancel
Authorization: Bearer {{customerToken}}
```

---

## 5. API التدريب الشخصي

### جلب خدمات التدريب الشخصي

```http
GET {{baseUrl}}/mobile/app/personal-training/services
Authorization: Bearer {{customerToken}}
```

### جلب المدربين الشخصيين

```http
GET {{baseUrl}}/mobile/app/personal-training/trainers?serviceId={{personalTrainingServiceId}}
Authorization: Bearer {{customerToken}}
```

### جلب الجدول الشهري للتدريب الشخصي

```http
GET {{baseUrl}}/mobile/app/personal-training/schedule?serviceId={{personalTrainingServiceId}}&trainerId={{personalTrainingTrainerId}}&year=2026&month=7
Authorization: Bearer {{customerToken}}
```

### تفاصيل موعد تدريب شخصي

```http
GET {{baseUrl}}/mobile/app/personal-training/slots/{{personalTrainingScheduleId}}
Authorization: Bearer {{customerToken}}
```

### حجز تدريب شخصي

```http
POST {{baseUrl}}/mobile/app/personal-training/bookings
Authorization: Bearer {{customerToken}}
Content-Type: application/json

{
  "scheduleId": 301
}
```

### حجوزات التدريب الشخصي الخاصة بالعميل

```http
GET {{baseUrl}}/mobile/app/personal-training/bookings/my?scope=upcoming
Authorization: Bearer {{customerToken}}
```

يدعم نفس قيم `scope` و`status` الموضحة في قسم السبا.

### إلغاء حجز تدريب شخصي

```http
PATCH {{baseUrl}}/mobile/app/personal-training/bookings/{{personalTrainingBookingId}}/cancel
Authorization: Bearer {{customerToken}}
```

---

## 6. شكل استجابة الحجز

### عند وجود سعة

```json
{
  "id": 601,
  "bookingNumber": "BK-3AB94668",
  "status": "confirmed",
  "code": "BOOKING_CONFIRMED",
  "waitlistPosition": null,
  "service": {
    "id": 8,
    "name": "Massage",
    "category": "spa"
  },
  "trainer": {
    "id": 10,
    "name": "Service Provider"
  },
  "schedule": {
    "id": 201,
    "date": "2026-07-25",
    "startTime": "18:00:00",
    "endTime": "19:00:00"
  }
}
```

### عند اكتمال السعة

```json
{
  "id": 602,
  "status": "wait",
  "code": "SERVICE_FULL_WAITLISTED",
  "waitlistPosition": 1
}
```

الحجز لا يفشل عند اكتمال العدد؛ يتم إنشاؤه بحالة `wait`. عند إلغاء حجز مؤكد، يتم تصعيد أقدم عضو في الانتظار تلقائيًا إلى `confirmed`.

## 7. حالات الإتاحة التي يعتمد عليها التطبيق

| status | التصرف المقترح في التطبيق |
|---|---|
| `BOOKING_AVAILABLE` | إظهار زر الحجز |
| `WAITLIST_ONLY` | إظهار زر الانضمام للانتظار |
| `BOOKING_NOT_STARTED` | تعطيل الحجز وإظهار موعد فتحه |
| `BOOKING_CLOSED` | تعطيل الحجز |
| `BOOKING_WINDOW_NOT_CONFIGURED` | تعطيل الحجز |
| `APPOINTMENT_STARTED` | تعطيل الحجز والإلغاء |

## 8. أهم الأخطاء

| HTTP | المعنى |
|---|---|
| `400` | بيانات أو Query Parameters غير صحيحة |
| `401` | التوكن غير موجود أو منتهي أو ليس توكن عميل |
| `403` | محاولة إلغاء حجز لا يخص العميل |
| `404` | الخدمة أو الجدول أو الموعد غير موجود، أو لا ينتمي للمسار الحالي |
| `409` | يوجد حجز سابق، أو انتهت فترة الحجز أو الإلغاء |

## 9. Postman

استوردي الملف:

```text
documentation/FIT90-Mobile-App.postman_collection.json
```

ثم شغلي `Customer login` أولًا. ستجدي مجموعتين مستقلتين:

- `SPA - Dedicated API`
- `Personal Training - Dedicated API`

طلبات Postman تحفظ تلقائيًا معرف الخدمة والمدرب والموعد والحجز لاستخدامها في الخطوة التالية.
