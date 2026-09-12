import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubClosingService } from './mos-closing.service';

@UseGuards(JwtAuthGuard)
@Controller('club-mos/closing')
@RequiresPermission('mos:view', 'club.members:view')
export class ClubClosingController {
  constructor(private readonly service: ClubClosingService) {}

  @Get('summary')
  summary(@Query('date') date: string, @Query('branchId') branchId?: string) {
    return this.service.summary(
      date,
      branchId != null && branchId !== '' ? Number(branchId) : null,
    );
  }

  @Get()
  list(@Query('branchId') branchId?: string) {
    return this.service.list(
      branchId != null && branchId !== '' ? Number(branchId) : null,
    );
  }

  @Post()
  @RequiresPermission('club.members:create')
  save(
    @Body()
    body: {
      closingDate: string;
      branchId?: number;
      totalCash?: number;
      totalCard?: number;
      totalOther?: number;
      notes?: string;
    },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.save({
      closingDate: body.closingDate,
      branchId: body.branchId ?? null,
      totalCash: body.totalCash,
      totalCard: body.totalCard,
      totalOther: body.totalOther,
      notes: body.notes ?? null,
      closedBy: user?.name ?? null,
    });
  }
}
