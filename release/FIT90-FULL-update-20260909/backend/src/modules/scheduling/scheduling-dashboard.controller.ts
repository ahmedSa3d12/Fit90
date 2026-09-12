import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { SchedulingDashboardService } from './scheduling-dashboard.service';

@UseGuards(JwtAuthGuard)
@Controller('scheduling/dashboard')
@RequiresPermission('club.fitness:view')
export class SchedulingDashboardController {
  constructor(private readonly service: SchedulingDashboardService) {}

  @Get()
  summary(
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Query('branchId') branchId: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.summary(
      {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        branchId: branchId ? parseInt(branchId, 10) : undefined,
      },
      user,
    );
  }
}
