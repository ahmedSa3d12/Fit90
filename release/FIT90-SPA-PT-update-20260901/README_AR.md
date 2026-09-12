# تحديث FIT90 — السبا والتدريب الشخصي

هذه الحزمة لتحديث تطبيق موجود بالفعل على السيرفر. لا تعدل `package.json`، ولا تستورد قاعدة البيانات، ولا تستبدل `.env` أو مجلد `uploads`.

## أوامر السيرفر

استبدلي `CPANEL_USER` و`APP_DIRECTORY` بالقيم الحقيقية:

```bash
cd ~
mkdir -p fit90-updates/2026-09-01
unzip FIT90-SPA-PT-update-20260901.zip -d fit90-updates/2026-09-01
cd fit90-updates/2026-09-01/FIT90-SPA-PT-update-20260901
bash deploy.sh /home/CPANEL_USER/APP_DIRECTORY
```

بعد ظهور رسالة النجاح، افتحي **Setup Node.js App** في cPanel واضغطي **Restart** إذا لم تتم إعادة التشغيل تلقائيًا.

## ملاحظات أمان

- السكربت يتحقق من وجود `.env` داخل التطبيق الحالي ويتوقف إذا لم يجده.
- السكربت يرفض أي حزمة تحتوي ملف بيئة.
- لا تشغّلي `backend/deploy.sh` لهذه الترقية؛ فهو ليس سكربت تحديث آمنًا لإصدار موجود.
