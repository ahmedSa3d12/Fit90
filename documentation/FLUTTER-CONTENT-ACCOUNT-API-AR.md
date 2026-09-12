# واجهات Flutter: المحتوى والحساب

عنوان التجربة المحلي:

```text
http://localhost:4000/api
```

على Android Emulator استخدم `http://10.0.2.2:4000/api`. المسارات التي تحمل علامة **Token** تحتاج:

```text
Authorization: Bearer ACCESS_TOKEN
```

يمكن الحصول على التوكن من `POST /mobile/app/login`.

## ملخص المسارات

| الوظيفة | Method | Path | الصلاحية |
|---|---|---|---|
| الأسئلة الشائعة | GET | `/mobile/app/faqs` | Public |
| التمارين | GET | `/mobile/app/exercises` | Public |
| تفاصيل تمرين | GET | `/mobile/app/exercises/:id` | Public |
| الشروط والأحكام | GET | `/mobile/app/terms-and-conditions` | Public |
| سياسة الخصوصية | GET | `/mobile/app/privacy-policy` | Public |
| عن التطبيق | GET | `/mobile/app/about` | Public |
| قائمة المدربين | GET | `/mobile/app/trainers?branchId=1` | Public |
| أنواع الاشتراكات | GET | `/mobile/app/subscription-types?branchId=1` | Public |
| تفاصيل نوع اشتراك | GET | `/mobile/app/subscription-types/:id?branchId=1` | Public |
| رصيد النقاط | GET | `/mobile/app/points` | Token |
| سجل النقاط | GET | `/mobile/app/points/history?limit=50` | Token |
| اشتراكاتي | GET | `/mobile/app/subscriptions` | Token |
| سجل الإيقاف/التجميد | GET | `/mobile/app/subscriptions/freeze-history` | Token |
| إشعاراتي | GET | `/mobile/app/notifications?limit=50` | Token |
| تعليم إشعار كمقروء | PATCH | `/mobile/app/notifications/:id/read` | Token |
| تعليم كل الإشعارات كمقروءة | PATCH | `/mobile/app/notifications/read-all` | Token |
| حذف حساب التطبيق | DELETE | `/mobile/app/account` | Token + Password |

لا ترسل `memberId` في أي طلب شخصي؛ السيرفر يستخرج العضو من الـ JWT لمنع الوصول إلى بيانات عضو آخر.

## المحتوى العام

قوائم الأسئلة والتمارين ترجع:

```json
{
  "data": [
    {
      "id": 12,
      "title": "كيف يمكنني تجميد اشتراكي؟",
      "body": "يمكن طلب التجميد من الاستقبال.",
      "imageUrl": null,
      "sortOrder": 1,
      "branchId": null,
      "metadata": null,
      "createdAt": "2026-07-23T12:00:00.000Z",
      "updatedAt": "2026-07-23T12:00:00.000Z"
    }
  ]
}
```

`GET /mobile/app/exercises/:id` يرجع العنصر مباشرة، ويرجع `404` إذا كان العنصر غير موجود أو غير نشط أو محذوف.

الشروط والأحكام ترجع قائمة البنود:

```json
{
  "data": [
    {
      "id": 30,
      "title": "شروط استخدام النادي",
      "body": "النص...",
      "sortOrder": 1,
      "updatedAt": "2026-07-23T12:00:00.000Z"
    }
  ],
  "updatedAt": "2026-07-23T12:00:00.000Z"
}
```

سياسة الخصوصية ترجع وثيقة واحدة أو `null` إذا لم تتم إضافتها بعد:

```json
{
  "data": {
    "id": 31,
    "title": "سياسة الخصوصية",
    "body": "النص...",
    "metadata": { "documentType": "privacy_policy" }
  },
  "updatedAt": "2026-07-23T12:00:00.000Z"
}
```

تُدار السياسة في نفس مصدر «الشروط والأحكام». يجب وضع:

```json
{ "documentType": "privacy_policy" }
```

داخل `metadata` حتى يفصلها السيرفر عن بنود الشروط. يدعم السيرفر أيضًا التعرف على عنوان يحتوي «خصوص» أو `privacy`.

