import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { MosReportsService } from './mos-reports.service';
import { ListMosReportDto } from './dto/list-mos-entity.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-mos/reports')
@RequiresPermission('mos:view', 'club.members:view')
export class MosReportsController {
  constructor(private readonly service: MosReportsService) {}

  @Get()
  listAvailable() {
    return this.service.listAvailable();
  }

  @Get(':key')
  run(@Param('key') key: string, @Query() q: ListMosReportDto) {
    return this.service.run(key, q);
  }
}
