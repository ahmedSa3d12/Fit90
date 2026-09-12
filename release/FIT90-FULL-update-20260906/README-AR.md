# FIT90 — Full update (2026-09-06)

يشمل هذا الأرشيف كل ملفات الكود الحالية في `backend` و`frontend`، إضافة إلى وثائق `docs`.

لا يشمل `.env` أو `node_modules` أو مخرجات البناء أو الملفات المرفوعة أو النسخ الاحتياطية.

نفّذي خطوات `TERMINAL-COMMANDS.txt` من حساب cPanel. بعد نجاحها، يطلب من مسؤول root تنفيذ الأوامر الموجودة في `ROOT-PM2-COMMAND.txt` لإعادة تشغيل خدمة FIT90 عبر PM2.

لا ينفذ هذا الإصدار أي أمر يغيّر قاعدة البيانات: لا `prisma db push` ولا migrations ولا import ولا seed.