## عن التطبيق

```text
GET /mobile/app/about
```

يعرض العناصر النشطة المدخلة من شاشة «عن التطبيق» في لوحة الإدارة:

```json
{
  "data": [
    {
      "id": 40,
      "title": "عن FIT90",
      "body": "النص التعريفي...",
      "imageUrl": "/uploads/about/fit90.jpg",
      "sortOrder": 1,
      "branchId": null,
      "metadata": { "documentType": "about_app" },
      "createdAt": "2026-07-25T10:00:00.000Z",
      "updatedAt": "2026-07-25T10:00:00.000Z"
    }
  ],
  "updatedAt": "2026-07-25T10:00:00.000Z"
}
```

## قائمة المدربين

```text
GET /mobile/app/trainers
GET /mobile/app/trainers?branchId=2
```

القائمة تعرض الموظفين النشطين فقط عندما يكون المسمى الوظيفي بالضبط `مدرب` أو `مدرب لياقة`. `branchId` اختياري.

```json
{
  "data": [
    {
      "id": 7,
      "employeeId": 25,
      "name": "أحمد محمد",
      "jobTitle": "مدرب لياقة",
      "specialization": "مدرب لياقة",
      "experience": "5 سنوات",
      "bio": "مدرب معتمد...",
      "imageUrl": "/uploads/trainers/25.jpg",
      "rating": 4.5,
      "branchId": 2
    }
  ],
  "count": 1
}
```

## النقاط

تُثبّت نقاط الباقة داخل سجل الحركات عند إنشاء الاشتراك أو تجديده. لذلك تغيير نقاط الباقة مستقبلًا لا يغيّر الرصيد التاريخي للعضو.

```text
GET /mobile/app/points
Authorization: Bearer ACCESS_TOKEN
```

```json
{
  "memberId": 15,
  "balance": 250,
  "totalEarned": 300,
  "totalRedeemed": 50
}
```

ولعرض أحدث الحركات:

```text
GET /mobile/app/points/history?limit=50
Authorization: Bearer ACCESS_TOKEN
```

`limit` من 1 إلى 100، والقيمة الافتراضية 50.

```json
{
  "data": [
    {
      "id": 81,
      "points": 300,
      "direction": "credit",
      "transactionType": "earn",
      "source": "subscription_purchase",
      "description": "نقاط اشتراك اشتراك 3 شهور",
      "subscription": {
        "id": 101,
        "number": "SUB-20101",
        "type": "اشتراك 3 شهور"
      },
      "createdAt": "2026-07-25T10:00:00.000Z"
    }
  ],
  "count": 1
}
```

## أنواع الاشتراكات

```text
GET /mobile/app/subscription-types
GET /mobile/app/subscription-types?branchId=2
```

`branchId` اختياري. يعرض المسار الأنواع النشطة التي تم تفعيل «هل يظهر في التطبيق؟» لها، والمتاحة حاليًا حسب تاريخ بداية ونهاية الإتاحة. عند إرسال الفرع تظهر الباقات العامة وباقات هذا الفرع فقط.

```json
{
  "data": [
    {
      "id": 3,
      "name": "اشتراك 3 شهور",
      "nameAr": "اشتراك 3 شهور",
      "nameEn": "Quarterly",
      "description": "باقة لياقة متكاملة",
      "price": 3000,
      "minimumPrice": null,
      "packageCategory": "regular",
      "packageType": null,
      "duration": {
        "value": 3,
        "type": "months",
        "days": 90
      },
      "specialOffer": false,
      "forStudents": false,
      "walletPoints": 300,
      "availableForAllBranches": true,
      "branchIds": [],
      "availability": {
        "from": null,
        "to": null,
        "offerValidUntil": null
      }
    }
  ],
  "count": 1
}
```

لجلب كل تفاصيل النوع:

```text
GET /mobile/app/subscription-types/3
GET /mobile/app/subscription-types/3?branchId=2
```

الاستجابة تحتوي الحقول السابقة بالإضافة إلى:

