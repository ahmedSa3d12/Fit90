# FIT90 — Full update (2026-09-06, r3)

هذه النسخة تحل محل r2 وتحتوي كل تعديلات الكود الحالية في `backend` و`frontend`، إضافة إلى وثائق `docs`.

لا يشمل الأرشيف `.env` أو `node_modules` أو مخرجات البناء أو الملفات المرفوعة أو النسخ الاحتياطية.

من حساب cPanel نفّذي `TERMINAL-COMMANDS.txt`. بعد نجاحه، يطلب من مسؤول root تنفيذ `ROOT-PM2-COMMAND.txt` لإعادة تشغيل خدمة FIT90 عبر PM2.

لا ينفذ هذا الإصدار أي أمر يغيّر قاعدة البيانات: لا `prisma db push` ولا migrations ولا import ولا seed.
