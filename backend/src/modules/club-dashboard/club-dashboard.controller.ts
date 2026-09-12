import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubDashboardService } from './club-dashboard.service';

@UseGuards(JwtAuthGuard)
@Controller('club-dashboard')
@RequiresPermission('club.dashboard:view')
export class ClubDashboardController {
  constructor(private readonly service: ClubDashboardService) {}

  @Get('treasury')
  treasury(@Query('date') date?: string) {
    return this.service.treasury(date);
  }

  @Get('summary')
  summary(
    @CurrentUser() user?: JwtUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.summary({ startDate, endDate, branchId }, user);
  }
}
