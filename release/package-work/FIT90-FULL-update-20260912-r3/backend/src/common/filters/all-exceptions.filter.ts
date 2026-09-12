import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

const TRANSLATED_ERROR_MESSAGES: Record<string, { ar: string; en: string }> = {
  APPOINTMENT_CAPACITY_FULL: {
    ar: 'العدد اكتمل، اختر موعدًا آخر.',
    en: 'Capacity is full. Please choose another appointment.',
  },
  PERSONAL_TRAINING_SUBSCRIPTION_UNAVAILABLE: {
    ar: 'لا توجد اشتراكات تدريب شخصي متاحة.',
    en: 'No personal-training subscriptions are available.',
  },
  APPOINTMENT_SELECTION_REQUIRED: {
    ar: 'اختر الخدمة والموعد أولاً.',
    en: 'Select a service and appointment time first.',
  },
  APPOINTMENT_WINDOW_NOT_FOUND: {
    ar: 'الموعد غير موجود أو غير منشور.',
    en: 'The appointment is unavailable or has not been published.',
  },
  APPOINTMENT_PLAN_NOT_FOUND: {
    ar: 'الجدول الشهري غير موجود أو غير منشور.',
    en: 'The monthly schedule is unavailable or has not been published.',
  },
  MEMBER_ACCOUNT_INACTIVE: {
    ar: 'حساب العضو غير نشط أو غير مرتبط بالعضوية.',
    en: 'The member account is inactive or is not linked to an active membership.',
  },
  APPOINTMENT_CANCELLATION_FORBIDDEN: {
    ar: 'لا يمكنك إلغاء هذا الحجز.',
    en: 'You cannot cancel this booking.',
  },
};

/** Normalizes every error to `{ statusCode, message }` with an Arabic-friendly message. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'حدث خطأ غير متوقع';
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const errorBody = body as { message?: string | string[]; code?: string };
        message = errorBody.message ?? exception.message;
        code = errorBody.code;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        const target = (exception.meta as { target?: string | string[] } | undefined)?.target;
        const uniqueTarget = (Array.isArray(target) ? target.join(',') : String(target ?? '')).toLowerCase();
        if (uniqueTarget.includes('member_code')) {
          message = 'تعذّر توليد كود عضو فريد، يرجى إعادة المحاولة';
        } else if (uniqueTarget.includes('phone')) {
          message = 'رقم الهاتف مُسجّل لعضو آخر';
        } else if (uniqueTarget.includes('subscription_number')) {
          message = 'رقم الاشتراك مُسجّل مسبقًا، يرجى إعادة المحاولة';
        } else if (uniqueTarget.includes('receipt_number')) {
          message = 'رقم الإيصال مُسجّل مسبقًا، يرجى إعادة المحاولة';
        } else {
          message = 'القيمة مُسجّلة مسبقًا';
        }
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'العنصر غير موجود';
      } else {
        status = HttpStatus.BAD_REQUEST;
        message = 'خطأ في قاعدة البيانات';
      }
    }

    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    if (code && TRANSLATED_ERROR_MESSAGES[code]) {
      const language = String(req.headers['accept-language'] ?? '').toLowerCase().startsWith('en') ? 'en' : 'ar';
      message = TRANSLATED_ERROR_MESSAGES[code][language];
    }

    res.status(status).json({ statusCode: status, ...(code ? { code } : {}), message });
  }
}
