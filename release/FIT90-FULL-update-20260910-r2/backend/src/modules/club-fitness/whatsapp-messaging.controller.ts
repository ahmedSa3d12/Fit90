import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WhatsappCloudService } from './whatsapp-cloud.service';

@UseGuards(JwtAuthGuard)
@Controller('whatsapp/messages')
@RequiresPermission('mos:view', 'club.members:view')
export class WhatsappMessagingController {
  constructor(private readonly whatsapp: WhatsappCloudService) {}

  @Post('text')
  sendText(@Body() body: { phone?: string; message?: string }) {
    return this.whatsapp.sendTextMessage({
      phone: body.phone,
      message: body.message ?? '',
    });
  }
}