```json
{
  "included": {
    "invitations": 2,
    "inbodyMeasurements": 1,
    "spaSessions": 1
  },
  "sessions": {
    "enabled": false,
    "count": null
  },
  "attendance": {
    "count": null,
    "allowMultipleDailyEntries": false,
    "maxClassesPerDay": null
  },
  "freeze": {
    "enabled": true,
    "maximumTimes": 2,
    "minimumDays": 3
  },
  "validUpgradeDuration": null,
  "accessAreaIds": [],
  "benefits": {},
  "weekPlanner": {},
  "createdAt": "2026-07-01T00:00:00.000Z",
  "updatedAt": "2026-07-01T00:00:00.000Z"
}
```

يرجع السيرفر `404` إذا كان النوع غير موجود، أو غير نشط، أو غير ظاهر في التطبيق، أو غير متاح للفرع المطلوب.

## اشتراكاتي

```text
GET /mobile/app/subscriptions
Authorization: Bearer ACCESS_TOKEN
```

```json
{
  "data": [
    {
      "id": 101,
      "number": "SUB-20101",
      "type": "اشتراك 3 شهور",
      "typeId": 3,
      "registrationDate": "2026-07-01",
      "startDate": "2026-07-01",
      "endDate": "2026-09-28",
      "status": "active",
      "value": 3000,
      "discountValue": 200,
      "paidAmount": 2800,
      "remainingAmount": 0,
      "sessions": null,
      "benefits": null,
      "freeBenefitNotes": null,
      "package": {
        "days": 90,
        "visitsCount": null,
        "freezeAllowed": true,
        "maxFreezeTimes": 2
      },
      "activeFreeze": null,
      "createdAt": "2026-07-01T08:00:00.000Z",
      "updatedAt": "2026-07-01T08:00:00.000Z"
    }
  ],
  "count": 1
}
```

## سجل الإيقاف

```text
GET /mobile/app/subscriptions/freeze-history
Authorization: Bearer ACCESS_TOKEN
```

```json
{
  "data": [
    {
      "id": 8,
      "startDate": "2026-07-10",
      "endDate": "2026-07-17",
      "plannedDays": 7,
      "actualDays": 7,
      "originalSubscriptionEndDate": "2026-09-28",
      "reason": "سفر",
      "active": false,
      "subscription": {
        "id": 101,
        "number": "SUB-20101",
        "type": "اشتراك 3 شهور"
      },
      "createdAt": "2026-07-10T08:00:00.000Z",
      "updatedAt": "2026-07-17T08:00:00.000Z"
    }
  ],
  "count": 1
}
```

## الإشعارات

`limit` اختياري من 1 إلى 100، والقيمة الافتراضية 50.

```json
{
  "data": [
    {
      "id": 55,
      "source": "personal",
      "type": "booking_confirmed",
      "title": "Booking confirmed",
      "message": "تم تأكيد الحجز",
      "imageUrl": null,
      "read": false,
      "bookingId": 14,
      "scheduleId": 4,
      "sentAt": "2026-07-23T13:00:00.000Z",
      "createdAt": "2026-07-23T13:00:00.000Z"
    }
  ],
  "count": 1,
  "unreadCount": 1
}
```

`source` تكون `personal` للإشعارات الموجهة للعضو، أو `broadcast` للإشعارات العامة للفرع. مسارات تعليم المقروء تطبق على الإشعارات الشخصية فقط؛ حالة قراءة الإشعارات العامة يمكن حفظها محليًا في التطبيق.

## حذف الحساب

```http
DELETE /mobile/app/account
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json
```

```json
{
  "password": "CurrentPassword"
}
```

عند النجاح:

```json
{
  "success": true,
  "message": "تم حذف حساب التطبيق بنجاح"
}
```

الحذف يعطل حساب التطبيق ويمسح بيانات الدخول ويرفع ارتباطه بالعضو. لا يحذف السجلات المالية أو الاشتراكات من نظام إدارة النادي. بعد نجاح الطلب يجب أن يمسح Flutter التوكن وبيانات الجلسة المحلية وينقل المستخدم إلى شاشة تسجيل الدخول.
