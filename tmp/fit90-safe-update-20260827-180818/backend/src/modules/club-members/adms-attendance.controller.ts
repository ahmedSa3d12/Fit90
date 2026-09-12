import { Body, Controller, Get, Header, HttpCode, Post, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { AdmsAttendanceService } from './adms-attendance.service';

@Public()
@Controller('iclock')
export class AdmsAttendanceController {
  constructor(private readonly service: AdmsAttendanceService) {}

  @Get('cdata')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  handshake(@Query('SN') serial = '') {
    this.service.assertDeviceAllowed(serial);
    return [
      `GET OPTION FROM: ${serial}`,
      'Stamp=9999',
      'OpStamp=9999',
      'ErrorDelay=60',
      'Delay=30',
      'TransTimes=00:00;14:05',
      'TransInterval=1',
      'TransFlag=1111000000',
      'Realtime=1',
      'Encrypt=0',
    ].join('\n');
  }

  @Post('cdata')
  @HttpCode(200)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async upload(
    @Query('SN') serial = '',
    @Query('table') table: string | undefined,
    @Body() body: unknown,
  ) {
    const result = await this.service.ingest(serial, table, body);
    return `OK: ${result.received}`;
  }

  @Get('getrequest')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  getRequest(@Query('SN') serial = '') {
    this.service.assertDeviceAllowed(serial);
    return 'OK';
  }

  @Post('devicecmd')
  @HttpCode(200)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  deviceCommand(@Query('SN') serial = '') {
    this.service.assertDeviceAllowed(serial);
    return 'OK';
  }

  @Get('registry')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  registry(@Query('SN') serial = '') {
    this.service.assertDeviceAllowed(serial);
    return 'OK';
  }
}
