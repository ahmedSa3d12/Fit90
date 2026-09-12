import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { basename, extname, resolve, sep } from 'path';

const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

@Injectable()
export class WhatsappCloudService {
  constructor(private readonly config: ConfigService) {}

  private credentials() {
    const accessToken = this.config.get<string>('whatsapp.accessToken');
    const phoneNumberId = this.config.get<string>('whatsapp.phoneNumberId');
    const graphVersion = this.config.get<string>('whatsapp.graphVersion') ?? 'v23.0';
    if (!accessToken || !phoneNumberId) {
      throw new ServiceUnavailableException(
        'إرسال واتساب المباشر غير مُعد. أضيفي WHATSAPP_ACCESS_TOKEN وWHATSAPP_PHONE_NUMBER_ID في إعدادات الخادم.',
      );
    }
    return { accessToken, phoneNumberId, graphVersion };
  }

  private normalizePhone(value: string | null | undefined) {
    let digits = String(value ?? '').replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.startsWith('0')) digits = `20${digits.slice(1)}`;
    if (digits.length < 8) throw new BadRequestException('لا يوجد رقم هاتف صحيح مسجل لهذا العضو');
    return digits;
  }

  private uploadedFile(fileUrl: string) {
    const uploadRoot = resolve(
      process.cwd(),
      this.config.get<string>('uploadDir') ?? './uploads',
    );
    const publicBase = this.config.get<string>('publicUploadBase') ?? '/uploads';
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(fileUrl, 'http://fit90.local').pathname);
    } catch {
      throw new BadRequestException('مسار ملف التغذية غير صحيح');
    }
    const normalizedBase = `/${publicBase.replace(/^\/+|\/+$/g, '')}`;
    const relative = pathname.startsWith(`${normalizedBase}/`)
      ? pathname.slice(normalizedBase.length + 1)
      : pathname.replace(/^\/+/, '');
    const absolute = resolve(uploadRoot, relative);
    if (absolute !== uploadRoot && !absolute.startsWith(`${uploadRoot}${sep}`)) {
      throw new BadRequestException('مسار ملف التغذية غير مسموح');
    }
    if (!existsSync(absolute)) throw new BadRequestException('ملف التغذية المرفوع غير موجود');
    return { absolute, filename: basename(absolute) };
  }

  private async metaRequest(url: string, init: RequestInit) {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      const nested = body?.error as Record<string, unknown> | undefined;
      const message = typeof nested?.message === 'string' ? nested.message : 'تعذر الإرسال عبر واتساب';
      throw new BadGatewayException(`فشل إرسال واتساب: ${message}`);
    }
    return body ?? {};
  }

  async sendUploadedDocument(input: {
    phone: string | null | undefined;
    fileUrl: string;
    caption: string;
  }) {
    const { accessToken, phoneNumberId, graphVersion } = this.credentials();
    const phone = this.normalizePhone(input.phone);
    const file = this.uploadedFile(input.fileUrl);
    const bytes = await readFile(file.absolute);
    const contentType = CONTENT_TYPES[extname(file.filename).toLowerCase()] ?? 'application/octet-stream';
    const baseUrl = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}`;

    const mediaForm = new FormData();
    mediaForm.append('messaging_product', 'whatsapp');
    mediaForm.append('type', contentType);
    mediaForm.append('file', new Blob([bytes], { type: contentType }), file.filename);
    const uploaded = await this.metaRequest(`${baseUrl}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: mediaForm,
    });
    const mediaId = uploaded.id;
    if (typeof mediaId !== 'string') throw new BadGatewayException('لم يرجع واتساب معرفًا للمرفق');

    const sent = await this.metaRequest(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'document',
        document: { id: mediaId, filename: file.filename, caption: input.caption.slice(0, 1024) },
      }),
    });
    const messages = sent.messages as Array<{ id?: string }> | undefined;
    return { sent: true, messageId: messages?.[0]?.id ?? null };
  }

  async sendTextMessage(input: {
    phone: string | null | undefined;
    message: string;
  }) {
    const { accessToken, phoneNumberId, graphVersion } = this.credentials();
    const phone = this.normalizePhone(input.phone);
    const message = String(input.message ?? '').trim();
    if (!message) throw new BadRequestException('اكتبي نص الرسالة أولًا');
    if (message.length > 4096) {
      throw new BadRequestException('نص رسالة واتساب يجب ألا يتجاوز 4096 حرفًا');
    }

    const sent = await this.metaRequest(
      `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone,
          type: 'text',
          text: { preview_url: false, body: message },
        }),
      },
    );
    const messages = sent.messages as Array<{ id?: string }> | undefined;
    return { sent: true, messageId: messages?.[0]?.id ?? null };
  }
}
